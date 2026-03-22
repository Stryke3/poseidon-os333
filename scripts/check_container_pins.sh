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

while IFS=$'\t' read -r file line_number image_ref; do
  [[ -n "$file" ]] || continue
  check_line "$file" "$line_number" "$image_ref" "dockerfile"
done < <(
  rg -n --no-heading '^FROM[[:space:]]+[^[:space:]]+' \
    --with-filename \
    "${ROOT_DIR}/services" "${ROOT_DIR}/frontend" -g 'Dockerfile*' |
    while IFS=: read -r file line_number content; do
      image_ref="$(printf '%s\n' "$content" | awk '{print $2}')"
      printf '%s\t%s\t%s\n' "$file" "$line_number" "$image_ref"
    done
)

while IFS=$'\t' read -r file line_number image_ref; do
  [[ -n "$file" ]] || continue
  check_line "$file" "$line_number" "$image_ref" "compose"
done < <(
  rg -n --no-heading --with-filename '^[[:space:]]*image:[[:space:]]+[^[:space:]]+' "${ROOT_DIR}/docker-compose.yml" |
    while IFS=: read -r file line_number content; do
      image_ref="$(printf '%s\n' "$content" | awk '{print $2}')"
      printf '%s\t%s\t%s\n' "$file" "$line_number" "$image_ref"
    done
)

if ((${#failures[@]} > 0)); then
  printf '%s\n' "${failures[@]}" >&2
  exit 1
fi

printf 'Container image tag audit passed\n'
