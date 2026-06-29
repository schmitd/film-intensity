#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/sdk-env.sh"
REPO_ROOT="$(watch_repo_root)"
DEVICE="${DEVICE:-venu2}"
APP="${APP:-build/film-intensity-$DEVICE.prg}"

if [[ -z "${MONKEYDO_BIN:-}" ]]; then
  SDK_HOME="$(watch_sdk_home "$REPO_ROOT")"
  MONKEYDO_BIN="${SDK_HOME:-}/bin/monkeydo"
fi

if ! watch_require_executable "Monkey Do launcher" "$MONKEYDO_BIN" "Run: pnpm --filter @film-intensity/watch sdk:install"; then
  exit 1
fi

SDK_BIN_DIR="$(cd -- "$(dirname -- "$MONKEYDO_BIN")" && pwd)"
if [[ -x "$SDK_BIN_DIR/simulator" ]] && ldd "$SDK_BIN_DIR/simulator" 2>/dev/null | grep -q 'libwebkit2gtk-4.0.so.37.*not found'; then
  PATCHED_LIBS="$("$SCRIPT_DIR/sdk-manager.sh" --prepare-libs)"
  export LD_LIBRARY_PATH="$PATCHED_LIBS:${LD_LIBRARY_PATH:-}"
fi

if [[ ! -f "$APP" ]]; then
  echo "Build a simulator PRG with the SDK device library first:"
  echo "DEVICE=$DEVICE pnpm --filter @film-intensity/watch build"
  exit 1
fi

if [[ ! -x "$SDK_BIN_DIR/shell" ]]; then
  echo "Connect IQ simulator shell not found at $SDK_BIN_DIR/shell."
  echo "Install Garmin simulator/device support with the Connect IQ SDK Manager, or set MONKEYDO_BIN to a full SDK Manager installation."
  exit 1
fi

if [[ -x "$SDK_BIN_DIR/simulator" ]] && ! pgrep -f "$SDK_BIN_DIR/simulator" >/dev/null 2>&1; then
  "$SDK_BIN_DIR/simulator" >/tmp/film-intensity-simulator.log 2>&1 &
  sleep 3
fi

"$MONKEYDO_BIN" "$APP" "$DEVICE"
