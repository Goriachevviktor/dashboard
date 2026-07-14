#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/ops/backup/production-backup-command.sh"
[[ -f $SCRIPT ]] || { printf 'production wrapper is missing\n' >&2; exit 1; }

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/backups/daily" "$sandbox/backups/state" "$sandbox/bin"
dump="$sandbox/backups/daily/dashboard-20260714T120000Z.dump"
printf 'PGDMP-restricted-stream' >"$dump"
sha=$(sha256sum "$dump" | awk '{print $1}')
printf '%s  %s\n' "$sha" "$dump" >"$dump.sha256"
size=$(wc -c <"$dump" | tr -d ' ')
cat >"$sandbox/backups/state/latest.json" <<JSON
{"schemaVersion":1,"completedAt":"2026-07-14T12:00:00Z","filename":"$(basename "$dump")","sizeBytes":$size,"sha256":"$sha","classes":["daily"]}
JSON
cat >"$sandbox/config" <<EOF
BACKUP_ROOT=$sandbox/backups
POSTGRES_IMAGE=postgres:16-alpine
EOF
cat >"$sandbox/bin/docker" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
exit 0
FAKE
chmod +x "$sandbox/bin/docker"
export PATH="$sandbox/bin:$PATH" CONFIG_FILE="$sandbox/config" FAKE_DOCKER_LOG="$sandbox/docker.log"

for command in '' 'bash' 'status extra' 'status;id' '../status' 'stream-latest /etc/passwd'; do
  if SSH_ORIGINAL_COMMAND="$command" bash "$SCRIPT" >/dev/null 2>&1; then
    printf 'unauthorized command accepted: %s\n' "$command" >&2
    exit 1
  fi
done

status=$(SSH_ORIGINAL_COMMAND=status bash "$SCRIPT")
python3 -c 'import json,sys; p=json.loads(sys.argv[1]); assert p["filename"].endswith(".dump"); assert p["freeBytes"] >= 0' "$status"
SSH_ORIGINAL_COMMAND=verify bash "$SCRIPT" >/dev/null
[[ $(SSH_ORIGINAL_COMMAND=stream-latest bash "$SCRIPT") == 'PGDMP-restricted-stream' ]]
grep -q 'pg_restore --list' "$FAKE_DOCKER_LOG"

if SSH_ORIGINAL_COMMAND=status SSH_TTY=/dev/pts/1 bash "$SCRIPT" >/dev/null 2>&1; then
  printf 'PTY request was accepted\n' >&2
  exit 1
fi

grep -q 'case.*SSH_ORIGINAL_COMMAND' "$SCRIPT"
printf 'production backup wrapper contracts passed\n'
