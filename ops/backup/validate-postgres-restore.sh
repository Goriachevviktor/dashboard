#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

RUN_ID=${1:-}
[[ $RUN_ID =~ ^[0-9]+$ ]] || { printf 'run id must contain digits only\n' >&2; exit 2; }
: "${RESTORE_STAGING_DIR:?RESTORE_STAGING_DIR is required}"
: "${COMPOSE_FILE:?COMPOSE_FILE is required}"
: "${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required}"
COMPOSE_OVERRIDE_FILE=${COMPOSE_OVERRIDE_FILE:-}

DATABASE="dashboard_restore_check_$RUN_ID"
DUMP="$RESTORE_STAGING_DIR/backup-$RUN_ID.dump"
CONTAINER_DUMP="/tmp/backup-$RUN_ID.dump"
[[ $DATABASE =~ ^dashboard_restore_check_[0-9]+$ ]]
[[ -s $DUMP ]] || { printf 'restore dump is missing\n' >&2; exit 1; }

compose_args=(--env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE")
if [[ -n $COMPOSE_OVERRIDE_FILE && -f $COMPOSE_OVERRIDE_FILE ]]; then
  compose_args+=(-f "$COMPOSE_OVERRIDE_FILE")
fi

cleanup() {
  set +e
  docker compose "${compose_args[@]}" exec -T dashboard-db psql -U dashboard -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE' AND pid <> pg_backend_pid();" >/dev/null 2>&1
  docker compose "${compose_args[@]}" exec -T dashboard-db psql -U dashboard -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $DATABASE;" >/dev/null 2>&1
  docker exec dashboard-db rm -f -- "$CONTAINER_DUMP" >/dev/null 2>&1
  rm -f -- "$DUMP"
}
trap cleanup EXIT

docker cp "$DUMP" "dashboard-db:$CONTAINER_DUMP"
docker compose "${compose_args[@]}" exec -T dashboard-db psql -U dashboard -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $DATABASE;"
docker compose "${compose_args[@]}" exec -T dashboard-db psql -U dashboard -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE $DATABASE;"
docker exec dashboard-db pg_restore -U dashboard -d "$DATABASE" \
  --exit-on-error --no-owner --no-acl "$CONTAINER_DUMP"

validation_sql='DO $check$
BEGIN
  IF to_regclass('"'"'users'"'"') IS NULL
     OR to_regclass('"'"'tasks'"'"') IS NULL
     OR to_regclass('"'"'events'"'"') IS NULL
     OR to_regclass('"'"'mind_maps'"'"') IS NULL
     OR to_regclass('"'"'roadmaps'"'"') IS NULL
     OR to_regclass('"'"'app_schema_migrations'"'"') IS NULL THEN
    RAISE EXCEPTION '"'"'required application tables are missing'"'"';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = '"'"'roadmaps_pkey'"'"'
      AND pg_get_constraintdef(oid) LIKE '"'"'PRIMARY KEY (owner_id, id)%'"'"'
  ) THEN
    RAISE EXCEPTION '"'"'roadmaps_pkey is not owner scoped'"'"';
  END IF;
END
$check$;
SELECT COUNT(*) FROM users;
SELECT (SELECT COUNT(*) FROM users) || '"'"'|'"'"' || (SELECT COUNT(*) FROM tasks) || '"'"'|'"'"' ||
       (SELECT COUNT(*) FROM events) || '"'"'|'"'"' || (SELECT COUNT(*) FROM mind_maps) || '"'"'|'"'"' ||
       (SELECT COUNT(*) FROM roadmaps);'

counts=$(docker exec dashboard-db psql -U dashboard -d "$DATABASE" -At -v ON_ERROR_STOP=1 -c "$validation_sql" | tail -1)
IFS='|' read -r users tasks events mind_maps roadmaps <<<"$counts"
for count in "$users" "$tasks" "$events" "$mind_maps" "$roadmaps"; do
  [[ $count =~ ^[0-9]+$ ]]
done

python3 - "$DATABASE" "$users" "$tasks" "$events" "$mind_maps" "$roadmaps" <<'PY'
import json, sys
print(json.dumps({
    "ok": True,
    "database": sys.argv[1],
    "counts": dict(zip(("users", "tasks", "events", "mindMaps", "roadmaps"), map(int, sys.argv[2:]))),
}, sort_keys=True))
PY
