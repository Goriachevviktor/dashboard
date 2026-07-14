#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/ops/backup/validate-postgres-restore.sh"
[[ -f $SCRIPT ]] || { printf 'restore validator is missing\n' >&2; exit 1; }

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/bin" "$sandbox/staging"
touch "$sandbox/compose.yml" "$sandbox/.env"
printf 'PGDMP-restore' >"$sandbox/staging/backup-12345.dump"
cat >"$sandbox/bin/docker" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ " $* " == *" -At "* ]]; then
  printf '1|2|3|4|5\n'
fi
exit "${FAKE_DOCKER_EXIT:-0}"
FAKE
chmod +x "$sandbox/bin/docker"
export PATH="$sandbox/bin:$PATH" FAKE_DOCKER_LOG="$sandbox/docker.log"
export RESTORE_STAGING_DIR="$sandbox/staging" COMPOSE_FILE="$sandbox/compose.yml" COMPOSE_ENV_FILE="$sandbox/.env"

for value in '' abc '12;drop' dashboard; do
  if bash "$SCRIPT" "$value" >/dev/null 2>&1; then
    printf 'unsafe run id accepted: %s\n' "$value" >&2
    exit 1
  fi
done

result=$(bash "$SCRIPT" 12345)
python3 -c 'import json,sys; p=json.loads(sys.argv[1]); assert p["database"] == "dashboard_restore_check_12345"; assert p["counts"]["users"] == 1' "$result"
grep -q 'CREATE DATABASE dashboard_restore_check_12345' "$FAKE_DOCKER_LOG"
grep -q 'pg_restore.*--exit-on-error.*--no-owner.*--no-acl' "$FAKE_DOCKER_LOG"
grep -q 'app_schema_migrations' "$FAKE_DOCKER_LOG"
grep -q 'roadmaps_pkey' "$FAKE_DOCKER_LOG"
grep -q 'DROP DATABASE IF EXISTS dashboard_restore_check_12345' "$FAKE_DOCKER_LOG"
[[ ! -e "$sandbox/staging/backup-12345.dump" ]]

printf 'PGDMP-restore' >"$sandbox/staging/backup-777.dump"
export FAKE_DOCKER_EXIT=9
if bash "$SCRIPT" 777 >/dev/null 2>&1; then
  printf 'restore unexpectedly succeeded after docker failure\n' >&2
  exit 1
fi
grep -q 'DROP DATABASE IF EXISTS dashboard_restore_check_777' "$FAKE_DOCKER_LOG"
[[ ! -e "$sandbox/staging/backup-777.dump" ]]
printf 'restore validator contracts passed\n'
