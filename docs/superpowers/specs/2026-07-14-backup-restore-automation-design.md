# Backup and Restore Automation Design

## Goal

Create verified local PostgreSQL backups on production independently of GitHub availability, retain useful restore points, monitor backup health through GitHub Actions, and prove weekly that the newest production backup restores successfully into an isolated temporary database on the test server.

## Scope

This phase includes:

- a production backup script and systemd service/timer;
- daily, weekly, and monthly retention;
- backup integrity and checksum verification;
- machine-readable state for the last successful backup;
- scheduled GitHub monitoring with standard Actions failure notifications;
- weekly transfer of the latest backup through an ephemeral GitHub runner;
- isolated restore validation on test;
- dedicated restricted SSH credentials for backup automation;
- an operator runbook and manual recovery procedure.

Backups remain stored locally on production. External off-site storage, Telegram notifications, point-in-time WAL recovery, and automatic replacement of the production database are outside this phase.

## Production backup format and layout

Backups use PostgreSQL custom format produced by `pg_dump -Fc`. The production backup root contains:

```text
backup-root/
  daily/
  weekly/
  monthly/
  state/
    latest.json
  locks/
    backup.lock
```

Each completed backup has a `.dump` file and adjacent `.sha256` checksum. Files are written under a temporary name in the target filesystem, verified, and atomically renamed only after success. Partial files are removed by a cleanup trap.

The backup script executes `pg_dump` inside the existing PostgreSQL container. It validates the result with `pg_restore --list`, verifies the file is non-empty, calculates SHA-256, and writes `latest.json` atomically. State contains schema version, UTC completion time, filename, byte size, checksum, and retention classes assigned to the backup. It never contains database credentials.

## Retention

One successful dump may be retained in more than one class without duplicating its contents unnecessarily; hard links are used when the filesystem supports them, otherwise a verified copy is created.

Retention is:

- latest 7 daily restore points;
- latest 4 weekly restore points, selected on the configured weekly day;
- latest 3 monthly restore points, selected on the first successful backup of a UTC calendar month.

Pruning occurs only after a new backup has passed integrity checks and state has been updated. The script never deletes the newest valid restore point. Files not matching the managed naming convention are ignored.

## Scheduling and failure behavior

A systemd oneshot service runs the backup script. A persistent daily timer catches up after a reboot. `flock` prevents overlapping backup and deployment backup operations from writing the same managed location.

The service uses bounded execution time and restrictive file permissions. Failure leaves the previous successful backup and state untouched, returns non-zero, and appears in the systemd journal. The production application and database remain running.

## Restricted automation access

Backup monitoring uses a separate Ed25519 key, not the deployment key. Its production `authorized_keys` entry is restricted to a forced command wrapper and disables PTY, agent forwarding, port forwarding, and user-controlled commands.

The wrapper permits only these operations:

- `status`: output non-secret `latest.json` and disk-space metadata;
- `verify`: verify checksum and `pg_restore --list` for the latest backup;
- `stream-latest`: stream the latest dump to stdout after verification.

The test restore key is also separate from deployment access. Its forced wrapper permits only upload to an automation-owned temporary path and execution of the repository restore validation script. It cannot operate on the live test database name.

GitHub stores both restricted private keys in a dedicated `backup-automation` Environment without production deployment approval. No application secret or database password is copied to GitHub.

## Daily GitHub monitoring

A scheduled workflow runs daily and may also be started manually. It connects through the restricted production key and checks:

- `latest.json` is valid and refers to an existing managed file;
- completion time is no older than 36 hours;
- recorded size equals actual size and exceeds a configurable minimum;
- SHA-256 checksum matches;
- `pg_restore --list` succeeds;
- production backup filesystem has at least the configured free-space threshold;
- daily, weekly, and monthly retention counts do not exceed their limits and have at least one valid entry after initial setup.

The workflow publishes a concise job summary. Any failed condition makes the workflow red and relies on standard GitHub Actions notifications.

## Weekly isolated restore validation

The scheduled weekly job performs this sequence:

1. Ask the production wrapper to verify and stream the latest dump.
2. Write it to a runner temporary directory with restrictive permissions.
3. Verify checksum against production state.
4. Upload it using the restricted test restore key.
5. On test, create a database named with a fixed safe prefix plus the GitHub run ID.
6. Restore with `pg_restore --exit-on-error --no-owner --no-acl`.
7. Validate the expected application tables, `app_schema_migrations`, primary-key contracts, and non-negative row counts for core tables.
8. Record only metadata and validation results.
9. Drop the temporary database and delete dump files in unconditional cleanup handlers on test and runner.

The workflow refuses any database name outside the safe prefix. It never connects restore commands to the live test database. Parallel restore jobs are prevented through a concurrency group.

## Repository components

Focused components are:

- a pure retention and metadata helper with unit tests;
- a production backup script with fake-command contract tests;
- a production forced-command wrapper with allow-list tests;
- a test restore validation script with database-name safety tests;
- a test forced-command wrapper with allow-list tests;
- systemd unit templates;
- scheduled GitHub workflows and workflow contract tests;
- an installation and recovery runbook.

Scripts use strict shell mode, absolute paths, explicit allow lists, and no evaluation of caller-provided shell fragments.

## Initial rollout

1. Verify scripts with fakes locally.
2. Install backup script and systemd units on test in a non-production sandbox and generate a disposable backup.
3. Install restricted wrappers and keys.
4. Install production backup automation without deleting existing manual backups.
5. Run the first production backup manually and verify its state/checksum.
6. Enable the production timer.
7. Run daily GitHub monitoring manually.
8. Run weekly restore validation manually against a temporary test database.
9. Confirm live production and test health and data counts are unchanged.

## Acceptance criteria

- Production has a non-empty custom-format backup with matching SHA-256 and successful `pg_restore --list`.
- systemd timer is enabled and scheduled; its service succeeds manually.
- Retention enforces 7 daily, 4 weekly, and 3 monthly restore points without deleting unmanaged files.
- GitHub daily monitoring succeeds and reports backup age, size, retention, and free space.
- Weekly restore succeeds into a temporary test database, validates required contracts, and removes the database afterward.
- Live test and production databases are not modified by the restore drill.
- Restricted keys cannot open an interactive shell or execute commands outside their allow lists.
- No backup content, application secret, private key, or database credential is committed or retained as a GitHub artifact.
