#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
OUT="$ROOT/_audit_output"
TS="$(date +%Y%m%d_%H%M%S)"
REPORT="$OUT/report_$TS.txt"

mkdir -p "$OUT"

have_rg=0
if command -v rg >/dev/null 2>&1; then
  have_rg=1
fi

log() {
  printf "\n==== %s ====\n" "$1" | tee -a "$REPORT"
}

dump_cmd() {
  local title="$1"
  shift
  log "$title"
  {
    echo "\$ $*"
    "$@"
  } >>"$REPORT" 2>&1 || true
}

dump_find() {
  local title="$1"
  local path="$2"
  local pattern="$3"
  log "$title"
  find "$path" -type f -name "$pattern" 2>/dev/null | sort >>"$REPORT" || true
}

dump_rg() {
  local title="$1"
  shift
  log "$title"
  if [ "$have_rg" -eq 1 ]; then
    rg -n --hidden --glob '!node_modules' --glob '!.next' --glob '!dist' --glob '!build' --glob '!venv' --glob '!.git' "$@" "$ROOT" >>"$REPORT" 2>&1 || true
  else
    echo "ripgrep not installed; skipping" >>"$REPORT"
  fi
}

echo "POSEIDON / STRYKEFOX AUDIT REPORT - $TS" >"$REPORT"
echo "ROOT: $ROOT" >>"$REPORT"

dump_cmd "PWD" pwd
dump_cmd "GIT STATUS" git -C "$ROOT" status --short
dump_cmd "TOP LEVEL" ls -la "$ROOT"

log "TOP-LEVEL DIRECTORIES"
find "$ROOT" -maxdepth 2 -type d \
  ! -path '*/node_modules*' \
  ! -path '*/.git*' \
  ! -path '*/.next*' \
  ! -path '*/dist*' \
  ! -path '*/build*' \
  ! -path '*/venv*' \
  | sort >>"$REPORT"

dump_find "PACKAGE FILES" "$ROOT" "package.json"
dump_find "PYPROJECT FILES" "$ROOT" "pyproject.toml"
dump_find "REQUIREMENTS FILES" "$ROOT" "requirements*.txt"
dump_find "DOCKERFILES" "$ROOT" "Dockerfile*"
dump_find "COMPOSE FILES" "$ROOT" "docker-compose*.yml"
dump_find "COMPOSE FILES YAML" "$ROOT" "docker-compose*.yaml"
dump_find "NGINX FILES" "$ROOT" "*.conf"
dump_find "ENV FILES" "$ROOT" ".env*"

dump_rg "SERVICE/PORT REFERENCES" '8001|8002|8003|8004|8005|8006|3000|nginx|uvicorn|next start|next dev'
dump_rg "FASTAPI APP DECLARATIONS" 'FastAPI\('
dump_rg "NEXT ROUTE HANDLERS / API" 'route\.ts|route\.js|app/api|pages/api'
dump_rg "HEALTH ENDPOINTS" 'health|healthz|ready|readiness|liveness'
dump_rg "AUTH MIDDLEWARE / NEXTAUTH / JWT" 'nextauth|NextAuth|middleware|jwt|session|auth'
dump_rg "SWO / DWO / ADDENDUM / PDF / HTML" 'SWO|DWO|addendum|pdf|weasyprint|playwright|puppeteer|wkhtml|jinja|html'
dump_rg "UPLOAD / PARSE / OCR" 'upload|multipart|formData|OCR|ocr|parse|parser|intake'
dump_rg "STORAGE / MINIO / S3 / ARTIFACT" 'minio|s3|artifact|artifacts|bucket|presign|storage'
dump_rg "EDI / CLAIMS / CMS1500 / STEDI" 'edi|837|1500|cms1500|stedi|claim'
dump_rg "MOCK DATA / STATIC JSON / PLACEHOLDER" 'mock|fixture|placeholder|fake data|dummy'
dump_rg "FETCH / AXIOS / API CLIENTS" 'fetch\(|axios|apiClient|baseURL|NEXT_PUBLIC'
dump_rg "RAW HTML RENDER RISKS" 'dangerouslySetInnerHTML|innerHTML|innerText|textContent|pre>|code>|escape|escaped'
dump_rg "PDF RESPONSE / CONTENT-TYPE" 'application/pdf|Content-Type|content-type|send_file|FileResponse|StreamingResponse'
dump_rg "Nginx proxy_pass" 'proxy_pass|upstream|location /'
dump_rg "ENV VARIABLE USAGE" 'process\.env|os\.environ|getenv|BaseSettings|pydantic-settings'

# File excerpts for quick inspection
log "COMPOSE FILE CONTENTS"
find "$ROOT" \( -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' \) -type f 2>/dev/null | while read -r f; do
  echo -e "\n--- FILE: $f ---" >>"$REPORT"
  sed -n '1,240p' "$f" >>"$REPORT" 2>&1 || true
done

log "NGINX CONFIG CONTENTS"
find "$ROOT" -type f \( -name '*.conf' -o -path '*/nginx/*' \) 2>/dev/null | while read -r f; do
  echo -e "\n--- FILE: $f ---" >>"$REPORT"
  sed -n '1,240p' "$f" >>"$REPORT" 2>&1 || true
done

log "PACKAGE.JSON CONTENTS"
find "$ROOT" -type f -name 'package.json' 2>/dev/null | while read -r f; do
  echo -e "\n--- FILE: $f ---" >>"$REPORT"
  sed -n '1,220p' "$f" >>"$REPORT" 2>&1 || true
done

log "PYPROJECT / REQUIREMENTS CONTENTS"
find "$ROOT" -type f \( -name 'pyproject.toml' -o -name 'requirements*.txt' \) 2>/dev/null | while read -r f; do
  echo -e "\n--- FILE: $f ---" >>"$REPORT"
  sed -n '1,220p' "$f" >>"$REPORT" 2>&1 || true
done

cat <<EOF >>"$REPORT"

==== NEXT STEPS ====
1. Paste this report into ChatGPT.
2. If services already run via docker compose, also send:
   - docker compose ps
   - docker compose logs --tail=200
3. If dashboard is live, include:
   - failing page URL
   - screenshot of HTML-coded SWO output
   - sample API response payload for the broken document endpoint
EOF

echo "Audit written to: $REPORT"
