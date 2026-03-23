#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${ROOT_DIR}/frontend"

RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
BLUE='\033[0;34m'
WHITE='\033[1;37m'
NC='\033[0m'

header() { printf "\n${BLUE}======================================${NC}\n${WHITE}%s${NC}\n${BLUE}======================================${NC}\n" "$1"; }
ok() { printf "${GREEN}  OK${NC} %s\n" "$1"; }
warn() { printf "${GOLD}  WARN${NC} %s\n" "$1"; }
fail() { printf "${RED}  FAIL${NC} %s\n" "$1" >&2; exit 1; }
info() { printf "${BLUE}  ->${NC} %s\n" "$1"; }

[[ -d "${APP_DIR}" ]] || fail "Expected frontend app at ${APP_DIR}"
[[ -f "${APP_DIR}/package.json" ]] || fail "Missing frontend/package.json"

header "POSEIDON DEPLOY"
ok "Repo root: ${ROOT_DIR}"
ok "Deploy root: ${APP_DIR}"

command -v node >/dev/null 2>&1 || fail "Node is required"
command -v npm >/dev/null 2>&1 || fail "npm is required"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  fail "Node 18+ required, found $(node -v)"
fi
ok "Node $(node -v)"
ok "npm $(npm -v)"

if git -C "${ROOT_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
  ok "Git repo detected"
else
  warn "No git repo detected at the repo root"
fi

if command -v vercel >/dev/null 2>&1; then
  ok "Vercel CLI available"
else
  fail "Vercel CLI is not installed. Run: npm install -g vercel"
fi

header "CLEAN BUILD"
rm -rf "${APP_DIR}/.next" "${APP_DIR}/.turbo" "${APP_DIR}/tsconfig.tsbuildinfo" "${APP_DIR}/.swc"
ok "Cleared frontend build artifacts"

if [[ ! -d "${APP_DIR}/node_modules" || "${APP_DIR}/package-lock.json" -nt "${APP_DIR}/node_modules" ]]; then
  info "Installing frontend dependencies"
  (
    cd "${APP_DIR}"
    npm ci
  )
  ok "Dependencies installed"
else
  ok "Existing node_modules looks current"
fi

[[ -x "${APP_DIR}/node_modules/.bin/next" ]] || fail "frontend dependencies are incomplete; run npm ci in frontend/"

header "PRODUCTION BUILD"
(
  cd "${APP_DIR}"
  npm run build
)
ok "Next.js production build succeeded"

[[ -d "${APP_DIR}/.next" ]] || fail "frontend/.next missing after build"

header "ENVIRONMENT"
if [[ -f "${APP_DIR}/.env.local" ]]; then
  ok "frontend/.env.local present"
else
  fail "Missing frontend/.env.local. Create it with production values before deployment."
fi

if grep -Eiq 'CHANGE_ME|replace_with_|your_key_here' "${APP_DIR}/.env.local"; then
  fail "frontend/.env.local still contains placeholder values"
fi
ok "frontend/.env.local passed placeholder check"

header "READINESS CHECK"
(
  cd "${ROOT_DIR}"
  bash scripts/verify_deploy_readiness.sh
)
ok "Local deploy-readiness verification passed"

header "VERCEL DEPLOY"
if [[ -f "${APP_DIR}/.vercel/project.json" ]]; then
  ok "Vercel project is linked under frontend/.vercel"
else
  warn "frontend/.vercel/project.json not found. Vercel may prompt to link the project."
fi

(
  cd "${APP_DIR}"
  vercel --prod --yes
)

header "POST DEPLOY"
# vercel ls can exit non-zero under set -e; still print the production URL from the deploy step above.
raw_json=""
raw_json="$(cd "${APP_DIR}" && vercel ls --json 2>/dev/null)" || raw_json="[]"
[[ -z "${raw_json}" ]] && raw_json="[]"
DEPLOY_URL="$(
  printf '%s' "${raw_json}" | node -e '
    const chunks = [];
    process.stdin.on("data", (d) => chunks.push(d));
    process.stdin.on("end", () => {
      try {
        const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const list = Array.isArray(raw) ? raw : raw.deployments || [];
        const latest = list[0];
        process.stdout.write(latest && latest.url ? `https://${latest.url}` : "");
      } catch {
        process.stdout.write("");
      }
    });
  '
)"

if [[ -n "${DEPLOY_URL}" ]]; then
  ok "Latest deployment: ${DEPLOY_URL}"
else
  warn "Deployment completed, but I could not parse the latest URL from 'vercel ls --json'"
fi

printf "\n"
ok "Build validated"
ok "Frontend deployed from frontend/"
warn "If this is a Docker-hosted release instead of Vercel, use docker compose for dashboard/nginx instead"
