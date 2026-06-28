#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SDK_ROOT="${SDK_ROOT:-$REPO_ROOT/.tools/connectiq-sdk}"
CURRENT_SDK_CFG="$SDK_ROOT/current-sdk.cfg"
DEVICE="${DEVICE:-venu2}"
APP="${APP:-build/film-intensity-$DEVICE.prg}"

if [[ -z "${MONKEYDO_BIN:-}" ]]; then
  if [[ -f "$CURRENT_SDK_CFG" ]]; then
    SDK_HOME="$(cat "$CURRENT_SDK_CFG")"
  else
    SDK_HOME="$(find "$SDK_ROOT" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
  fi

  MONKEYDO_BIN="${SDK_HOME:-}/bin/monkeydo"
fi

if [[ -z "$MONKEYDO_BIN" ]]; then
  echo "MONKEYDO_BIN is not set. Point it at your Garmin SDK monkeydo executable."
  exit 1
fi

if [[ ! -f "$APP" ]]; then
  echo "Build a simulator PRG with the SDK device library first:"
  echo "DEVICE=$DEVICE pnpm --filter @film-intensity/watch build"
  exit 1
fi

"$MONKEYDO_BIN" "$APP" "$DEVICE"
