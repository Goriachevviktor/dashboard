#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/ops/backup/test-restore-command.sh"
[[ -f $SCRIPT ]] || { printf 'test restore wrapper is missing\n' >&2; exit 1; }

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/staging"
cat >"$sandbox/validator" <<'FAKE'
#!/usr/bin/env bash
: "${RESTORE_STAGING_DIR:?}"
: "${COMPOSE_FILE:?}"
: "${COMPOSE_ENV_FILE:?}"
printf '{"validatedRun":"%s"}\n' "$1"
FAKE
chmod +x "$sandbox/validator"
cat >"$sandbox/config" <<EOF
RESTORE_STAGING_DIR=$sandbox/staging
RESTORE_VALIDATOR=$sandbox/validator
COMPOSE_FILE=$sandbox/compose.yml
COMPOSE_ENV_FILE=$sandbox/compose.env
EOF
export CONFIG_FILE="$sandbox/config"

for command in '' shell 'upload' 'upload abc' 'restore 1;id' 'restore 1 extra'; do
  if SSH_ORIGINAL_COMMAND="$command" bash "$SCRIPT" >/dev/null 2>&1; then
    printf 'unauthorized restore command accepted: %s\n' "$command" >&2
    exit 1
  fi
done

printf 'PGDMP-upload' | SSH_ORIGINAL_COMMAND='upload 987' bash "$SCRIPT"
[[ $(<"$sandbox/staging/backup-987.dump") == 'PGDMP-upload' ]]
result=$(SSH_ORIGINAL_COMMAND='restore 987' bash "$SCRIPT")
[[ $result == '{"validatedRun":"987"}' ]]
if SSH_ORIGINAL_COMMAND='restore 987' SSH_TTY=/dev/pts/1 bash "$SCRIPT" >/dev/null 2>&1; then
  printf 'restore wrapper accepted a PTY\n' >&2
  exit 1
fi
printf 'test restore wrapper contracts passed\n'
