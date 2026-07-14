# Development Environment Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one verified Git commit containing the currently deployed personal Mind Map, personal Roadmaps, and production-only runtime improvements, then deploy that exact commit to test and production while preserving environment-specific secrets and data.

**Architecture:** GitHub `main` is the only source of application code. Local, test, and production use the same source commit; only `.env`, database contents, host routing, and runtime versions differ. The integration branch starts from `9022db5` plus the already reviewed personal-data commits through `79a0023`; production-only tracked and required untracked files are imported as a separate auditable change.

**Tech Stack:** React/Vite, Node test runner, ESLint, FastAPI, pytest, PostgreSQL 16, Docker Compose, Caddy, GitHub.

## Global Constraints

- Preserve all existing local, test, and production data; create an application archive and PostgreSQL dump before each deployment.
- Never copy `.env`, private keys, database volumes, `backups/`, `.bak` files, `__pycache__`, or build caches between environments.
- All three environments must finish on the same published Git commit.
- Keep `app_schema_migrations` separate from SQL migration-history tables.
- Mind Maps and Roadmaps remain private to their owning user.
- Test is deployed and accepted before production is changed.
- Do not discard dirty server worktrees until their contents are represented by reviewed commits and rollback snapshots.

---

### Task 1: Establish and verify the committed personal-data baseline

**Files:**
- Verify: `server/api/tests/test_mindmaps.py`
- Verify: `server/api/tests/test_roadmaps.py`
- Verify: `frontend/src/sections/mindMapState.test.js`
- Verify: `frontend/src/sections/roadmapState.test.js`
- Verify: `frontend/src/utils/roadmapDependencies.test.js`

**Interfaces:**
- Consumes: Git base `9022db5` and personal-data commits through `79a0023`.
- Produces: a clean integration worktree whose behavior is protected by frontend and backend tests.

- [ ] **Step 1: Confirm isolation and ancestry**

Run: `git status --short && git merge-base --is-ancestor 9022db5 HEAD && git rev-list --left-right --count 9022db5...HEAD`

Expected: clean status, successful ancestry check, and `0 13`.

- [ ] **Step 2: Install locked frontend dependencies**

Run: `cd frontend && npm ci`

Expected: exit code `0` without modifying `package-lock.json`.

- [ ] **Step 3: Run personal-data frontend tests**

Run: `cd frontend && node --test src/sections/mindMapState.test.js src/sections/roadmapState.test.js src/utils/roadmapDependencies.test.js`

Expected: all tests pass.

- [ ] **Step 4: Run targeted lint and production build**

Run: `cd frontend && npx eslint src/sections/MindMapSection.jsx src/sections/mindMapState.js src/sections/mindMapState.test.js src/sections/RoadmapsSection.jsx src/sections/roadmapState.js src/sections/roadmapState.test.js src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js && npm run build`

Expected: lint and build exit `0`.

- [ ] **Step 5: Run backend tests in PostgreSQL-backed Compose**

Run: `cd server && docker compose up -d dashboard-db && docker compose run --rm dashboard-api pytest -q tests/test_mindmaps.py tests/test_roadmaps.py tests/test_migration_registry_compat.py`

Expected: all selected tests pass.

