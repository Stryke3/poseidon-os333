#!/usr/bin/env bash
# =============================================================================
# audit_no_render_left.sh
# Fails if any active Render reference remains in tracked repo files.
#
# Scope:
#   - Tracked files only (git ls-files). Untracked / ignored paths are skipped.
#   - Documentation files listed in ALLOWED_HISTORICAL are allowed to reference
#     Render for historical context only.
#   - Every other match is a failure.
#
# Canonical production target is DigitalOcean droplet + docker compose + nginx.
# There should be no live Render pointers in this repo.
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PATTERN='render\.com|onrender|rndr-id|RENDER_|render\.yaml'

# Historical archive files may mention Render; they are explicitly deprecated
# and not part of the live production path.
ALLOWED_HISTORICAL=(
  "POSEIDON_GROUND_TRUTH.md"
  "POSEIDON_ALL_FOUR.md"
  "POSEIDON_FIX.md"
)

# Files whose matches are genuinely unrelated to the Render platform and are
# kept (audited) so the word "render" in a different sense does not false-fail.
#   services/core/main.py           → _render_pod_package_pdf / _render_order_pdf
#   services/shared/base.py         → TLS auto-add for managed DB hostnames (render.com is one)
#   scripts/build_manual_pdf.py     → render_table helper
#   scripts/audit_no_render_pointers.sh → the sibling DNS audit (by design)
#   scripts/audit_no_render_left.sh → this script (by design)
UNRELATED_HITS=(
  "services/core/main.py"
  "services/shared/base.py"
  "scripts/build_manual_pdf.py"
  "scripts/audit_no_render_pointers.sh"
  "scripts/audit_no_render_left.sh"
)

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

is_allowed() {
  local path="$1"
  local entry
  for entry in "${ALLOWED_HISTORICAL[@]}" "${UNRELATED_HITS[@]}"; do
    if [[ "${path}" == "${entry}" ]]; then
      return 0
    fi
  done
  return 1
}

command -v git >/dev/null 2>&1 || fail "git is required"
command -v grep >/dev/null 2>&1 || fail "grep is required"

# All tracked files. We inspect every one; binaries are -I skipped.
# (macOS default bash 3.x does not support mapfile; use a portable while-read.)
tracked=()
while IFS= read -r line; do
  tracked+=("$line")
done < <(git ls-files)

violations=()
for file in "${tracked[@]}"; do
  # Skip non-existent (submodule) paths.
  [[ -f "${file}" ]] || continue
  # Skip obvious binary/large vendor paths.
  case "${file}" in
    frontend/vendor/*|*/node_modules/*|*/dist/*|*.jpeg|*.JPEG|*.png|*.pdf|*.zip|*.ico)
      continue
      ;;
  esac
  if is_allowed "${file}"; then
    continue
  fi
  if grep -InIE "${PATTERN}" "${file}" >/dev/null 2>&1; then
    violations+=("${file}")
  fi
done

if [[ "${#violations[@]}" -gt 0 ]]; then
  printf 'Active Render references found in tracked files:\n' >&2
  for file in "${violations[@]}"; do
    printf '\n--- %s ---\n' "${file}" >&2
    grep -nIE "${PATTERN}" "${file}" >&2 || true
  done
  fail "Remove Render references above. Canonical target is DigitalOcean compose + nginx."
fi

echo "audit_no_render_left.sh: PASS (no active Render references in tracked files)"
