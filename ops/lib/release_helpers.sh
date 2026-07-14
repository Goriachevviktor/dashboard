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
