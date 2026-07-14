#!/usr/bin/env bash
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$ROOT/ops/lib/release_helpers.sh"

failures=0

check() {
  local description=$1
  shift
  if "$@"; then
    printf 'ok - %s\n' "$description"
  else
    printf 'not ok - %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_not() {
  local description=$1
  shift
  if "$@"; then
    printf 'not ok - %s\n' "$description" >&2
    failures=$((failures + 1))
  else
    printf 'ok - %s\n' "$description"
  fi
}

sha=0123456789012345678901234567890123456789
check 'accepts a full lowercase SHA' validate_sha "$sha"
check_not 'rejects a branch name' validate_sha main
check_not 'rejects an uppercase SHA' validate_sha 012345678901234567890123456789012345678A
check 'accepts exact healthy deployment metadata' health_matches \
  "{\"status\":\"ok\",\"version\":\"$sha\",\"environment\":\"test\"}" "$sha" test
check_not 'rejects a mismatched version' health_matches \
  '{"status":"ok","version":"wrong","environment":"test"}' "$sha" test
check_not 'rejects malformed JSON' health_matches 'not-json' "$sha" test
check 'rolls back after activation when a previous release exists' should_rollback /srv/releases/previous true
check_not 'does not roll back without a previous release' should_rollback '' true
check_not 'does not roll back before activation' should_rollback /srv/releases/previous false

if (( failures > 0 )); then
  printf '%d release helper assertion(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'all release helper assertions passed\n'