### Task 2: Import production-only application changes without runtime artifacts

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/vite.config.js`
- Create: `frontend/public/manifest.webmanifest`
- Create: `frontend/public/pwa-icon-192.png`
- Create: `frontend/public/pwa-icon-512.png`
- Create: `frontend/public/pwa-icon.svg`
- Create: `frontend/public/pwa-maskable-icon-192.png`
- Create: `frontend/public/pwa-maskable-icon-512.png`
- Create: `frontend/public/pwa-maskable-icon.svg`
- Create: `frontend/public/service-worker.js`
- Create: `frontend/src/hooks/*`
- Modify: `server/Caddyfile`
- Modify: `server/api/app/config.py`
- Modify: `server/api/app/main.py`
- Modify: `server/api/app/rate_limiter.py`
- Modify: `server/docker-compose.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: production tracked diff and required production untracked PWA/hook files.
- Produces: reviewable source changes with no secrets, backups, caches, or generated build output.

- [ ] **Step 1: Export a production rollback snapshot and source patch**

Run remotely: create a timestamped application archive, PostgreSQL dump, `git diff --binary`, and `git diff --cached --binary` under `/root/backups/dashboard-environment-alignment-<timestamp>/`.

Expected: four non-empty rollback artifacts owned by root.

- [ ] **Step 2: Add a failing PWA contract test before importing implementation**

Create `frontend/src/pwaAssets.test.js` which asserts that the manifest, service worker, declared icons, and registration hook referenced by `main.jsx` exist and use same-origin URLs.

Run: `cd frontend && node --test src/pwaAssets.test.js`

Expected: FAIL because the production-only PWA assets are not present in the integration worktree.

- [ ] **Step 3: Import only the listed production source files**

Copy the exact production versions of the files listed in this task. Do not copy `.env`, `frontend-dist`, `node_modules`, `backups`, `.bak`, `__pycache__`, database files, or private keys.

- [ ] **Step 4: Extend `.gitignore` for runtime artifacts**

Add patterns for `backups/`, `*.bak-*`, `*.bak`, and `__pycache__/` without weakening existing rules.

- [ ] **Step 5: Run the PWA contract test and relevant server tests**

Run: `cd frontend && node --test src/pwaAssets.test.js && npm run build`

Run: `cd server && docker compose run --rm dashboard-api pytest -q tests/test_mindmaps.py tests/test_roadmaps.py tests/test_migration_registry_compat.py`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit the production-only layer**

Run: `git add <listed source files> .gitignore frontend/src/pwaAssets.test.js && git commit -m "feat: align production runtime source"`

Expected: commit contains only reviewed source, tests, and public assets.

### Task 3: Complete branch verification and publish the integration branch

**Files:**
- Verify: all tracked files on the integration branch.

**Interfaces:**
- Consumes: completed Tasks 1-2.
- Produces: published branch `codex/environment-alignment` and an immutable commit SHA for deployment.

- [ ] **Step 1: Run the complete available frontend test suite**

Run: `cd frontend && node --test $(find src -name '*.test.js' -print)`

Expected: zero failed tests.

- [ ] **Step 2: Run frontend lint and production build**

Run: `cd frontend && npm run lint && npm run build`

Expected: build passes; pre-existing lint debt, if any, is recorded separately and all changed files are lint-clean.

- [ ] **Step 3: Run the complete backend suite in Compose**

Run: `cd server && docker compose run --rm dashboard-api pytest -q`

Expected: zero failures, or an explicitly isolated pre-existing incompatible test with targeted suites all green.

- [ ] **Step 4: Review the full branch diff**

Run: `git diff --check 9022db5...HEAD && git status --short && git log --oneline 9022db5..HEAD`

Expected: no whitespace errors, no unintended files, and a clean worktree.

- [ ] **Step 5: Push the integration branch to GitHub**

Run: `git push -u origin codex/environment-alignment`

Expected: remote branch points to the verified local SHA.

### Task 4: Deploy and accept the exact integration commit on test

**Files:**
- Deploy target: `/home/viktor/projects/dashboard`

**Interfaces:**
- Consumes: published immutable integration SHA from Task 3.
- Produces: test running that exact SHA with preserved database and environment secrets.

- [ ] **Step 1: Create test rollback artifacts**

Create a timestamped application archive, PostgreSQL dump, and patch of all dirty tracked/untracked source files under `/home/viktor/backups/`.

- [ ] **Step 2: Preserve environment-specific files and update source**

Preserve `server/.env` and private keys, archive existing dirty changes, fetch GitHub, and check out the exact integration SHA without copying local secrets.

- [ ] **Step 3: Rebuild test services**

Run remotely: `cd frontend && npm ci && npm run build`, then `cd ../server && docker compose up -d --build`.

- [ ] **Step 4: Run automated acceptance checks**

Run backend targeted tests, inspect container state and logs, verify `mind_maps` and `roadmaps` tables, public `/api/health`, and the served asset fingerprint.

- [ ] **Step 5: Record test acceptance SHA**

Expected: Git `HEAD`, running source, and published integration SHA are identical.

### Task 5: Deploy and verify the accepted commit on production

**Files:**
- Deploy target: `/root/Project/dashboad/dashboard`

**Interfaces:**
- Consumes: test-accepted immutable SHA from Task 4.
- Produces: production running the same SHA with preserved data and a clean source checkout.

- [ ] **Step 1: Confirm test acceptance and create fresh production rollback artifacts**

Create a new timestamped application archive, PostgreSQL dump, and dirty-worktree patch before changing production.

- [ ] **Step 2: Preserve secrets and replace server-only source drift with the accepted commit**

Preserve `server/.env` and private keys, fetch GitHub, and check out the exact accepted SHA. Keep rollback artifacts outside the repository.

- [ ] **Step 3: Rebuild production services**

Run remotely: `cd frontend && npm ci && npm run build`, then `cd ../server && docker compose up -d --build`.

- [ ] **Step 4: Run final production verification**

Verify container state and logs, database tables and record counts, local and public health, served asset fingerprint, Git SHA, and clean tracked worktree.

- [ ] **Step 5: Produce the final environment matrix**

Record the common Git SHA and environment-specific Node, Docker, Compose, URLs, database counts, and rollback paths for local, test, and production.
