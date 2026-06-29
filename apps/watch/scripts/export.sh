#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/sdk-env.sh"
REPO_ROOT="$(watch_repo_root)"
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
  SDK_HOME="$(watch_sdk_home "$REPO_ROOT")"
  MONKEYC_BIN="${SDK_HOME:-}/bin/monkeyc"
fi

if ! watch_require_executable "Monkey C compiler" "$MONKEYC_BIN" "Run: pnpm --filter @film-intensity/watch sdk:install"; then
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
