#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SERVICE="$ROOT/ops/backup/systemd/dashboard-postgres-backup.service"
TIMER="$ROOT/ops/backup/systemd/dashboard-postgres-backup.timer"
INSTALLER="$ROOT/ops/backup/install-backup-automation.sh"
for file in "$SERVICE" "$TIMER" "$INSTALLER"; do
  [[ -f $file ]] || { printf 'missing install artifact: %s\n' "$file" >&2; exit 1; }
done
grep -q '^Type=oneshot$' "$SERVICE"
grep -q '^UMask=0077$' "$SERVICE"
grep -q '^TimeoutStartSec=' "$SERVICE"
grep -q '^EnvironmentFile=/etc/dashboard-backup.conf$' "$SERVICE"
grep -q 'create-postgres-backup.sh' "$SERVICE"
grep -q '^Persistent=true$' "$TIMER"
grep -q '^OnCalendar=' "$TIMER"
grep -q '^RandomizedDelaySec=' "$TIMER"
grep -q 'systemctl daemon-reload' "$INSTALLER"
grep -q 'systemctl enable --now dashboard-postgres-backup.timer' "$INSTALLER"
grep -q 'install -d -m 0755.*INSTALL_ROOT' "$INSTALLER"
grep -q 'authorized_keys' "$INSTALLER"
grep -q 'command=.*production-backup-command.sh' "$INSTALLER"
grep -q 'command=.*test-restore-command.sh' "$INSTALLER"
grep -q 'mkdir -p.*daily.*weekly.*monthly.*state.*locks' "$INSTALLER"
grep -q 'RESTORE_USER' "$INSTALLER"
grep -q 'install -d -m 0700 -o.*RESTORE_USER' "$INSTALLER"
grep -q 'chmod 0644 /etc/dashboard-restore.conf' "$INSTALLER"
printf 'backup installation contracts passed\n'
