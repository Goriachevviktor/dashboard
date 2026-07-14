#!/usr/bin/env bash
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/ops/deploy-release.sh"
failures=0

assert_contains() {
  local description=$1 pattern=$2
  if grep -Eq "$pattern" "$SCRIPT"; then
    printf 'ok - %s\n' "$description"
  else
    printf 'not ok - %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

if [[ ! -f $SCRIPT ]]; then
  printf 'deploy script is missing\n' >&2
  exit 1
fi

if RELEASE_ROOT=$(mktemp -d) SHARED_CONFIG_DIR=$(mktemp -d) PUBLIC_HEALTH_URL=http://example.invalid \
  bash "$SCRIPT" test main /missing.tar.gz >/dev/null 2>&1; then
  printf 'not ok - invalid SHA was accepted\n' >&2
  failures=$((failures + 1))
else
  printf 'ok - invalid SHA is rejected\n'
fi

assert_contains 'uses strict shell mode' '^set -Eeuo pipefail'
assert_contains 'uses a stable deployment lock' 'flock'
assert_contains 'creates immutable SHA release paths' 'RELEASE_DIR="\$RELEASES_DIR/\$SHA"'
assert_contains 'loads server-owned env configuration' 'SHARED_CONFIG_DIR/.env'
assert_contains 'supports server-owned compose overrides' 'docker-compose.override.yml'
assert_contains 'exports exact deployment version' 'export DASHBOARD_VERSION="\$version"'
assert_contains 'exports exact deployment environment' 'export DASHBOARD_ENVIRONMENT="\$environment"'
assert_contains 'backs up PostgreSQL before production activation' 'pg_dump'
assert_contains 'requires a non-empty backup' '\[\[ -s .*backup'
assert_contains 'checks local health' 'LOCAL_HEALTH_URL'
assert_contains 'checks local health inside the API container' 'exec -T dashboard-api'
assert_contains 'retries local health while the API starts' 'retry_until'
assert_contains 'checks public health' 'PUBLIC_HEALTH_URL'
assert_contains 'checks the public API health path' 'PUBLIC_HEALTH_URL%/}/api/health'
assert_contains 'restores the previous release on failure' 'rollback'
assert_contains 'updates the current release symlink' 'current'
assert_contains 'prunes inactive releases' 'RELEASE_RETENTION'

if (( failures > 0 )); then
  printf '%d deployment contract assertion(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'all deployment contract assertions passed\n'
