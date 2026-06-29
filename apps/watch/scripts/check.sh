#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/sdk-env.sh"
REPO_ROOT="$(watch_repo_root)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SDK_HOME="$(watch_sdk_home "$REPO_ROOT")"
if [[ -z "$SDK_HOME" || ! -x "$SDK_HOME/bin/monkeyc" ]]; then
  "$SCRIPT_DIR/sdk-install.sh"
  SDK_HOME="$(watch_sdk_home "$REPO_ROOT")"
fi

MONKEYC_BIN="${MONKEYC_BIN:-$SDK_HOME/bin/monkeyc}"
watch_require_executable "Monkey C compiler" "$MONKEYC_BIN" "Run: pnpm --filter @film-intensity/watch sdk:install"

echo "Connect IQ SDK: $SDK_HOME"
"$MONKEYC_BIN" -v

cd "$APP_DIR"
"$SCRIPT_DIR/build.sh"

if [[ -n "${DEVICE:-}" ]]; then
  echo
  echo "Checking device target: $DEVICE"
  DEVICE="$DEVICE" "$SCRIPT_DIR/build.sh"
fi
