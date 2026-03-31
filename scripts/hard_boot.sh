#!/bin/sh

set -eu

echo "[poseidon] scripts/hard_boot.sh is deprecated."
echo "[poseidon] Production is GitHub + Render first; do not reset local Docker state as a deploy step."
echo "[poseidon] Use 'bash poseidon-deploy.sh' for local validation, then push to GitHub and verify the Render deploy."
exit 1
