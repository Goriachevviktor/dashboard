#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ -z ${SSH_TTY:-} ]] || { printf 'PTY is not permitted\n' >&2; exit 126; }
CONFIG_FILE=${CONFIG_FILE:-/etc/dashboard-backup.conf}
[[ -r $CONFIG_FILE ]] || { printf 'backup configuration is unavailable\n' >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${BACKUP_ROOT:?BACKUP_ROOT is required}"
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:16-alpine}

STATE_FILE="$BACKUP_ROOT/state/latest.json"
DAILY_DIR="$BACKUP_ROOT/daily"

latest_filename() {
  python3 - "$STATE_FILE" <<'PY'
import json, pathlib, re, sys
state = json.loads(pathlib.Path(sys.argv[1]).read_text())
name = state.get("filename", "")
if not re.fullmatch(r"dashboard-\d{8}T\d{6}Z\.dump", name):
    raise SystemExit("invalid managed backup filename")
print(name)
PY
}

verify_latest() {
  local name path
  name=$(latest_filename)
  path="$DAILY_DIR/$name"
  [[ -s $path && -s $path.sha256 ]]
  sha256sum -c "$path.sha256" >/dev/null
  docker run --rm -v "$DAILY_DIR:/backups:ro" "$POSTGRES_IMAGE" \
    pg_restore --list "/backups/$name" >/dev/null
}

status_json() {
  local free_kb
  free_kb=$(df -Pk "$BACKUP_ROOT" | awk 'NR==2 {print $4}')
  python3 - "$STATE_FILE" "$free_kb" <<'PY'
import json, pathlib, sys
state = json.loads(pathlib.Path(sys.argv[1]).read_text())
state["freeBytes"] = int(sys.argv[2]) * 1024
print(json.dumps(state, sort_keys=True))
PY
}

case "${SSH_ORIGINAL_COMMAND:-}" in
  status)
    status_json
    ;;
  verify)
    verify_latest
    printf '{"ok":true}\n'
    ;;
  stream-latest)
    verify_latest
    cat -- "$DAILY_DIR/$(latest_filename)"
    ;;
  *)
    printf 'command is not permitted\n' >&2
    exit 126
    ;;
esac
