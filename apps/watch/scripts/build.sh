#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/sdk-env.sh"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(watch_repo_root)"
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
  SDK_HOME="$(watch_sdk_home "$REPO_ROOT")"
  MONKEYC_BIN="${SDK_HOME:-}/bin/monkeyc"
fi

if ! watch_require_executable "Monkey C compiler" "$MONKEYC_BIN" "Run: pnpm --filter @film-intensity/watch sdk:install"; then
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
  if ! "$MONKEYC_BIN" -f monkey.jungle -o "$OUTPUT" -d "$DEVICE" -y "$DEVELOPER_KEY" -w; then
    echo
    echo "Garmin device build failed for DEVICE=$DEVICE."
    echo "If the compiler reports an invalid device id, install that device through the Connect IQ SDK Manager or set MONKEYC_BIN to a Garmin SDK installation with device libraries."
    exit 1
  fi
else
  "$MONKEYC_BIN" -f monkey.jungle -o "$OUTPUT" -y "$DEVELOPER_KEY" -w
fi
