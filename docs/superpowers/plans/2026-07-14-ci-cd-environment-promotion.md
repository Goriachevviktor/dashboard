# CI/CD Environment Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate every pull request, expose the exact runtime environment and Git SHA, deploy successful `main` commits automatically to test, and promote an approved `main` SHA manually to production with backup and rollback.

**Architecture:** FastAPI exposes immutable deployment metadata supplied through Compose. GitHub Actions runs source and container gates, packages the exact commit, and sends it to a shared, tested server-side release script over SSH. Test promotion follows successful CI automatically; production promotion uses a protected GitHub Environment and the same release mechanism with mandatory PostgreSQL backup.

**Tech Stack:** GitHub Actions, Bash, SSH, Docker Compose, FastAPI, PostgreSQL 16, React/Vite, Node test runner, pytest.

## Global Constraints

- Release identity is the full 40-character Git SHA from `main`.
- Runtime environments are exactly `local`, `test`, and `production`.
- Application secrets, database credentials, VAPID private material, and SSH passwords must remain outside Git and workflow logs.
- Test deployment is automatic only after all CI jobs succeed for a push to `main`.
- Production deployment is manual and targets the protected GitHub Environment named `production`.
- SQL migrations must remain backward-compatible with the immediately previous application release; automated rollback never reverses migrations.
- Existing repository-wide ESLint debt is not made blocking; changed JavaScript and JSX files must pass ESLint.

---

### Task 1: Runtime version contract

**Files:**
- Modify: `server/api/app/config.py`
- Modify: `server/api/app/main.py`
- Modify: `server/docker-compose.yml`
- Test: `server/api/tests/test_runtime_contracts.py`

**Interfaces:**
- Consumes: `DASHBOARD_VERSION` and `DASHBOARD_ENVIRONMENT` environment variables.
- Produces: `GET /health -> {status: str, version: str, environment: str}` and matching `/api/health` through Caddy.

- [ ] **Step 1: Write failing tests for configured and default metadata**

Add tests that reload `app.config` and `app.main` under controlled environment values and assert:

```python
def test_health_exposes_deployment_identity(monkeypatch):
    monkeypatch.setenv("DASHBOARD_VERSION", "a" * 40)
    monkeypatch.setenv("DASHBOARD_ENVIRONMENT", "test")
    config = importlib.reload(importlib.import_module("app.config"))
    main = importlib.reload(importlib.import_module("app.main"))
    assert config.VERSION == "a" * 40
    assert main.healthcheck() == {
        "status": "ok",
        "version": "a" * 40,
        "environment": "test",
    }


def test_health_defaults_to_local_development_identity(monkeypatch):
    monkeypatch.delenv("DASHBOARD_VERSION", raising=False)
    monkeypatch.delenv("DASHBOARD_ENVIRONMENT", raising=False)
    config = importlib.reload(importlib.import_module("app.config"))
    main = importlib.reload(importlib.import_module("app.main"))
    assert config.VERSION == "dev"
    assert main.healthcheck() == {
        "status": "ok",
        "version": "dev",
        "environment": "local",
    }
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `cd server && docker compose run --rm dashboard-api pytest -q tests/test_runtime_contracts.py`

Expected: FAIL because `VERSION`, `ENVIRONMENT`, and health metadata do not exist yet.

- [ ] **Step 3: Implement the minimal metadata contract**

In `config.py` define:

```python
VERSION = os.getenv("DASHBOARD_VERSION", "dev")
ENVIRONMENT = os.getenv("DASHBOARD_ENVIRONMENT", "local")
```

Import those constants in `main.py` and return all three fields from `healthcheck`. Add Compose variables:

```yaml
DASHBOARD_VERSION: ${DASHBOARD_VERSION:-dev}
DASHBOARD_ENVIRONMENT: ${DASHBOARD_ENVIRONMENT:-local}
```

- [ ] **Step 4: Verify targeted tests and local Compose response**

Run:

```bash
cd server
docker compose run --rm dashboard-api pytest -q tests/test_runtime_contracts.py
docker compose up -d --build dashboard-api dashboard-web
curl -fsS http://localhost:8080/api/health
```

Expected: tests PASS and health returns `{"status":"ok","version":"dev","environment":"local"}`.

- [ ] **Step 5: Commit runtime metadata**

```bash
git add server/api/app/config.py server/api/app/main.py server/api/tests/test_runtime_contracts.py server/docker-compose.yml
git commit -m "feat: expose deployment identity in health"
```

### Task 2: Testable release validation helpers

**Files:**
- Create: `ops/lib/release_helpers.sh`
- Create: `ops/tests/release_helpers_test.sh`

**Interfaces:**
- Produces: `validate_sha SHA`, `health_matches JSON SHA ENVIRONMENT`, and `should_rollback PREVIOUS_RELEASE ACTIVATION_STARTED` Bash functions.
- Consumed by: `ops/deploy-release.sh` and deployment workflows.

- [ ] **Step 1: Write a failing shell test**

Create a dependency-free test script that sources `ops/lib/release_helpers.sh` and verifies:

```bash
validate_sha 0123456789012345678901234567890123456789
! validate_sha main
health_matches '{"status":"ok","version":"0123456789012345678901234567890123456789","environment":"test"}' \
  0123456789012345678901234567890123456789 test
