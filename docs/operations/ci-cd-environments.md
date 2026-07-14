# CI/CD environments runbook

## Delivery flow

Pull requests and pushes to `main` run the `CI` workflow. A successful CI run for a push to `main` automatically invokes `Deploy test` for the exact commit SHA. `Deploy production` is started manually with a full SHA already reachable from `main`; its deploy job is gated by the GitHub Environment named `production`.

Each server stores immutable releases below `RELEASE_ROOT/releases/<sha>`. The `RELEASE_ROOT/current` symlink identifies the active release. The previous release is retained for application rollback.

## One-time deploy keys

Create separate Ed25519 key pairs for test and production on an administrator workstation. Do not reuse a personal SSH key and do not add a passphrase because GitHub Actions cannot answer an interactive prompt.

```bash
ssh-keygen -t ed25519 -C dashboard-test-deploy -f dashboard-test-deploy
ssh-keygen -t ed25519 -C dashboard-production-deploy -f dashboard-production-deploy
```

Install only each `.pub` key in the target deployment account's `~/.ssh/authorized_keys`. The account needs write access to `RELEASE_ROOT` and `/tmp`, read access to `SHARED_CONFIG_DIR`, and permission to run `docker compose` without an interactive password. It must not access the other environment.

Verify non-interactively before configuring GitHub:

```bash
ssh -o BatchMode=yes -i dashboard-test-deploy -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" \
  'docker compose version'
```

Store the private key contents only as the Environment secret `DEPLOY_SSH_PRIVATE_KEY`. Remove workstation copies after both workflows have been proven and an approved recovery location exists.

## Server layout

Create a separate root and shared directory on each server:

```text
RELEASE_ROOT/
  releases/
  backups/
  current -> releases/<sha>
  deploy.lock

SHARED_CONFIG_DIR/
  .env
  vapid_private.pem
  docker-compose.override.yml  # optional, environment-specific
```

The shared `.env` retains database, JWT, administrator, CORS, proxy, and public VAPID configuration. Do not place `DASHBOARD_VERSION` or `DASHBOARD_ENVIRONMENT` there; the workflow supplies them for each release. Keep `vapid_private.pem` readable only by the deployment account.

If the server requires host port mappings or a pre-existing proxy network, preserve them in the shared `docker-compose.override.yml`. The release script automatically includes that file when present.

## GitHub Environments

Create Environments named exactly `test` and `production` in repository settings. Add these variables separately to each:

| Name | Meaning |
| --- | --- |
| `DEPLOY_HOST` | SSH hostname or IP address |
| `DEPLOY_PORT` | SSH port |
| `DEPLOY_USER` | Dedicated deployment account |
| `PUBLIC_HEALTH_URL` | Public origin without a trailing slash |
| `RELEASE_ROOT` | Absolute release root on the server |
| `SHARED_CONFIG_DIR` | Absolute server-owned configuration directory |

Add `DEPLOY_SSH_PRIVATE_KEY` as an Environment secret, not a repository variable. Configure **required reviewers** on the `production` Environment and prevent self-review when repository policy allows it. Test does not require approval because promotion follows successful `main` CI automatically.

## Test deployment

After merging a pull request, open Actions → `CI`. All five jobs must succeed. The subsequent `Deploy test` run must identify the same SHA and report the public health URL.

```bash
curl -fsS "$PUBLIC_HEALTH_URL/api/health"
```

The result must contain `status=ok`, the exact merged SHA in `version`, and `environment=test`.

## Production promotion

1. Confirm the selected full SHA is deployed successfully on test.
2. Open Actions → `Deploy production` → Run workflow.
3. Paste the full 40-character SHA from `main`.
4. Review and approve the protected `production` job.
5. Confirm the job reports a non-empty backup before activation.
6. Verify public health reports the selected SHA and `environment=production`.

The production script runs `pg_dump` inside `dashboard-db` before restarting application containers. Backups are stored below `RELEASE_ROOT/backups` and are never uploaded to GitHub.

## Application rollback

If candidate health validation fails after activation starts, the release script automatically runs the previous release, checks its local and public health, and restores the `current` symlink. SQL migrations are not reversed.

For a deliberate application rollback, manually run the previous release's Compose files with its SHA and environment exported, verify health, then repoint `current`. Use the same `SHARED_CONFIG_DIR/.env` and optional override used by automated deployment. Record the incident before promoting another SHA.

## Database restore

Database restore is manual and destructive. Stop application writes, take an additional incident backup, identify the required SQL backup created by `pg_dump`, and have a second operator confirm the target database.

For the current plain-SQL format:

```bash
docker compose stop dashboard-api
docker compose exec -T dashboard-db psql -U dashboard -d dashboard < /absolute/path/to/backup.sql
docker compose start dashboard-api
```

If a future backup uses custom format, use `pg_restore` instead. Always validate row counts, migration tables, application logs, and both health endpoints before reopening access. Never restore automatically as part of application rollback.

## Diagnosing failures

- CI failure: fix the failing source, test, migration, Caddy, release-contract, or Compose job; deployment will not start.
- SSH failure: check Environment variables, deploy key, `authorized_keys`, port, host reachability, and Docker permission.
- Backup failure: do not activate production; check disk space and PostgreSQL container state.
- Health mismatch: compare returned `version` and `environment` with workflow input, then inspect container logs.
- Rollback failure: preserve the workflow log and backup path, stop further promotions, and restore service manually from the previous release.

## Alignment check

Local should report `version=dev` and `environment=local`. Test and production should report the same promoted full SHA with their respective environment names. A deployment is complete only when GitHub run status, server release path, and public health response agree.
