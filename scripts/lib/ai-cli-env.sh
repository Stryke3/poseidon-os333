# Sourced by launch-claude.sh / launch-codex.sh and .command wrappers.
# Expects repo layout: <workspace>/poseidon 2 and <workspace>/dev/node/bin/...

_AI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POSEIDON_REPO_ROOT="$(cd "${_AI_LIB_DIR}/../.." && pwd)"
export POSEIDON_REPO_ROOT

SIBLING_DEV_BIN="${POSEIDON_REPO_ROOT}/../dev/node/bin"
if [[ -d "$SIBLING_DEV_BIN" ]]; then
  export PATH="${SIBLING_DEV_BIN}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.nodejs/bin:${PATH:-}"
else
  export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.nodejs/bin:${PATH:-}"
fi

unset _AI_LIB_DIR SIBLING_DEV_BIN
