#!/usr/bin/env bash
set -euo pipefail

HOSTS=(
  "api.strykefox.com"
  "dashboard.strykefox.com"
  "trident.strykefox.com"
  "intake.strykefox.com"
  "ml.strykefox.com"
  "edi.strykefox.com"
)

failures=0

echo "Checking DNS and HTTP headers for Render pointers..."
echo

for host in "${HOSTS[@]}"; do
  echo "=== ${host} ==="

  dns="$(dig +short "${host}")"
  if [[ -z "${dns}" ]]; then
    echo "DNS: missing"
    failures=$((failures + 1))
  else
    echo "DNS:"
    echo "${dns}" | sed 's/^/  /'
    if echo "${dns}" | grep -qiE "onrender\\.com|origin\\.onrender\\.com|render\\.com"; then
      echo "Result: FAIL (Render DNS target still present)"
      failures=$((failures + 1))
    fi
  fi

  headers="$(curl -sS -I --max-time 8 "https://${host}/" || true)"
  if [[ -n "${headers}" ]]; then
    echo "Headers:"
    echo "${headers}" | grep -iE "^(HTTP|server:|cf-ray:|rndr-id:|x-powered-by:|location:)" | sed 's/^/  /' || true
    if echo "${headers}" | grep -qiE "^rndr-id:"; then
      echo "Result: FAIL (Render origin header detected)"
      failures=$((failures + 1))
    fi
  else
    echo "Headers: unavailable"
    failures=$((failures + 1))
  fi

  echo
done

if [[ "${failures}" -gt 0 ]]; then
  echo "Audit failed: ${failures} issue(s) found."
  exit 1
fi

echo "Audit passed: no Render pointers detected."
