#!/usr/bin/env bash
# Daily smoke test wrapper — see smoke.js for details.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/smoke.js" "$@"
