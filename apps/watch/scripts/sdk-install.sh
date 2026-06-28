#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
SDK_ROOT="${SDK_ROOT:-$REPO_ROOT/.tools/connectiq-sdk}"
SDK_VERSION="${SDK_VERSION:-latest}"

mkdir -p "$SDK_ROOT"

readarray -t sdk_info < <(
  SDK_VERSION="$SDK_VERSION" python3 - <<'PY'
import json
import os
import urllib.request

manifest_url = "https://developer.garmin.com/downloads/connect-iq/sdks/sdks.json"
requested = os.environ.get("SDK_VERSION", "latest")

with urllib.request.urlopen(manifest_url) as response:
    manifest = json.load(response)

if requested == "latest":
    record = manifest[-1]
else:
    record = next((item for item in manifest if item["version"] == requested), None)
    if record is None:
        raise SystemExit(f"SDK version not found: {requested}")

print(record["version"])
print(record["linux"])
PY
)

resolved_version="${sdk_info[0]}"
archive_name="${sdk_info[1]}"
archive_url="https://developer.garmin.com/downloads/connect-iq/sdks/${archive_name}"
version_dir="$SDK_ROOT/$resolved_version"
archive_path="$SDK_ROOT/$archive_name"
current_sdk_cfg="$SDK_ROOT/current-sdk.cfg"

if [[ ! -x "$version_dir/bin/monkeyc" ]]; then
  echo "Downloading Connect IQ SDK $resolved_version..."
  curl -L --fail -o "$archive_path" "$archive_url"
  rm -rf "$version_dir"
  mkdir -p "$version_dir"
  unzip -q -o "$archive_path" -d "$version_dir"
fi

printf '%s\n' "$version_dir" > "$current_sdk_cfg"

echo "Installed Connect IQ SDK $resolved_version"
echo "SDK root: $version_dir"
echo "MONKEYC_BIN=$version_dir/bin/monkeyc"
echo "MONKEYDO_BIN=$version_dir/bin/monkeydo"
