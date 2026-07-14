#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DOC="$ROOT/docs/operations/backup-and-restore.md"
[[ -f $DOC ]] || { printf 'backup runbook is missing\n' >&2; exit 1; }
for marker in \
  '7 daily' '4 weekly' '3 monthly' pg_dump pg_restore sha256sum \
  dashboard-postgres-backup.service dashboard-postgres-backup.timer \
  backup-automation PROD_BACKUP_SSH_PRIVATE_KEY TEST_RESTORE_SSH_PRIVATE_KEY \
  dashboard_restore_check_ 'forced command' 'destructive' 'systemctl list-timers'; do
  grep -Fqi "$marker" "$DOC" || { printf 'runbook missing: %s\n' "$marker" >&2; exit 1; }
done
printf 'backup documentation contract passed\n'
