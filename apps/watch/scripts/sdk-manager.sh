#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/sdk-env.sh"
REPO_ROOT="$(watch_repo_root)"
MANAGER_ROOT="$REPO_ROOT/.tools/connectiq-sdk-manager"
MANAGER_BIN="$MANAGER_ROOT/bin/sdkmanager"
ZIP_PATH="$MANAGER_ROOT/connectiq-sdk-manager-linux.zip"
LOCAL_LIBS="$MANAGER_ROOT/local-libs/usr/lib/x86_64-linux-gnu"
PATCHED_LIBS="$MANAGER_ROOT/patched-libs"
WEBKIT_TMP="/tmp/fi-webkit2gtk-4.0"
PREPARE_ONLY=false

if [[ "${1:-}" == "--prepare-libs" ]]; then
  PREPARE_ONLY=true
fi

mkdir -p "$MANAGER_ROOT"

if [[ ! -x "$MANAGER_BIN" ]]; then
  curl -L --fail \
    -o "$ZIP_PATH" \
    https://developer.garmin.com/downloads/connect-iq/sdk-manager/connectiq-sdk-manager-linux.zip
  unzip -q -o "$ZIP_PATH" -d "$MANAGER_ROOT"
fi

if ! ldd "$MANAGER_BIN" | grep -q 'not found'; then
  exec "$MANAGER_BIN"
fi

mkdir -p "$MANAGER_ROOT/debs" "$MANAGER_ROOT/local-libs" "$PATCHED_LIBS"
pushd "$MANAGER_ROOT/debs" >/dev/null
download_deb() {
  local url="${1:?url is required}"
  local file="${url##*/}"
  if [[ ! -f "$file" ]]; then
    curl -L --fail -O "$url"
  fi
  dpkg-deb -x "$file" "$MANAGER_ROOT/local-libs"
}

download_deb http://archive.ubuntu.com/ubuntu/pool/main/w/webkit2gtk/libwebkit2gtk-4.0-37_2.50.4-0ubuntu0.22.04.1_amd64.deb
download_deb http://archive.ubuntu.com/ubuntu/pool/main/w/webkit2gtk/libjavascriptcoregtk-4.0-18_2.50.4-0ubuntu0.22.04.1_amd64.deb
download_deb http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu70_70.1-2_amd64.deb
popd >/dev/null

cp -a "$LOCAL_LIBS"/*.so* "$PATCHED_LIBS"/ 2>/dev/null || true
cp -a "$LOCAL_LIBS/webkit2gtk-4.0" "$PATCHED_LIBS"/
mkdir -p "$WEBKIT_TMP"
cp -a "$LOCAL_LIBS/webkit2gtk-4.0/." "$WEBKIT_TMP"/
cp -f "$LOCAL_LIBS/webkit2gtk-4.0/injected-bundle/libwebkit2gtkinjectedbundle.so" "$WEBKIT_TMP"/

python3 - <<PY
from pathlib import Path
lib = Path("$PATCHED_LIBS/libwebkit2gtk-4.0.so.37.74.7")
old = b"/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0"
new = b"$WEBKIT_TMP"
data = lib.read_bytes()
if old in data:
    data = data.replace(old, new + b"\\0" * (len(old) - len(new)))
    lib.write_bytes(data)
PY

ln -sf libwebkit2gtk-4.0.so.37.74.7 "$PATCHED_LIBS/libwebkit2gtk-4.0.so.37"

if [[ "$PREPARE_ONLY" == true ]]; then
  printf '%s\n' "$PATCHED_LIBS"
  exit 0
fi

export LD_LIBRARY_PATH="$PATCHED_LIBS:${LD_LIBRARY_PATH:-}"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY
unset http_proxy https_proxy all_proxy no_proxy
export GIO_USE_PROXY_RESOLVER=dummy

if command -v dbus-run-session >/dev/null 2>&1 && command -v gnome-keyring-daemon >/dev/null 2>&1; then
  exec dbus-run-session -- bash -lc '
    printf "" | gnome-keyring-daemon --unlock --components=secrets >/tmp/film-intensity-gnome-keyring.env 2>/dev/null || true
    source /tmp/film-intensity-gnome-keyring.env 2>/dev/null || true
    exec "$0"
  ' "$MANAGER_BIN"
fi

exec "$MANAGER_BIN"
