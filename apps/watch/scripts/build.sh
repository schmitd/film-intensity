#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
SDK_ROOT="${SDK_ROOT:-$REPO_ROOT/.tools/connectiq-sdk}"
CURRENT_SDK_CFG="$SDK_ROOT/current-sdk.cfg"
DEVICE="${DEVICE:-}"
if [[ -n "$DEVICE" ]]; then
  OUTPUT="${OUTPUT:-build/film-intensity-$DEVICE.prg}"
else
  OUTPUT="${OUTPUT:-build/film-intensity.prg}"
fi
DEVELOPER_KEY="${DEVELOPER_KEY:-$REPO_ROOT/.tmp/garmin/developer_key.der}"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djava.awt.headless=true"
PROPERTIES_FILE="$APP_DIR/resources/properties.xml"
RESTORE_PROPERTIES_FROM=""

restore_properties() {
  if [[ -n "$RESTORE_PROPERTIES_FROM" ]]; then
    cp "$RESTORE_PROPERTIES_FROM" "$PROPERTIES_FILE"
    rm -f "$RESTORE_PROPERTIES_FROM"
  fi
}

trap restore_properties EXIT

if [[ -n "${BACKEND_URL:-}" ]]; then
  RESTORE_PROPERTIES_FROM="$(mktemp)"
  cp "$PROPERTIES_FILE" "$RESTORE_PROPERTIES_FROM"
  perl -0pi -e '
    my $value = $ENV{"BACKEND_URL"};
    $value =~ s/&/&amp;/g;
    $value =~ s/</&lt;/g;
    $value =~ s/>/&gt;/g;
    s#(<property id="api_base_url" type="string">).*?(</property>)#$1$value$2#s;
  ' "$PROPERTIES_FILE"
fi

if [[ -z "${MONKEYC_BIN:-}" ]]; then
  if [[ -f "$CURRENT_SDK_CFG" ]]; then
    SDK_HOME="$(cat "$CURRENT_SDK_CFG")"
  else
    SDK_HOME="$(find "$SDK_ROOT" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
  fi

  MONKEYC_BIN="${SDK_HOME:-}/bin/monkeyc"
fi

if [[ -z "$MONKEYC_BIN" ]]; then
  echo "MONKEYC_BIN is not set. Point it at your Garmin SDK monkeyc executable."
  exit 1
fi

if [[ ! -x "$MONKEYC_BIN" ]]; then
  echo "Monkey C compiler not found at $MONKEYC_BIN"
  echo "Run: pnpm --filter @film-intensity/watch sdk:install"
  exit 1
fi

if [[ ! -f "$DEVELOPER_KEY" ]]; then
  mkdir -p "$(dirname "$DEVELOPER_KEY")"
  openssl genrsa -out "${DEVELOPER_KEY%.der}.pem" 4096 >/dev/null 2>&1
  openssl pkcs8 -topk8 -inform PEM -outform DER \
    -in "${DEVELOPER_KEY%.der}.pem" \
    -out "$DEVELOPER_KEY" \
    -nocrypt >/dev/null 2>&1
fi

mkdir -p "$(dirname "$OUTPUT")"

if [[ -n "$DEVICE" ]]; then
  "$MONKEYC_BIN" -f monkey.jungle -o "$OUTPUT" -d "$DEVICE" -y "$DEVELOPER_KEY" -w
else
  "$MONKEYC_BIN" -f monkey.jungle -o "$OUTPUT" -y "$DEVELOPER_KEY" -w
fi
