#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ ${EUID:-$(id -u)} -eq 0 ]] || { printf 'installer must run as root\n' >&2; exit 1; }
MODE=${MODE:?MODE must be production or test}
[[ $MODE == production || $MODE == test ]] || { printf 'invalid install mode\n' >&2; exit 2; }

SOURCE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
INSTALL_ROOT=${INSTALL_ROOT:-/usr/local/lib/dashboard-backup}
SYSTEMD_DIR=${SYSTEMD_DIR:-/etc/systemd/system}
mkdir -p "$INSTALL_ROOT"
install -m 0755 "$SOURCE_DIR/backup_metadata.py" "$INSTALL_ROOT/backup_metadata.py"
install -m 0755 "$SOURCE_DIR/create-postgres-backup.sh" "$INSTALL_ROOT/create-postgres-backup.sh"
install -m 0755 "$SOURCE_DIR/production-backup-command.sh" "$INSTALL_ROOT/production-backup-command.sh"
install -m 0755 "$SOURCE_DIR/validate-postgres-restore.sh" "$INSTALL_ROOT/validate-postgres-restore.sh"
install -m 0755 "$SOURCE_DIR/test-restore-command.sh" "$INSTALL_ROOT/test-restore-command.sh"

write_shell_value() {
  printf '%s=%q\n' "$1" "$2"
}

if [[ $MODE == production ]]; then
  : "${BACKUP_ROOT:?BACKUP_ROOT is required}"
  : "${COMPOSE_FILE:?COMPOSE_FILE is required}"
  : "${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required}"
  mkdir -p "$BACKUP_ROOT"/{daily,weekly,monthly,state,locks}
  {
    write_shell_value BACKUP_ROOT "$BACKUP_ROOT"
    write_shell_value COMPOSE_FILE "$COMPOSE_FILE"
    write_shell_value COMPOSE_ENV_FILE "$COMPOSE_ENV_FILE"
    write_shell_value COMPOSE_OVERRIDE_FILE "${COMPOSE_OVERRIDE_FILE:-}"
    write_shell_value METADATA_HELPER "$INSTALL_ROOT/backup_metadata.py"
    write_shell_value POSTGRES_IMAGE "${POSTGRES_IMAGE:-postgres:16-alpine}"
  } > /etc/dashboard-backup.conf
  chmod 0600 /etc/dashboard-backup.conf
  install -m 0644 "$SOURCE_DIR/systemd/dashboard-postgres-backup.service" "$SYSTEMD_DIR/dashboard-postgres-backup.service"
  install -m 0644 "$SOURCE_DIR/systemd/dashboard-postgres-backup.timer" "$SYSTEMD_DIR/dashboard-postgres-backup.timer"
  systemctl daemon-reload
  systemctl enable --now dashboard-postgres-backup.timer
  if [[ -n ${BACKUP_PUBLIC_KEY:-} ]]; then
    printf 'Add this restricted authorized_keys entry:\n'
    printf 'restrict,command="%s/production-backup-command.sh" %s\n' "$INSTALL_ROOT" "$BACKUP_PUBLIC_KEY"
  fi
else
  : "${RESTORE_STAGING_DIR:?RESTORE_STAGING_DIR is required}"
  : "${COMPOSE_FILE:?COMPOSE_FILE is required}"
  : "${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required}"
  mkdir -p "$RESTORE_STAGING_DIR"
  {
    write_shell_value RESTORE_STAGING_DIR "$RESTORE_STAGING_DIR"
    write_shell_value RESTORE_VALIDATOR "$INSTALL_ROOT/validate-postgres-restore.sh"
    write_shell_value COMPOSE_FILE "$COMPOSE_FILE"
    write_shell_value COMPOSE_ENV_FILE "$COMPOSE_ENV_FILE"
    write_shell_value COMPOSE_OVERRIDE_FILE "${COMPOSE_OVERRIDE_FILE:-}"
  } > /etc/dashboard-restore.conf
  chmod 0600 /etc/dashboard-restore.conf
  if [[ -n ${RESTORE_PUBLIC_KEY:-} ]]; then
    printf 'Add this restricted authorized_keys entry:\n'
    printf 'restrict,command="%s/test-restore-command.sh" %s\n' "$INSTALL_ROOT" "$RESTORE_PUBLIC_KEY"
  fi
fi

printf 'backup_automation_mode=%s\n' "$MODE"
printf 'backup_automation_install_root=%s\n' "$INSTALL_ROOT"
