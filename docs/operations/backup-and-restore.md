# Backup and restore runbook

## Policy

Production keeps local PostgreSQL custom-format backups created with `pg_dump -Fc`, with **7 daily**, **4 weekly**, and **3 monthly** restore points. Every managed dump must be non-empty, pass `pg_restore --list`, and have a matching `sha256sum`. Existing unmanaged/manual backups are never pruned.

The production systemd timer creates backups independently of GitHub. GitHub Environment `backup-automation` monitors freshness and performs an isolated weekly restore on test. No backup is uploaded as a GitHub artifact.

## Production installation

Run the installer from a verified release as root with the current Compose and shared environment paths:

```bash
sudo MODE=production \
  BACKUP_ROOT=/absolute/backup/root \
  COMPOSE_FILE=/absolute/release/server/docker-compose.yml \
  COMPOSE_ENV_FILE=/absolute/shared/.env \
  COMPOSE_OVERRIDE_FILE=/absolute/shared/docker-compose.override.yml \
  BACKUP_PUBLIC_KEY='ssh-ed25519 AAAA... dashboard-backup' \
  ops/backup/install-backup-automation.sh
```

Install the printed `forced command` line in the automation account's `authorized_keys`. The `restrict` option disables shell, PTY, forwarding, and agent access. The key permits only `status`, `verify`, and `stream-latest`.

Create and inspect the first backup:

```bash
sudo systemctl start dashboard-postgres-backup.service
sudo systemctl status dashboard-postgres-backup.service
sudo systemctl enable --now dashboard-postgres-backup.timer
systemctl list-timers dashboard-postgres-backup.timer
sudo journalctl -u dashboard-postgres-backup.service
```

Confirm `state/latest.json`, the referenced `.dump`, and `.sha256` exist. Verify manually with `sha256sum -c` and `pg_restore --list` before relying on the timer.

## Test restore installation

Install the restore validator without enabling a backup timer:

```bash
sudo MODE=test \
  RESTORE_STAGING_DIR=/absolute/restore-staging \
  RESTORE_USER=viktor \
  COMPOSE_FILE=/absolute/release/server/docker-compose.yml \
  COMPOSE_ENV_FILE=/absolute/shared/.env \
  COMPOSE_OVERRIDE_FILE=/absolute/shared/docker-compose.override.yml \
  RESTORE_PUBLIC_KEY='ssh-ed25519 AAAA... dashboard-restore' \
  ops/backup/install-backup-automation.sh
```

Install the printed restricted key entry. It permits only `upload <run-id>` and `restore <run-id>`. Restore databases must match `dashboard_restore_check_<digits>`; the live test database name is rejected by construction. Cleanup drops the temporary database and deletes the staged dump on success or failure.

## GitHub Environment

Create `backup-automation` without a deployment approval rule. Add secrets:

- `PROD_BACKUP_SSH_PRIVATE_KEY`
- `TEST_RESTORE_SSH_PRIVATE_KEY`

Add variables:

- `PROD_BACKUP_HOST`, `PROD_BACKUP_PORT`, `PROD_BACKUP_USER`
- `TEST_RESTORE_HOST`, `TEST_RESTORE_PORT`, `TEST_RESTORE_USER`
- `MIN_BACKUP_BYTES`
- `MIN_FREE_BYTES`

Run `Backup monitor` manually with `run_restore=false` for monitoring, then with `run_restore=true` for the first isolated drill. Standard GitHub Actions notifications report failures.

## Failure handling

- Backup service failure: inspect systemd journal, Docker/PostgreSQL health, filesystem permissions, and free disk. The previous state remains valid.
- Checksum or `pg_restore --list` failure: quarantine the affected dump; do not prune the previous valid copy.
- Monitoring failure: correct freshness, size, checksum, or disk issue before the 36-hour threshold expires.
- Restore drill failure: inspect the job and test Docker logs. Verify the temporary database and staging file were removed.
- Rotate a restricted key by installing the new public key, updating the matching Environment secret, proving the new key, and removing the old line.

## Manual production restore

Replacing production is **destructive** and is never automatic. Schedule a maintenance window, stop writes, create a fresh incident backup, verify the chosen dump and checksum, and obtain a second operator confirmation.

Restore only after confirming the target database and rollback plan. A typical approved recovery uses `pg_restore --clean --if-exists --exit-on-error --no-owner --no-acl` against the explicitly selected database. Afterward validate migration tables, primary keys, row counts, application logs, and public health before reopening access.

## Uninstall

Disable scheduling before removing units:

```bash
sudo systemctl disable --now dashboard-postgres-backup.timer
sudo rm /etc/systemd/system/dashboard-postgres-backup.timer /etc/systemd/system/dashboard-postgres-backup.service
sudo systemctl daemon-reload
```

Remove forced key lines and GitHub secrets separately. Do not delete backup files during uninstall; retention data requires an explicit operator decision.
