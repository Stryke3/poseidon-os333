#!/usr/bin/env bash
# =============================================================================
# do_prod_cutover_do_only.sh
# Single-entrypoint DigitalOcean production cutover.
#
# Responsibilities (in strict order, each one gates the next):
#   1. Preflight: repo guards (no Render regressions, no placeholder secrets)
#   2. Env validation: strict production env checks
#   3. Build: docker compose build
#   4. Migrate: run production migrations against the intended DB
#   5. Up: docker compose up -d
#   6. Healthcheck: probe every service
#   7. Summary: pass/fail report
#
# Idempotent: safe to re-run. Fails loudly on any step; does not proceed
# silently. No silent fallbacks. No mock data.
#
# Environment:
#   SKIP_MIGRATIONS=1   Skip running production migrations (not recommended)
#   SKIP_FRONTEND_BUILD_CHECK=1   Skip verify_deploy_readiness frontend build
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

STATUS_FILE="$(mktemp -t poseidon-cutover-XXXXXX)"
trap 'rm -f "${STATUS_FILE}"' EXIT

pass() { printf '  [PASS] %s\n' "$1"; echo "pass $1" >>"${STATUS_FILE}"; }
fail() { printf '  [FAIL] %s\n' "$1" >&2; echo "fail $1" >>"${STATUS_FILE}"; exit_code=1; }
step() { printf '\n=== %s ===\n' "$1"; }

exit_code=0

# ---------------------------------------------------------------------------
# Step 1 — Preflight repo guards
# ---------------------------------------------------------------------------
step "Step 1 — Preflight repo guards"
if bash scripts/audit_no_render_left.sh >/dev/null 2>&1; then
  pass "no Render references in tracked files"
else
  bash scripts/audit_no_render_left.sh || true
  fail "Render references present in tracked files"
fi

if bash scripts/check_container_pins.sh >/dev/null 2>&1; then
  pass "container images pinned"
else
  fail "container images not pinned"
fi

# ---------------------------------------------------------------------------
# Step 2 — Strict env validation
# ---------------------------------------------------------------------------
step "Step 2 — Strict production env validation"
if [[ ! -f .env ]]; then
  fail ".env missing — copy .env.template to .env and fill production secrets"
else
  if bash scripts/validate_production_env.sh; then
    pass "env validation"
  else
    fail "env validation failed (see above)"
  fi
fi

# ---------------------------------------------------------------------------
# Step 3 — Compose syntax + build
# ---------------------------------------------------------------------------
step "Step 3 — Compose config + build"
if command -v docker >/dev/null 2>&1; then
  if docker compose config -q; then
    pass "docker compose config"
  else
    fail "docker compose config invalid"
  fi
  if [[ "${exit_code}" -eq 0 ]]; then
    if docker compose build; then
      pass "docker compose build"
    else
      fail "docker compose build failed"
    fi
  fi
else
  fail "docker binary not found on PATH"
fi

# Optionally run the frontend production build as an extra guardrail.
if [[ "${SKIP_FRONTEND_BUILD_CHECK:-0}" != "1" && "${exit_code}" -eq 0 ]]; then
  if bash scripts/verify_deploy_readiness.sh --strict-env >/tmp/poseidon-verify.out 2>&1; then
    pass "verify_deploy_readiness --strict-env"
  else
    cat /tmp/poseidon-verify.out >&2 || true
    fail "verify_deploy_readiness --strict-env"
  fi
fi

# ---------------------------------------------------------------------------
# Step 4 — Migrate (safe, idempotent)
# ---------------------------------------------------------------------------
step "Step 4 — Production migrations"
if [[ "${SKIP_MIGRATIONS:-0}" == "1" ]]; then
  pass "migrations skipped via SKIP_MIGRATIONS=1"
elif [[ "${exit_code}" -eq 0 ]]; then
  if bash scripts/run_production_migrations.sh; then
    pass "run_production_migrations.sh"
  else
    fail "run_production_migrations.sh"
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 — docker compose up -d
# ---------------------------------------------------------------------------
step "Step 5 — Start stack"
if [[ "${exit_code}" -eq 0 ]]; then
  if docker compose up -d; then
    pass "docker compose up -d"
  else
    fail "docker compose up -d"
  fi
fi

# Give services time to become healthy (healthchecks are 30s interval by default).
if [[ "${exit_code}" -eq 0 ]]; then
  printf '  waiting for healthy state (up to 90s) ...\n'
  for _ in $(seq 1 18); do
    sleep 5
    if docker compose ps --format json 2>/dev/null | grep -q '"Health":"starting"'; then
      continue
    fi
    break
  done
fi

# ---------------------------------------------------------------------------
# Step 6 — Healthchecks
# ---------------------------------------------------------------------------
step "Step 6 — Service health probes (from droplet)"

probe() {
  local name="$1"
  local url="$2"
  local host_header="${3:-}"
  local cmd=(curl -fsS --max-time 8)
  if [[ -n "${host_header}" ]]; then
    cmd+=(-H "Host: ${host_header}")
  fi
  cmd+=("${url}")
  if "${cmd[@]}" >/dev/null 2>&1; then
    pass "${name}"
  else
    fail "${name} (${url})"
  fi
}

probe "nginx /healthz"           "http://127.0.0.1/healthz"
probe "core /ready"              "http://127.0.0.1:8001/ready"    "api.strykefox.com"
probe "trident /ready (via nginx)"   "http://127.0.0.1/trident-api/ready" "trident.strykefox.com"
probe "intake /ready (via nginx)"    "http://127.0.0.1/intake-api/ready"  "intake.strykefox.com"
probe "ml /ready (via nginx)"        "http://127.0.0.1/ml-api/ready"      "ml.strykefox.com"
probe "edi /health"              "http://127.0.0.1:8006/health"
probe "availity /live (via nginx)"   "http://127.0.0.1/availity-api/live" "dashboard.strykefox.com"
probe "dashboard /api/health"    "http://127.0.0.1/api/health"   "dashboard.strykefox.com"

# ---------------------------------------------------------------------------
# Step 7 — Summary
# ---------------------------------------------------------------------------
step "Summary"
pass_count="$(grep -c '^pass ' "${STATUS_FILE}" || true)"
fail_count="$(grep -c '^fail ' "${STATUS_FILE}" || true)"
printf 'Passed: %s\nFailed: %s\n' "${pass_count:-0}" "${fail_count:-0}"

if [[ "${fail_count:-0}" -gt 0 ]]; then
  echo
  echo "Failed steps:"
  grep '^fail ' "${STATUS_FILE}" | sed 's/^fail /  - /'
  echo
  echo "Cutover NOT complete."
  exit 1
fi

echo
echo "Cutover complete. Next:"
echo "  - Verify Cloudflare DNS points *.strykefox.com to this droplet."
echo "  - Run: bash scripts/audit_no_render_pointers.sh"
echo "  - Review docs/OPERATIONS_STATUS.md for monitoring cadence."
