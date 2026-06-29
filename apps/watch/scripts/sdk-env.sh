#!/usr/bin/env bash

watch_repo_root() {
  local script_dir
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  cd "$script_dir/../../.." && pwd
}

watch_sdk_home() {
  local repo_root="${1:?repo root is required}"
  local sdk_root="${SDK_ROOT:-$repo_root/.tools/connectiq-sdk}"
  local current_sdk_cfg="$sdk_root/current-sdk.cfg"
  local garmin_sdk_cfg="$HOME/.Garmin/ConnectIQ/current-sdk.cfg"

  if [[ -n "${SDK_HOME:-}" ]]; then
    printf '%s\n' "$SDK_HOME"
    return 0
  fi

  if [[ -f "$garmin_sdk_cfg" ]]; then
    cat "$garmin_sdk_cfg"
    return 0
  fi

  if [[ -f "$current_sdk_cfg" ]]; then
    cat "$current_sdk_cfg"
    return 0
  fi

  find "$sdk_root" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -n 1
}

watch_require_executable() {
  local name="${1:?name is required}"
  local path="${2:-}"
  local install_hint="${3:-}"

  if [[ -z "$path" || ! -x "$path" ]]; then
    echo "$name not found at ${path:-<unset>}."
    if [[ -n "$install_hint" ]]; then
      echo "$install_hint"
    fi
    return 1
  fi
}
