#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/ops/backup/create-postgres-backup.sh"
[[ -f $SCRIPT ]] || { printf 'backup script is missing\n' >&2; exit 1; }

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/bin" "$sandbox/backups" "$sandbox/config"
touch "$sandbox/config/compose.yml" "$sandbox/config/.env"

cat >"$sandbox/bin/docker" <<'FAKE'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ " $* " == *" pg_dump "* ]]; then
  printf 'PGDMP-fake-custom-format'
fi
exit 0
FAKE
chmod +x "$sandbox/bin/docker"
cat >"$sandbox/bin/flock" <<'FAKE'
#!/usr/bin/env bash
exit 0
FAKE
chmod +x "$sandbox/bin/flock"

export PATH="$sandbox/bin:$PATH"
export FAKE_DOCKER_LOG="$sandbox/docker.log"
export BACKUP_ROOT="$sandbox/backups"
export COMPOSE_FILE="$sandbox/config/compose.yml"
export COMPOSE_ENV_FILE="$sandbox/config/.env"
export METADATA_HELPER="$ROOT/ops/backup/backup_metadata.py"

bash "$SCRIPT"

dump=$(find "$BACKUP_ROOT/daily" -maxdepth 1 -name 'dashboard-*.dump' -type f | head -1)
[[ -n $dump && -s $dump ]]
[[ -s "$dump.sha256" ]]
sha256sum -c "$dump.sha256" >/dev/null
weekly_dump=$(find "$BACKUP_ROOT/weekly" -maxdepth 1 -name 'dashboard-*.dump' -type f | head -1)
monthly_dump=$(find "$BACKUP_ROOT/monthly" -maxdepth 1 -name 'dashboard-*.dump' -type f | head -1)
grep -qF "$weekly_dump" "$weekly_dump.sha256"
grep -qF "$monthly_dump" "$monthly_dump.sha256"
[[ -s "$BACKUP_ROOT/state/latest.json" ]]
python3 - "$BACKUP_ROOT/state/latest.json" "$dump" <<'PY'
import json, pathlib, sys
state = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert state["schemaVersion"] == 1
assert state["filename"] == pathlib.Path(sys.argv[2]).name
assert state["sizeBytes"] == pathlib.Path(sys.argv[2]).stat().st_size
PY
grep -q 'pg_dump' "$FAKE_DOCKER_LOG"
grep -q 'pg_restore --list' "$FAKE_DOCKER_LOG"
[[ -z $(find "$BACKUP_ROOT" -name '*.tmp*' -print -quit) ]]

for day in $(seq -w 1 12); do
  touch "$BACKUP_ROOT/daily/dashboard-202606${day}T010101Z.dump"
  touch "$BACKUP_ROOT/daily/dashboard-202606${day}T010101Z.dump.sha256"
done
sleep 1
bash "$SCRIPT"
[[ $(find "$BACKUP_ROOT/daily" -maxdepth 1 -name '*.dump' | wc -l | tr -d ' ') -le 7 ]]

export FAKE_DOCKER_FAIL=true
cat >"$sandbox/bin/docker" <<'FAKE'
#!/usr/bin/env bash
exit 17
FAKE
before=$(find "$BACKUP_ROOT/daily" -maxdepth 1 -name '*.dump' | wc -l)
if bash "$SCRIPT" >/dev/null 2>&1; then
  printf 'backup unexpectedly succeeded after pg_dump failure\n' >&2
  exit 1
fi
after=$(find "$BACKUP_ROOT/daily" -maxdepth 1 -name '*.dump' | wc -l)
[[ $before -eq $after ]]
[[ -z $(find "$BACKUP_ROOT" -name '*.tmp*' -print -quit) ]]

grep -q '^set -Eeuo pipefail' "$SCRIPT"
grep -q 'flock' "$SCRIPT"
grep -q 'umask 077' "$SCRIPT"
grep -q 'pg_restore --list' "$SCRIPT"
printf 'backup script contracts passed\n'
