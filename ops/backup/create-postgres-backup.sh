#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_ROOT:?BACKUP_ROOT is required}"
: "${COMPOSE_FILE:?COMPOSE_FILE is required}"
: "${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
METADATA_HELPER=${METADATA_HELPER:-$SCRIPT_DIR/backup_metadata.py}
COMPOSE_OVERRIDE_FILE=${COMPOSE_OVERRIDE_FILE:-}
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:16-alpine}

DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"
STATE_DIR="$BACKUP_ROOT/state"
LOCK_DIR="$BACKUP_ROOT/locks"
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR" "$STATE_DIR" "$LOCK_DIR"

exec 9>"$LOCK_DIR/backup.lock"
flock -n 9 || { printf 'another backup is already running\n' >&2; exit 1; }

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
name="dashboard-$timestamp.dump"
final="$DAILY_DIR/$name"
temporary=$(mktemp "$DAILY_DIR/.${name}.tmp.XXXXXX")
checksum_temporary="$DAILY_DIR/.${name}.sha256.tmp"
state_temporary="$STATE_DIR/.latest.json.tmp"

cleanup() {
  rm -f -- "$temporary" "$checksum_temporary" "$state_temporary"
}
trap cleanup EXIT

[[ ! -e $final ]] || { printf 'backup already exists: %s\n' "$final" >&2; exit 1; }

compose_args=(--env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE")
if [[ -n $COMPOSE_OVERRIDE_FILE && -f $COMPOSE_OVERRIDE_FILE ]]; then
  compose_args+=(-f "$COMPOSE_OVERRIDE_FILE")
fi

docker compose "${compose_args[@]}" exec -T dashboard-db \
  pg_dump -U dashboard -d dashboard -Fc >"$temporary"
[[ -s $temporary ]]

docker run --rm -v "$DAILY_DIR:/backups:ro" "$POSTGRES_IMAGE" \
  pg_restore --list "/backups/$(basename "$temporary")" >/dev/null

sha256=$(sha256sum "$temporary" | awk '{print $1}')
size=$(wc -c <"$temporary" | tr -d ' ')
sha256sum "$temporary" | sed "s|$temporary|$final|" >"$checksum_temporary"
mv "$temporary" "$final"
mv "$checksum_temporary" "$final.sha256"

classes=(daily)
week_key=$(date -u +%G-W%V)
month_key=$(date -u +%Y-%m)
retain_in_class() {
  local directory=$1 target="$1/$name"
  ln "$final" "$target" 2>/dev/null || cp "$final" "$target"
  printf '%s  %s\n' "$sha256" "$target" >"$target.sha256"
}
if [[ ! -e $STATE_DIR/weekly-$week_key ]]; then
  retain_in_class "$WEEKLY_DIR"
  touch "$STATE_DIR/weekly-$week_key"
  classes+=(weekly)
fi
if [[ ! -e $STATE_DIR/monthly-$month_key ]]; then
  retain_in_class "$MONTHLY_DIR"
  touch "$STATE_DIR/monthly-$month_key"
  classes+=(monthly)
fi

python3 "$METADATA_HELPER" state \
  --file "$final" --completed-at "$completed_at" --size "$size" --sha256 "$sha256" \
  $(printf -- '--class %q ' "${classes[@]}") >"$state_temporary"
mv "$state_temporary" "$STATE_DIR/latest.json"

prune_directory() {
  local directory=$1 limit=$2
  local files excess index
  shopt -s nullglob
  files=("$directory"/dashboard-*.dump)
  shopt -u nullglob
  excess=$((${#files[@]} - limit))
  if (( excess > 0 )); then
    for ((index = 0; index < excess; index += 1)); do
      rm -f -- "${files[$index]}" "${files[$index]}.sha256"
    done
  fi
}

prune_directory "$DAILY_DIR" 7
prune_directory "$WEEKLY_DIR" 4
prune_directory "$MONTHLY_DIR" 3

printf 'backup_file=%s\n' "$final"
printf 'backup_size=%s\n' "$size"
printf 'backup_sha256=%s\n' "$sha256"
