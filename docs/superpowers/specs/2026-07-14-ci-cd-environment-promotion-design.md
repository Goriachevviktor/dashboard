# CI/CD Environment Promotion Design

## Goal

Make every change pass repeatable checks, deploy each successful `main` commit automatically to the test server, and allow the same verified commit to be promoted manually to production with approval, backup, health verification, and rollback.

## Scope

This phase adds:

- required CI checks for pull requests and `main`;
- application version and environment identity in the health response;
- automatic release-by-SHA deployment from `main` to test;
- manual release-by-SHA deployment to production through a protected GitHub Environment;
- pre-production database backup, post-deployment verification, and automatic rollback on failure;
- deployment documentation and a documented one-time credentials setup.

It does not fix the repository-wide legacy ESLint backlog, introduce a container registry, or move server secrets into GitHub. Existing server `.env`, VAPID material, proxy configuration, and persistent database volumes remain server-owned.

## Delivery Architecture

GitHub Actions is the control plane. CI validates source code and images. Deployment jobs connect with dedicated SSH keys and invoke one shared release script on the target server. The script creates an immutable directory named with the full Git SHA, installs the checked-out source archive there, reuses environment-owned configuration, starts the release, validates it, and records it as current only after success.

Test deployment runs automatically after CI succeeds on `main`. Production deployment is a separate `workflow_dispatch` operation targeting the protected `production` GitHub Environment. The selected SHA must belong to `main`; production uses the same release script and source artifact as test.

## Continuous Integration

CI runs for pull requests targeting `main` and for pushes to `main`. It contains these gates:

1. Frontend unit tests and production build.
2. ESLint regression check limited to changed JavaScript and JSX files, so existing unrelated lint debt does not block delivery while new violations do.
3. Backend tests against PostgreSQL 16, including migration compatibility and owner-isolation coverage.
4. Caddy contract tests.
5. Docker Compose image build using required non-secret placeholder variables.

Deployment jobs depend on all gates. A concurrency group per environment prevents two releases from modifying the same server simultaneously; a newer run does not cancel a release already in progress.

## Runtime Version Contract

The API reads two environment variables:

- `DASHBOARD_VERSION`: full Git commit SHA;
- `DASHBOARD_ENVIRONMENT`: `local`, `test`, or `production`.

`GET /api/health` returns:

```json
{
  "status": "ok",
  "version": "18219e5444335fe25f4939b2ec0d3afc7084420a",
  "environment": "test"
}
```

Local Compose defaults are `version: "dev"` and `environment: "local"`. CI tests the exact response contract. Deployment health verification requires both `status == "ok"` and exact equality between the returned version and the requested release SHA.

## Release Layout and Activation

Each server has stable environment-owned paths:

- a releases directory containing one subdirectory per full SHA;
- a current symlink identifying the active release;
- a shared configuration directory containing `.env`, VAPID material, and optional Compose override;
- a backups directory;
- a deployment lock.

The release process is idempotent. Re-running a SHA reuses or safely reconstructs its release directory. Source comes from a GitHub-generated archive for the exact workflow SHA and never from an unverified mutable server checkout.

Activation sequence:

1. Acquire the environment deployment lock.
2. Validate the SHA and release paths.
3. Upload and extract the exact source archive into a temporary release directory.
4. Attach server-owned configuration without copying secrets back to GitHub.
5. Build the frontend and Docker images.
6. For production, create a timestamped PostgreSQL backup and verify it is non-empty.
7. Start the candidate release and let application migrations run.
8. Verify container state, local health, public health, and exact returned SHA.
9. Mark the candidate as current and retain the previous release.
10. Prune only old inactive releases according to a documented retention count.

Because the current Compose stack uses fixed container names and persistent volumes, activation is a controlled in-place restart rather than zero-downtime blue/green deployment.

## Failure and Rollback

Any failure after the previous release is recorded triggers application rollback to the previous release's source and Compose configuration. The rollback restarts the prior application version and verifies its local and public health response.

Database migrations must remain backward-compatible with the immediately previous application release. Automatic rollback does not reverse SQL migrations. A production database backup is mandatory before the candidate starts, and destructive or backward-incompatible migrations require a separate reviewed maintenance procedure outside this workflow.

If rollback also fails, the workflow stops, preserves logs and backup paths in its output, and exits unsuccessfully. It never reports a deployment as successful solely because containers started.

## GitHub Environments and Secrets

Use GitHub Environments named `test` and `production`. `production` must have required reviewers configured in repository settings.

Environment secrets and variables contain only connection and routing information:

- SSH host, port, user, and a dedicated private deploy key;
- public health URL;
- server release root and shared configuration path.

Passwords are not stored in workflows. Dedicated public keys are installed once on each server with the minimum permissions needed for the release paths and Docker operations. Application secrets remain in server-owned `.env` and key files.

## Workflows

The repository contains:

- one CI workflow used by pull requests and `main`;
- one test deployment workflow triggered after successful CI for the exact `main` SHA;
- one production promotion workflow started manually with a full SHA input.

The production workflow verifies through the GitHub API or Git ancestry that the selected SHA is reachable from `origin/main`. It uses the protected `production` environment, creates a backup, deploys, and publishes a concise job summary containing environment, SHA, health URL, backup path, and rollback result.

## Testing

Automated coverage includes:

- backend test for configured and default health metadata;
- shell-level tests for release input validation, health response validation, and rollback decision logic without connecting to a real server;
- workflow syntax validation where supported locally;
- existing frontend, backend, migration, and Caddy suites;
- a local Compose smoke test confirming `local/dev` metadata;
- a test deployment proving the public test health endpoint returns the merged SHA;
- a manually approved production deployment proving production returns the same SHA.

## Operational Documentation

Documentation defines:

- the one-time SSH deploy-key setup;
- required GitHub Environment variables, secrets, and production reviewer rule;
- server shared-directory layout;
- automatic test flow and manual production promotion;
- rollback and database restore procedures;
- how to compare deployed SHA values across local, test, and production.

## Acceptance Criteria

- Every pull request receives the defined CI gates.
- A successful push to `main` automatically deploys that exact SHA to test.
- A failed CI run never starts deployment.
- Production deploys only through a manual, approved environment job.
- Test and production public health responses identify their environment and exact deployed SHA.
- Production backup is created and validated before restart.
- Failed health verification restores the previous application release or clearly reports rollback failure.
- No application password, SSH password, VAPID private key, or database secret is committed or printed in workflow logs.
