# Backup and Restore Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create daily verified production PostgreSQL backups with 7/4/3 retention, monitor them through GitHub, and restore the newest backup weekly into an isolated temporary test database.

**Architecture:** Production systemd owns backup creation so it is independent of GitHub. Restricted forced-command SSH keys expose only status, verification, streaming, upload, and isolated restore operations. GitHub Actions monitors backup health daily and orchestrates the weekly ephemeral transfer and restore drill.

**Tech Stack:** Bash, Python standard library, PostgreSQL 16 tools, Docker Compose, systemd, SSH forced commands, GitHub Actions.

## Global Constraints

- Retain 7 daily, 4 weekly, and 3 monthly restore points.
- Backups use PostgreSQL custom format and SHA-256 checksums.
- Production backups stay local; GitHub artifacts must never contain database content.
- Weekly restore uses a temporary database with prefix `dashboard_restore_check_` and never the live test database.
- Temporary runner files, server uploads, and restore databases are removed in unconditional cleanup.
- Backup and restore SSH keys cannot provide an interactive shell.
- Existing deploy keys, releases, databases, and manual backups remain untouched.

---

### Task 1: Backup metadata and retention helper

**Files:**
- Create: `ops/backup/backup_metadata.py`
- Create: `ops/tests/test_backup_metadata.py`

**Interfaces:**
- Produces: CLI commands `state`, `validate-state`, and `retention-plan` using JSON on stdout.
- Consumes: completed dump path, UTC timestamp, byte size, checksum, and directory inventory.

- [ ] **Step 1: Write failing unit tests**

Cover atomic state payload fields, 36-hour freshness validation, managed filename parsing, 7/4/3 retention selection, preservation of newest backup, and ignoring unmanaged files.

- [ ] **Step 2: Verify RED**

Run: `python3 -m unittest ops/tests/test_backup_metadata.py -v`

Expected: FAIL because the helper module is missing.

- [ ] **Step 3: Implement the minimal standard-library helper**

Use `argparse`, `datetime`, `json`, `pathlib`, and deterministic sorting. Accept only names matching `dashboard-YYYYmmddTHHMMSSZ.dump` and emit no credentials.

- [ ] **Step 4: Verify GREEN**

Run: `python3 -m unittest ops/tests/test_backup_metadata.py -v`

