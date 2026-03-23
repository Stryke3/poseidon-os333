#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

failures=()

check_line() {
  local file="$1"
  local line_number="$2"
  local image_ref="$3"
  local source_kind="$4"

  local tag="${image_ref##*:}"
  if [[ "$image_ref" != *:* ]]; then
    failures+=("${file}:${line_number}: image has no explicit tag: ${image_ref}")
    return
  fi

  if [[ "$tag" == "latest" || "$tag" == "alpine" || "$tag" == "slim" ]]; then
    failures+=("${file}:${line_number}: floating tag is not allowed: ${image_ref}")
    return
  fi

  if [[ "$source_kind" == "dockerfile" && "$tag" =~ ^[0-9]+(\.[0-9]+)?-(alpine|slim)$ ]]; then
    failures+=("${file}:${line_number}: tag is not specific enough: ${image_ref}")
    return
  fi
}

scan_dockerfiles() {
  while IFS= read -r dockerfile; do
    n=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      n=$((n + 1))
      if [[ "$line" =~ ^FROM[[:space:]]+([^[:space:]]+) ]]; then
        printf '%s\t%s\t%s\n' "$dockerfile" "$n" "${BASH_REMATCH[1]}"
      fi
    done <"$dockerfile"
  done < <(
    find "${ROOT_DIR}/services" "${ROOT_DIR}/frontend" \( -name 'Dockerfile' -o -name 'Dockerfile.*' \) -type f 2>/dev/null
  )
}

while IFS=$'\t' read -r file line_number image_ref; do
  [[ -n "$file" ]] || continue
  check_line "$file" "$line_number" "$image_ref" "dockerfile"
done < <(scan_dockerfiles)

while IFS=$'\t' read -r file line_number image_ref; do
  [[ -n "$file" ]] || continue
  check_line "$file" "$line_number" "$image_ref" "compose"
done < <(
  n=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    n=$((n + 1))
    if [[ "$line" =~ ^[[:space:]]*image:[[:space:]]+([^[:space:]]+) ]]; then
      printf '%s\t%s\t%s\n' "${ROOT_DIR}/docker-compose.yml" "$n" "${BASH_REMATCH[1]}"
    fi
  done <"${ROOT_DIR}/docker-compose.yml"
)

if ((${#failures[@]} > 0)); then
  printf '%s\n' "${failures[@]}" >&2
  exit 1
fi

printf 'Container image tag audit passed\n'
