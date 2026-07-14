#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ -z ${SSH_TTY:-} ]] || { printf 'PTY is not permitted\n' >&2; exit 126; }
CONFIG_FILE=${CONFIG_FILE:-/etc/dashboard-restore.conf}
[[ -r $CONFIG_FILE ]] || { printf 'restore configuration is unavailable\n' >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${RESTORE_STAGING_DIR:?RESTORE_STAGING_DIR is required}"
: "${RESTORE_VALIDATOR:?RESTORE_VALIDATOR is required}"
mkdir -p "$RESTORE_STAGING_DIR"

command=${SSH_ORIGINAL_COMMAND:-}
if [[ $command =~ ^upload\ ([0-9]+)$ ]]; then
  run_id=${BASH_REMATCH[1]}
  temporary="$RESTORE_STAGING_DIR/.backup-$run_id.dump.tmp"
  final="$RESTORE_STAGING_DIR/backup-$run_id.dump"
  trap 'rm -f -- "$temporary"' EXIT
  [[ ! -e $final ]]
  cat >"$temporary"
  [[ -s $temporary ]]
  mv "$temporary" "$final"
  trap - EXIT
  printf '{"uploaded":true,"runId":"%s"}\n' "$run_id"
elif [[ $command =~ ^restore\ ([0-9]+)$ ]]; then
  exec "$RESTORE_VALIDATOR" "${BASH_REMATCH[1]}"
else
  printf 'command is not permitted\n' >&2
  exit 126
fi