Expected: all metadata and retention tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ops/backup/backup_metadata.py ops/tests/test_backup_metadata.py
git commit -m "feat: add backup metadata and retention rules"
```

### Task 2: Production backup script

**Files:**
- Create: `ops/backup/create-postgres-backup.sh`
- Create: `ops/tests/create_postgres_backup_test.sh`

**Interfaces:**
- Consumes: `BACKUP_ROOT`, `COMPOSE_FILE`, `COMPOSE_ENV_FILE`, optional `COMPOSE_OVERRIDE_FILE`, and retention helper.
- Produces: verified `.dump`, `.sha256`, `state/latest.json`, and pruned managed retention links.

- [ ] **Step 1: Write a failing fake-command contract test**

Use temporary fake `docker`, `pg_restore`, and checksum commands to assert strict mode, `flock`, restrictive umask, temporary output, non-empty check, `pg_restore --list`, checksum creation, atomic rename, atomic state update, 7/4/3 pruning, and cleanup after simulated failure.

- [ ] **Step 2: Verify RED**

Run: `bash ops/tests/create_postgres_backup_test.sh`

Expected: FAIL because the script is missing.

- [ ] **Step 3: Implement backup state machine**

Run `docker compose exec -T dashboard-db pg_dump -U dashboard -d dashboard -Fc`, verify with a disposable PostgreSQL tools container or host `pg_restore`, invoke the metadata helper, create retention hard links where supported, and prune only managed files after success.

- [ ] **Step 4: Verify GREEN and syntax**

Run:

```bash
bash -n ops/backup/create-postgres-backup.sh
bash ops/tests/create_postgres_backup_test.sh
```

Expected: all backup contracts PASS.

- [ ] **Step 5: Commit**

```bash
git add ops/backup/create-postgres-backup.sh ops/tests/create_postgres_backup_test.sh
git commit -m "feat: create verified postgres backups"
```

### Task 3: Restricted production backup wrapper

**Files:**
- Create: `ops/backup/production-backup-command.sh`
- Create: `ops/tests/production_backup_command_test.sh`

**Interfaces:**
- Consumes: exact `SSH_ORIGINAL_COMMAND` values `status`, `verify`, and `stream-latest`.
- Produces: JSON metadata, verification result, or verified dump bytes.

- [ ] **Step 1: Write failing allow-list tests**

Assert the wrapper rejects empty input, arguments, shell metacharacters, unknown commands, PTY use, and direct file paths. Assert each allowed command invokes only the expected fixed script/path.

- [ ] **Step 2: Verify RED**

Run: `bash ops/tests/production_backup_command_test.sh`

Expected: FAIL because the wrapper is missing.

- [ ] **Step 3: Implement fixed command dispatch**

Use a `case` statement on exact strings, fixed absolute configuration paths supplied at installation, checksum verification before streaming, and stderr for diagnostics so dump stdout is clean.

- [ ] **Step 4: Verify GREEN**

Run: `bash ops/tests/production_backup_command_test.sh`

- [ ] **Step 5: Commit**

```bash
git add ops/backup/production-backup-command.sh ops/tests/production_backup_command_test.sh
git commit -m "feat: restrict production backup access"
```

### Task 4: Isolated test restore validation

**Files:**
- Create: `ops/backup/validate-postgres-restore.sh`
- Create: `ops/backup/test-restore-command.sh`
- Create: `ops/tests/validate_postgres_restore_test.sh`
- Create: `ops/tests/test_restore_command_test.sh`

**Interfaces:**
- Consumes: GitHub run ID and uploaded custom-format dump in a fixed staging directory.
- Produces: validation JSON and unconditional deletion of temporary database and dump.

- [ ] **Step 1: Write failing safety tests**

Assert run IDs accept digits only, generated database names start with `dashboard_restore_check_`, live database names are rejected, `createdb`, `pg_restore --exit-on-error --no-owner --no-acl`, contract SQL, `dropdb --if-exists`, and file cleanup execute in the required order. Test cleanup on restore and validation failures.

- [ ] **Step 2: Verify RED**

Run:

```bash
bash ops/tests/validate_postgres_restore_test.sh
bash ops/tests/test_restore_command_test.sh
```

- [ ] **Step 3: Implement restore validator and forced wrapper**

Run PostgreSQL tools inside `dashboard-db`, terminate only connections to the temporary database during cleanup, verify required tables and `app_schema_migrations`, check roadmap composite primary key, and return non-negative counts for users, tasks, events, mind maps, and roadmaps.

- [ ] **Step 4: Verify GREEN and syntax**

Run all Task 4 tests plus `bash -n` on both scripts.

- [ ] **Step 5: Commit**

```bash
git add ops/backup/validate-postgres-restore.sh ops/backup/test-restore-command.sh ops/tests/validate_postgres_restore_test.sh ops/tests/test_restore_command_test.sh
git commit -m "feat: validate backups in isolated test databases"
```

### Task 5: systemd units and installer

**Files:**
- Create: `ops/backup/systemd/dashboard-postgres-backup.service`
- Create: `ops/backup/systemd/dashboard-postgres-backup.timer`
- Create: `ops/backup/install-backup-automation.sh`
- Create: `ops/tests/backup_install_contract_test.sh`

**Interfaces:**
- Produces: daily persistent timer and idempotent installation into administrator-selected absolute paths.

- [ ] **Step 1: Write failing installation contracts**

Require `Type=oneshot`, bounded timeout, restrictive umask, `Persistent=true`, daily schedule with randomized delay, explicit environment file, `systemctl daemon-reload`, enable/start timer, and no timer start before files and permissions are ready.

- [ ] **Step 2: Verify RED**

Run: `bash ops/tests/backup_install_contract_test.sh`

- [ ] **Step 3: Implement units and idempotent installer**

Installer requires root, copies versioned scripts, creates backup directories without deleting existing content, writes configuration from explicit arguments, installs forced-command wrappers, and prints public-key `authorized_keys` templates without private keys.

- [ ] **Step 4: Verify GREEN**

Run contract tests and `systemd-analyze verify` in a Linux container for both unit files.

- [ ] **Step 5: Commit**

```bash
git add ops/backup/systemd ops/backup/install-backup-automation.sh ops/tests/backup_install_contract_test.sh
git commit -m "feat: schedule daily production backups"
```

### Task 6: GitHub backup monitoring and restore drill

**Files:**
- Create: `.github/workflows/backup-monitor.yml`
- Modify: `ops/tests/workflow_contract_test.py`

**Interfaces:**
- Consumes: Environment `backup-automation`, restricted keys, production/test host variables, and scheduled/manual triggers.
- Produces: daily monitoring summary and weekly isolated restore result without database artifacts.

- [ ] **Step 1: Add failing workflow contract tests**

Require daily and weekly cron schedules, `workflow_dispatch`, read-only contents permission, environment/concurrency, Node.js 24 Actions, no artifact upload, restricted SSH keys, 36-hour freshness, checksum verification, runner cleanup trap, test wrapper invocation with `github.run_id`, and job summaries.

- [ ] **Step 2: Verify RED**

Run: `python3 ops/tests/workflow_contract_test.py`

- [ ] **Step 3: Implement scheduled workflow**

Use separate monitor and weekly restore jobs. Stream the dump to `${RUNNER_TEMP}` with `umask 077`, verify against state, transfer to the fixed test staging path, invoke the exact restore command, and delete the runner file in an `if: always()` cleanup step.

- [ ] **Step 4: Verify GREEN and actionlint**

```bash
python3 ops/tests/workflow_contract_test.py
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/backup-monitor.yml ops/tests/workflow_contract_test.py
git commit -m "ci: monitor backups and verify weekly restores"
```

### Task 7: Operations runbook

**Files:**
- Create: `docs/operations/backup-and-restore.md`
- Modify: `server/README.md`
- Create: `ops/tests/backup_documentation_contract_test.sh`

**Interfaces:**
- Produces: install, retention, monitoring, restore drill, manual restore, key rotation, disk-full response, and uninstall instructions.

- [ ] **Step 1: Write failing documentation contract**

Require exact retention counts, paths, service/timer commands, GitHub Environment variables/secrets, forced-key restrictions, manual backup/verify commands, temporary restore safety, and destructive restore warning.

- [ ] **Step 2: Verify RED**

Run: `bash ops/tests/backup_documentation_contract_test.sh`

- [ ] **Step 3: Write runbook and README link**

Document that production replacement is manual, requires a fresh incident backup and second confirmation, and uses `pg_restore --clean --if-exists` only during an approved maintenance window.

- [ ] **Step 4: Verify GREEN and secret hygiene**

Run documentation contract and repository secret-pattern scan.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/backup-and-restore.md server/README.md ops/tests/backup_documentation_contract_test.sh
git commit -m "docs: add backup and recovery runbook"
```

