#!/usr/bin/env bash

validate_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]]
}

health_matches() {
  local payload=${1:-}
  local expected_sha=${2:-}
  local expected_environment=${3:-}

  python3 - "$payload" "$expected_sha" "$expected_environment" <<'PY'
import json
import sys

try:
    payload = json.loads(sys.argv[1])
except (json.JSONDecodeError, TypeError):
    raise SystemExit(1)

matches = (
    payload.get("status") == "ok"
    and payload.get("version") == sys.argv[2]
    and payload.get("environment") == sys.argv[3]
)
raise SystemExit(0 if matches else 1)
PY
}

should_rollback() {
  local previous_release=${1:-}
  local activation_started=${2:-false}
  [[ -n $previous_release && $activation_started == true ]]
}

retry_until() {
  local max_attempts=${1:?max attempts are required}
  local delay_seconds=${2:?delay seconds are required}
  shift 2

  local attempt
  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    if "$@"; then
      return 0
    fi
    if (( attempt < max_attempts )); then
      sleep "$delay_seconds"
    fi
  done
  return 1
}

install_frontend_artifact() {
  local archive=${1:?frontend archive is required}
  local release_dir=${2:?release directory is required}
  local staging
  staging=$(mktemp -d "$release_dir/.frontend.XXXXXX") || return 1

  if ! tar -xzf "$archive" -C "$staging"; then
    rm -rf -- "$staging"
    return 1
  fi
  if [[ ! -s $staging/index.html ]] ||
    [[ -z $(find "$staging/assets" -maxdepth 1 -type f -name '*.js' -print -quit 2>/dev/null) ]]; then
    rm -rf -- "$staging"
    return 1
  fi

  if [[ -d $release_dir/frontend-dist ]]; then
    if ! diff -qr "$staging" "$release_dir/frontend-dist" >/dev/null; then
      rm -rf -- "$staging"
      return 1
    fi
    rm -rf -- "$staging"
  else
    mv "$staging" "$release_dir/frontend-dist"
  fi
}
