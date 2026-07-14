# Actions and Frontend Dependency Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GitHub Actions to Node.js 24 runtimes and resolve the frontend `exceljs -> uuid` audit chain without breaking XLSX export or deployment.

**Architecture:** Workflow contract tests pin approved action versions before workflow YAML changes. npm's root `overrides` mechanism resolves the vulnerable transitive dependency while the existing workbook verifier proves runtime compatibility.

**Tech Stack:** GitHub Actions, Node.js 22 application runtime, npm lockfile v3, ExcelJS, Node test runner, actionlint.

## Global Constraints

- Keep `exceljs` at `4.4.0` unless compatibility testing proves the override impossible.
- Resolve `uuid` to exactly `11.1.1`.
- Use `actions/checkout@v6`, `actions/setup-node@v6`, and `webfactory/ssh-agent@v0.10.0`.
- Preserve all existing workflow triggers, permissions, environment gates, secrets, variables, and deployment commands.
- Test and production must finish on the same merged full SHA.

---

### Task 1: Pin Node.js 24 GitHub Actions

**Files:**
- Modify: `ops/tests/workflow_contract_test.py`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-test.yml`
- Modify: `.github/workflows/deploy-production.yml`

**Interfaces:**
- Produces: workflow contracts requiring checkout/setup-node v6 and ssh-agent v0.10.0.

- [ ] **Step 1: Add failing workflow assertions**

Require all checkout references to equal `actions/checkout@v6`, all setup-node references to equal `actions/setup-node@v6`, and both deployment workflows to contain `webfactory/ssh-agent@v0.10.0`. Explicitly reject `checkout@v4`, `setup-node@v4`, and `ssh-agent@v0.9.0`.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `python3 ops/tests/workflow_contract_test.py`

Expected: FAIL on the first old action reference.

- [ ] **Step 3: Update workflow action references only**

Replace the three action versions without changing workflow behavior or inputs.

- [ ] **Step 4: Verify GREEN and syntax**

Run:

```bash
python3 ops/tests/workflow_contract_test.py
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

Expected: workflow contracts and actionlint PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy-test.yml .github/workflows/deploy-production.yml ops/tests/workflow_contract_test.py
git commit -m "ci: move actions to node 24 runtimes"
```

### Task 2: Resolve the frontend audit chain

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Produces: npm resolution `uuid@11.1.1` under `exceljs@4.4.0`.

- [ ] **Step 1: Record the failing security gate**

Run: `cd frontend && npm audit --audit-level=moderate`

Expected: FAIL with two moderate findings in the `exceljs -> uuid` chain.

- [ ] **Step 2: Add the exact npm override and regenerate the lockfile**

Add to the root package object:

```json
"overrides": {
  "uuid": "11.1.1"
}
```

Run: `cd frontend && npm install --package-lock-only`

- [ ] **Step 3: Verify dependency resolution and security GREEN**

Run:

```bash
cd frontend
npm ci
npm ls uuid
npm audit --audit-level=moderate
```

Expected: `uuid@11.1.1`, no invalid dependency tree, and zero vulnerabilities.

- [ ] **Step 4: Verify XLSX compatibility and frontend behavior**

Run:

```bash
cd frontend
find src -name '*.test.js' -print0 | xargs -0 node --test
npm run build
npm run verify:xlsx
```

If `verify:xlsx` is not yet a package script, run `node scripts/verify-roadmap-xlsx.mjs` and add a named `verify:xlsx` script so CI can use the same command.

Expected: 19 tests PASS, build succeeds, and the workbook verifier reports all required sheets.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "fix: override vulnerable uuid dependency"
```

### Task 3: Make audit and XLSX compatibility required CI gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `ops/tests/workflow_contract_test.py`

**Interfaces:**
- Produces: frontend CI that runs `npm audit --audit-level=moderate` and workbook verification before build completion.

- [ ] **Step 1: Add failing workflow assertions**

Require frontend CI to contain both `npm audit --audit-level=moderate` and `npm run verify:xlsx`.

- [ ] **Step 2: Verify RED**

Run: `python3 ops/tests/workflow_contract_test.py`

Expected: FAIL because the two commands are absent.

- [ ] **Step 3: Add the security and workbook gates**

Place both commands after `npm ci` in the frontend job, preserving existing tests, build, and changed-file lint.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
python3 ops/tests/workflow_contract_test.py
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml ops/tests/workflow_contract_test.py frontend/package.json
git commit -m "ci: require frontend audit and workbook verification"
```

### Task 4: Full verification and rollout

**Files:**
- Modify only files required to correct verification failures.

**Interfaces:**
- Produces: merged SHA deployed through existing test and production promotion workflows.

- [ ] **Step 1: Run the complete local verification suite**

```bash
git diff --check
python3 ops/tests/workflow_contract_test.py
bash ops/tests/release_helpers_test.sh
bash ops/tests/deploy_release_contract_test.sh
bash ops/tests/documentation_contract_test.sh
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
cd frontend
npm ci
npm ls uuid
npm audit --audit-level=moderate
find src -name '*.test.js' -print0 | xargs -0 node --test
npm run verify:xlsx
npm run build
```

Expected: zero audit findings, all tests PASS, workbook valid, build successful, and clean workflow validation.

- [ ] **Step 2: Push and create a pull request**

Push `codex/maintenance-actions-deps`, open a ready PR to `main`, and wait for all five required CI checks.

- [ ] **Step 3: Merge and verify test**

Merge after green CI. Wait for main CI and automatic test deployment. Verify public health identifies the merged SHA and `environment=test`, with no Node.js 20 action annotations.

- [ ] **Step 4: Promote and verify production**

Start `Deploy production` with the same SHA, approve the protected Environment, confirm backup creation, and verify production health identifies that SHA and `environment=production`.

- [ ] **Step 5: Final evidence**

Confirm remote `main`, test health, production health, workflow results, npm audit result, and production backup all agree before reporting completion.