! health_matches '{"status":"ok","version":"wrong","environment":"test"}' \
  0123456789012345678901234567890123456789 test
should_rollback /srv/releases/previous true
! should_rollback '' true
! should_rollback /srv/releases/previous false
```

The test exits non-zero with a readable assertion count on failure.

- [ ] **Step 2: Run it and verify the expected failure**

Run: `bash ops/tests/release_helpers_test.sh`

Expected: FAIL because `ops/lib/release_helpers.sh` is missing.

- [ ] **Step 3: Implement minimal helpers**

Implement strict SHA validation, JSON validation through Python's standard `json` module, and the rollback predicate. Helpers return status codes and never echo secrets.

- [ ] **Step 4: Verify helper tests**

Run: `bash ops/tests/release_helpers_test.sh`

Expected: all helper assertions PASS.

- [ ] **Step 5: Commit helpers**

```bash
git add ops/lib/release_helpers.sh ops/tests/release_helpers_test.sh
git commit -m "test: define release validation contracts"
```

### Task 3: Idempotent server release script

**Files:**
- Create: `ops/deploy-release.sh`
- Create: `ops/tests/deploy_release_contract_test.sh`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: positional `environment`, `sha`, and uploaded archive; environment variables `RELEASE_ROOT`, `SHARED_CONFIG_DIR`, `PUBLIC_HEALTH_URL`, `RELEASE_RETENTION`, and `CREATE_DB_BACKUP`.
- Consumes helpers: `validate_sha`, `health_matches`, `should_rollback`.
- Produces: immutable `$RELEASE_ROOT/releases/$sha`, `$RELEASE_ROOT/current` symlink, backup path for production, and structured non-secret log lines.

- [ ] **Step 1: Write a failing static and sandbox contract test**

The test creates a temporary fake release root and fake `docker`, `curl`, and `tar` executables. It asserts that the script:

- rejects non-SHA inputs before any mutation;
- acquires `flock` on a stable lock file;
- extracts into a temporary directory and renames it to the SHA directory;
- reads `.env`, VAPID material, and optional `docker-compose.override.yml` only from `SHARED_CONFIG_DIR`;
- exports `DASHBOARD_VERSION=$sha` and the requested environment;
- invokes `pg_dump` and validates a non-empty backup when `CREATE_DB_BACKUP=true`;
- calls local and public health validation;
- restores the previous current target after simulated candidate failure;
- retains the current and previous release while pruning only older inactive releases.

- [ ] **Step 2: Run it and verify the expected failure**

Run: `bash ops/tests/deploy_release_contract_test.sh`

Expected: FAIL because `ops/deploy-release.sh` is missing.

- [ ] **Step 3: Implement the release state machine**

Use `set -Eeuo pipefail`, a cleanup trap, a rollback trap, `flock`, and absolute paths derived below `RELEASE_ROOT`. Never source untrusted archive content. Run Compose with an explicit project directory and shared env file. Record `previous_release` before activation, validate backup size before starting production, and make success contingent on exact local and public health metadata.

The script accepts only:

```text
deploy-release.sh test <40-char-sha> <archive-path>
deploy-release.sh production <40-char-sha> <archive-path>
```

Add runtime upload archives and deployment scratch paths to `.gitignore`.

- [ ] **Step 4: Verify release script contracts**

Run:

```bash
bash -n ops/deploy-release.sh ops/lib/release_helpers.sh
bash ops/tests/release_helpers_test.sh
bash ops/tests/deploy_release_contract_test.sh
```

Expected: syntax check and all assertions PASS.

- [ ] **Step 5: Commit release automation**

```bash
git add .gitignore ops/deploy-release.sh ops/tests/deploy_release_contract_test.sh
git commit -m "feat: add rollback-safe release deployment"
```

### Task 4: Required continuous-integration gates

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `ops/lint-changed-frontend.sh`
- Test: `ops/tests/workflow_contract_test.py`

**Interfaces:**
- Produces: successful `CI` workflow for an exact commit, with jobs named `frontend`, `backend`, `caddy`, `release-contracts`, and `compose-build`.
- Consumed by: `.github/workflows/deploy-test.yml` through `workflow_run` commit identity and conclusion.

- [ ] **Step 1: Write failing workflow contract tests**

Using Python `yaml.safe_load` when available and text assertions otherwise, verify that CI:

- triggers for pull requests to `main` and pushes to `main`;
- grants read-only repository permissions;
- runs frontend Node tests and `npm run build`;
- determines the PR/push base and runs `ops/lint-changed-frontend.sh` only for changed JS/JSX files;
- starts PostgreSQL 16 for backend tests and runs the complete API test suite;
- runs Caddy and release script tests;
- builds Compose images with placeholder environment values;
- never contains literal production hosts, passwords, tokens, or private keys.

- [ ] **Step 2: Run tests and verify the expected failure**

Run: `python3 ops/tests/workflow_contract_test.py`

Expected: FAIL because `.github/workflows/ci.yml` is missing.

- [ ] **Step 3: Implement changed-file lint and CI workflow**

`ops/lint-changed-frontend.sh BASE HEAD` validates revisions, collects added/modified `frontend/**/*.js` and `frontend/**/*.jsx` files with `git diff --diff-filter=AM`, and exits successfully when none changed. Otherwise it runs the repository-local ESLint binary on exactly those paths.

Configure CI caching from `frontend/package-lock.json` and Docker layers where supported. Supply only non-secret placeholder values during Compose build.

- [ ] **Step 4: Verify workflow contract and all local gates**

Run:

```bash
python3 ops/tests/workflow_contract_test.py
bash ops/tests/release_helpers_test.sh
bash ops/tests/deploy_release_contract_test.sh
cd frontend && npm ci && find src -name '*.test.js' -print0 | xargs -0 node --test && npm run build
cd ../server && node --test tests/*.test.js
docker compose run --rm dashboard-api pytest -q
docker compose build
```

Expected: all gates PASS. Any pre-existing full-repository lint errors remain documented but changed files are clean.

- [ ] **Step 5: Commit CI**

```bash
git add .github/workflows/ci.yml ops/lint-changed-frontend.sh ops/tests/workflow_contract_test.py
git commit -m "ci: add required validation gates"
```

### Task 5: Automatic test deployment

**Files:**
- Create: `.github/workflows/deploy-test.yml`
- Modify: `ops/tests/workflow_contract_test.py`

**Interfaces:**
- Consumes: successful `CI` `workflow_run` for a `main` push; GitHub Environment `test` variables/secrets.
- Produces: exact-SHA archive upload, remote invocation of `deploy-release.sh test`, and a GitHub job summary.

- [ ] **Step 1: Add failing test deployment workflow assertions**

Assert that the workflow:

- triggers only from completed `CI` runs;
- checks `conclusion == success`, `event == push`, and `head_branch == main`;
- checks out `github.event.workflow_run.head_sha` and archives that exact tree;
- uses environment `test` and concurrency `deploy-test` with `cancel-in-progress: false`;
- obtains host, port, user, release root, shared config path, and public URL from the environment, never literals;
- uploads the archive and repository release scripts;
- invokes `deploy-release.sh test` with the exact SHA;
- records SHA and public health URL in the job summary.

- [ ] **Step 2: Run the workflow contract and verify failure**

Run: `python3 ops/tests/workflow_contract_test.py`

Expected: FAIL because `.github/workflows/deploy-test.yml` is missing.

- [ ] **Step 3: Implement test deployment workflow**

Use `webfactory/ssh-agent` with `secrets.DEPLOY_SSH_PRIVATE_KEY`, `ssh-keyscan` for a per-run `known_hosts`, `scp` for the exact archive and scripts, and `ssh` for the deployment command. Quote all remote values, mask sensitive material, and pass server paths as GitHub Environment variables.

- [ ] **Step 4: Verify workflow contract**

Run: `python3 ops/tests/workflow_contract_test.py`

Expected: PASS for CI and test deployment contracts.

- [ ] **Step 5: Commit automatic test deployment**

```bash
git add .github/workflows/deploy-test.yml ops/tests/workflow_contract_test.py
git commit -m "ci: deploy successful main commits to test"
```

### Task 6: Approved production promotion

**Files:**
- Create: `.github/workflows/deploy-production.yml`
- Modify: `ops/tests/workflow_contract_test.py`

**Interfaces:**
- Consumes: `workflow_dispatch` input `sha`; protected GitHub Environment `production`.
- Produces: verified-main production release with `CREATE_DB_BACKUP=true`, exact health validation, rollback status, and job summary.

- [ ] **Step 1: Add failing production workflow assertions**

Assert that production workflow:

- accepts a required 40-character SHA input and rejects other values;
- fetches `origin/main` and requires `git merge-base --is-ancestor "$sha" origin/main`;
- uses environment `production` and concurrency `deploy-production`;
- packages the exact selected commit rather than the current workflow checkout;
- passes `CREATE_DB_BACKUP=true` and environment `production`;
- uses only production Environment variables and secrets;
- records SHA, health URL, backup outcome, and deployment outcome in the summary.

- [ ] **Step 2: Run the workflow contract and verify failure**

Run: `python3 ops/tests/workflow_contract_test.py`

Expected: FAIL because `.github/workflows/deploy-production.yml` is missing.

- [ ] **Step 3: Implement production workflow**

Create the manual workflow with read-only contents permissions. Validate and fetch the SHA before the Environment-gated deploy job packages it. Reuse the same SSH, upload, and server script path as test, changing only environment and backup requirement.

- [ ] **Step 4: Verify all workflow and release contracts**

Run:

```bash
python3 ops/tests/workflow_contract_test.py
bash ops/tests/release_helpers_test.sh
bash ops/tests/deploy_release_contract_test.sh
```

Expected: all PASS.

- [ ] **Step 5: Commit production promotion**

```bash
git add .github/workflows/deploy-production.yml ops/tests/workflow_contract_test.py
git commit -m "ci: add approved production promotion"
```

### Task 7: Operator setup and recovery documentation

**Files:**
- Create: `docs/operations/ci-cd-environments.md`
- Modify: `server/README.md`
- Test: `ops/tests/documentation_contract_test.sh`

**Interfaces:**
- Produces: exact one-time setup checklist, required GitHub Environment names, deploy-key permissions, shared server layout, promotion procedure, rollback procedure, and PostgreSQL restore commands.

- [ ] **Step 1: Write a failing documentation contract**

Assert that documentation names all required values without embedding their real secret contents:

```text
DEPLOY_SSH_PRIVATE_KEY
DEPLOY_HOST
DEPLOY_PORT
DEPLOY_USER
PUBLIC_HEALTH_URL
RELEASE_ROOT
SHARED_CONFIG_DIR
test
production
required reviewers
rollback
pg_restore or psql restore procedure
```

- [ ] **Step 2: Run it and verify the expected failure**

Run: `bash ops/tests/documentation_contract_test.sh`

Expected: FAIL because the operations guide is missing.

- [ ] **Step 3: Write operational documentation**

Document separate deploy keys for test and production, public-key installation, Docker permissions, GitHub Environment configuration, production reviewer protection, server directories, retention, manual promotion, health comparison, failure triage, application rollback, and database restore. Clearly mark database restore as manual and destructive.

- [ ] **Step 4: Verify documentation and secret hygiene**

Run:

```bash
bash ops/tests/documentation_contract_test.sh
git grep -nE '(BEGIN (OPENSSH|RSA) PRIVATE KEY|Kettle69|7!5:Q59)' -- . ':!docs/superpowers/plans/*'
```

Expected: documentation test PASS and secret scan produces no matches.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/operations/ci-cd-environments.md server/README.md ops/tests/documentation_contract_test.sh
git commit -m "docs: add environment deployment runbook"
```

### Task 8: End-to-end local verification and rollout readiness

**Files:**
- Modify only files required to correct failures found by the complete verification suite.

**Interfaces:**
- Produces: a clean feature branch ready for review, GitHub Environment setup, and test-first rollout.

- [ ] **Step 1: Run the complete verification suite from a clean state**

```bash
git diff --check
python3 ops/tests/workflow_contract_test.py
bash ops/tests/release_helpers_test.sh
bash ops/tests/deploy_release_contract_test.sh
bash ops/tests/documentation_contract_test.sh
cd frontend
npm ci
find src -name '*.test.js' -print0 | xargs -0 node --test
npm run build
cd ../server
node --test tests/*.test.js
docker compose run --rm dashboard-api pytest -q
docker compose build
docker compose up -d
curl -fsS http://localhost:8080/api/health
```

Expected: every automated check PASS and local health reports `status=ok`, `version=dev`, `environment=local`.

- [ ] **Step 2: Review security and failure paths**

Confirm from the final diff that workflows use pinned major action versions, no secrets appear in command output, production requires its Environment gate, test cannot deploy a failed CI SHA, backup precedes production restart, and rollback preserves diagnostic output.

- [ ] **Step 3: Commit verification corrections if any**

```bash
git add -u
git commit -m "fix: close deployment verification gaps"
```

Skip this commit when the tree is already clean.

- [ ] **Step 4: Push feature branch and open a pull request**

Push the branch and open a PR describing CI gates, health metadata, test automation, production approval, backup, rollback, required repository settings, and verification evidence.

- [ ] **Step 5: Configure GitHub Environments and server deploy keys**

Follow `docs/operations/ci-cd-environments.md`. Install separate public deploy keys, create `test` and `production` Environments, set their variables/secrets, and configure required reviewers for production. Do not proceed until a read-only SSH connectivity check and server path permission check succeed for each environment.

- [ ] **Step 6: Merge and verify automatic test deployment**

Merge only after CI succeeds. Confirm the automatic test job deploys the merge SHA and:

```bash
curl -fsS "$TEST_PUBLIC_HEALTH_URL/api/health"
```

returns exact `version=<merged SHA>` and `environment=test`.

- [ ] **Step 7: Manually approve and verify production promotion**

Start the production workflow with the same merged SHA, approve the protected Environment job, confirm a non-empty backup path is reported, and verify public health returns exact `version=<merged SHA>` and `environment=production`.

- [ ] **Step 8: Final environment alignment check**

Record local, test, and production health payloads, GitHub workflow URLs, release paths, and backup path. Confirm test and production use the same SHA and the working tree is clean.