### Task 8: Full verification and staged rollout

**Files:**
- Modify only files required to correct verification failures.

**Interfaces:**
- Produces: verified production timer, first managed backup, GitHub monitor, weekly restore proof, and unchanged live database health.

- [ ] **Step 1: Run all local checks**

```bash
git diff --check
python3 -m unittest ops/tests/test_backup_metadata.py -v
bash ops/tests/create_postgres_backup_test.sh
bash ops/tests/production_backup_command_test.sh
bash ops/tests/validate_postgres_restore_test.sh
bash ops/tests/test_restore_command_test.sh
bash ops/tests/backup_install_contract_test.sh
bash ops/tests/backup_documentation_contract_test.sh
python3 ops/tests/workflow_contract_test.py
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

- [ ] **Step 2: Publish through required CI**

Push the feature branch, open a PR, wait for all required checks, merge, and verify automatic application test deployment still succeeds.

- [ ] **Step 3: Install in test sandbox**

Install scripts under an isolated test backup root, run a disposable backup against test, verify state/checksum/retention, and remove the sandbox after evidence is captured.

- [ ] **Step 4: Install restricted keys and GitHub Environment**

Create separate keys, forced `authorized_keys` entries, and `backup-automation` variables/secrets. Prove interactive and unknown commands are rejected before continuing.

- [ ] **Step 5: Install production timer and create first backup**

Preserve existing manual backups, install units, run the service manually, verify custom-format dump/checksum/state, enable timer, and inspect next trigger.

- [ ] **Step 6: Run GitHub monitor manually**

Confirm backup freshness, integrity, retention, size, free disk, and zero warning annotations.

- [ ] **Step 7: Run weekly restore manually**

Confirm temporary database creation, required data contracts, successful cleanup, and unchanged live test/production health and row counts.

- [ ] **Step 8: Promote application SHA and final audit**

Promote the merged application SHA to production through the existing approved workflow, record its deployment backup separately, and confirm main/test/production SHA plus backup automation evidence before completion.
