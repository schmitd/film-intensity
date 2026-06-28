#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SDK_ROOT="${SDK_ROOT:-$REPO_ROOT/.tools/connectiq-sdk}"
CURRENT_SDK_CFG="$SDK_ROOT/current-sdk.cfg"
OUTPUT="${OUTPUT:-export/film-intensity.iq}"
DEVELOPER_KEY="${DEVELOPER_KEY:-}"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djava.awt.headless=true"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
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

if [[ -z "$DEVELOPER_KEY" ]]; then
  echo "DEVELOPER_KEY is not set. Point it at your Garmin signing key."
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
if ! "$MONKEYC_BIN" -f monkey.jungle -e -o "$OUTPUT" -y "$DEVELOPER_KEY" -w -r; then
  echo
  echo "Garmin export failed."
  echo "If the compiler reports unrecognized manifest device ids, install Garmin device libraries through the Connect IQ SDK Manager or configure MONKEYC_BIN to a full SDK Manager installation."
  exit 1
fi
