#!/usr/bin/env bash
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DOC="$ROOT/docs/operations/ci-cd-environments.md"

if [[ ! -f $DOC ]]; then
  printf 'operations guide is missing\n' >&2
  exit 1
fi

failures=0
for marker in \
  DEPLOY_SSH_PRIVATE_KEY DEPLOY_HOST DEPLOY_PORT DEPLOY_USER \
  PUBLIC_HEALTH_URL RELEASE_ROOT SHARED_CONFIG_DIR \
  test production 'required reviewers' rollback pg_dump psql; do
  if grep -Fqi "$marker" "$DOC"; then
    printf 'ok - documentation includes %s\n' "$marker"
  else
    printf 'not ok - documentation is missing %s\n' "$marker" >&2
    failures=$((failures + 1))
  fi
done

(( failures == 0 )) || exit 1
printf 'documentation contract passed\n'
