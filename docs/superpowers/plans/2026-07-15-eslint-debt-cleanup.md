# ESLint Debt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete frontend ESLint run pass with zero errors and zero warnings without changing user-visible behavior or API contracts.

**Architecture:** Remove mechanical dead code first, then replace prop-to-state synchronization effects with derived or remounted state, stabilize Hook dependencies, and finally move render-local modal components to module scope with explicit props. Enable the full lint command in CI only after the baseline is clean.

**Tech Stack:** React 19, Vite, ESLint 9, eslint-plugin-react-hooks, Node test runner, GitHub Actions.

## Global Constraints

- Preserve rendering, interaction, API requests, persisted payload shapes, and business rules.
- Do not add global rule suppressions or blanket `eslint-disable` comments.
- Every task must keep `npm test` and `npm run build` green.
- Final `npm run lint` must report zero errors and zero warnings.
- Keep mechanical cleanup separate from Hook and component-boundary changes.

---

### Task 1: Mechanical Dead-Code and Export Cleanup

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/common/Avatar.jsx`
- Modify: `frontend/src/components/common/Charts.jsx`
- Modify: `frontend/src/components/common/ConfirmDialog.jsx`
- Modify: `frontend/src/sections/AmbpSection.jsx`
- Modify: `frontend/src/sections/PlanSection.jsx`
- Modify: `frontend/src/sections/UcpSection.jsx`
- Modify: `frontend/src/sections/TaskArchiveSection.jsx`
- Create: `frontend/src/components/common/confirmDialogStyles.js`

**Interfaces:**
- Consumes: current component exports and `ConfirmDialog` style helpers.
- Produces: the same component APIs with unused symbols removed and non-component exports moved out of the Fast Refresh component module.

- [ ] **Step 1: Capture the rule-specific failing baseline**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-before.json || true
node -e 'const r=require("/tmp/eslint-before.json"); console.log(r.reduce((n,f)=>n+f.messages.filter(m=>["no-unused-vars","no-empty","no-undef","react-refresh/only-export-components"].includes(m.ruleId)).length,0))'
```

Expected: `26` mechanical findings.

- [ ] **Step 2: Remove unused symbols and fix the empty catch**

Apply only these transformations:

```text
api.js: replace `catch (_) {}` with `catch { return null; }` while preserving the caller's existing fallback behavior.
Avatar.jsx: remove unused `userColor` import.
Charts.jsx: remove unused `useRef` and `useEffect` imports.
AmbpSection.jsx: remove unused `ConfirmDialog` import.
PlanSection.jsx: remove unused `Avatar`, `ConfirmDialog`, `KpiRadarChart`, `formatDashboardDate`, and `overdue`.
UcpSection.jsx: remove unused `Avatar`, `ConfirmDialog`, `KpiRadarChart`, `BurndownChart`, and `formatDashboardDate`.
TaskArchiveSection.jsx: remove unused imports, callbacks and styles; replace the undefined `TaskDetailModal` branch with the already-used task edit/detail component from `TasksSection.jsx`, preserving archive restore/delete actions.
ConfirmDialog.jsx: move shared non-component exports into `confirmDialogStyles.js` and import them back.
```

- [ ] **Step 3: Verify mechanical rules are clean**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-mechanical.json || true
node -e 'const r=require("/tmp/eslint-mechanical.json"); const x=r.flatMap(f=>f.messages).filter(m=>["no-unused-vars","no-empty","no-undef","react-refresh/only-export-components"].includes(m.ruleId)); console.log(x.length); process.exit(x.length?1:0)'
npm test
npm run build
```

Expected: `0`, tests pass, build exits 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "refactor: remove frontend lint dead code"
```

### Task 2: Prop-Derived State and Selection

**Files:**
- Modify: `frontend/src/sections/AmbpSection.jsx`
- Modify: `frontend/src/sections/EventsSection.jsx`
- Modify: `frontend/src/sections/PlanSection.jsx`
- Modify: `frontend/src/sections/SyncsSection.jsx`
- Modify: `frontend/src/sections/TaskArchiveSection.jsx`
- Modify: `frontend/src/sections/TasksSection.jsx`
- Modify: `frontend/src/sections/UcpSection.jsx`

**Interfaces:**
- Consumes: `initialTopics`, `initialEvents`, `initialEventTasks`, `initialTasks`, and `initialStickers` props.
- Produces: identical section behavior without synchronous prop-to-state effects.

- [ ] **Step 1: Record current state-effect findings**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-state-before.json || true
node -e 'const r=require("/tmp/eslint-state-before.json"); console.log(r.flatMap(f=>f.messages).filter(m=>m.ruleId==="react-hooks/set-state-in-effect").length)'
```

Expected: findings remain in the targeted sections.

- [ ] **Step 2: Replace prop synchronization with controlled derivation**

For each section, keep local optimistic mutations in a separate overlay and derive the visible collection from the latest prop plus the overlay. For selection, derive a valid selected id during render:

```js
const visibleSelectedId = items.some(item => item.id === selectedId)
  ? selectedId
  : (items[0]?.id ?? null);
```

Use `visibleSelectedId` for rendering and mutations instead of setting a corrected id in an effect. Where a modal form must reset for a different entity, give the modal a stable entity key rather than copying props in an effect:

```jsx
<EditModal key={entity?.id || "new"} entity={entity} />
```

- [ ] **Step 3: Verify targeted state effects are removed**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-state-after.json || true
node -e 'const r=require("/tmp/eslint-state-after.json"); const x=r.flatMap(f=>f.messages).filter(m=>m.ruleId==="react-hooks/set-state-in-effect"); console.log(x.length); process.exit(x.length?1:0)'
npm test
npm run build
```

Expected: no targeted state-effect findings; tests and build pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/sections
git commit -m "refactor: derive section state without sync effects"
```

### Task 3: Stable Hook Dependencies

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/sections/AmbpSection.jsx`
- Modify: `frontend/src/sections/EventsSection.jsx`
- Modify: `frontend/src/sections/PlanSection.jsx`
- Modify: `frontend/src/sections/SyncsSection.jsx`
- Modify: `frontend/src/sections/TasksSection.jsx`
- Modify: `frontend/src/sections/UcpSection.jsx`
- Modify: `frontend/src/sections/UsersSection.jsx`

**Interfaces:**
- Consumes: existing effects, memoized calculations, close callbacks, API client, notification state.
- Produces: the same effects and calculations with complete dependency ownership.

- [ ] **Step 1: Capture exhaustive-deps count**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-deps-before.json || true
node -e 'const r=require("/tmp/eslint-deps-before.json"); console.log(r.flatMap(f=>f.messages).filter(m=>m.ruleId==="react-hooks/exhaustive-deps").length)'
```

Expected: `17` before this task when executed from the original baseline.

- [ ] **Step 2: Stabilize dependencies at their source**

Apply these patterns as appropriate:

```js
const close = useCallback(() => onClose(), [onClose]);
const derived = useMemo(() => calculate(input), [input]);
```

Move pure helpers such as roadmap status predicates and level assignment to module scope. Wrap effect-owned asynchronous functions in `useCallback` and include every captured value. Do not remove a dependency or suppress the rule to obtain a clean result.

- [ ] **Step 3: Verify dependency findings are zero**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-deps-after.json || true
node -e 'const r=require("/tmp/eslint-deps-after.json"); const x=r.flatMap(f=>f.messages).filter(m=>m.ruleId==="react-hooks/exhaustive-deps"); console.log(x.length); process.exit(x.length?1:0)'
npm test
npm run build
```

Expected: `0`, tests and build pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "refactor: stabilize frontend hook dependencies"
```

### Task 4: Module-Level Modal Components

**Files:**
- Modify: `frontend/src/sections/AmbpSection.jsx`
- Modify: `frontend/src/sections/EventsSection.jsx`
- Modify: `frontend/src/sections/PlanSection.jsx`
- Modify: `frontend/src/sections/SyncsSection.jsx`
- Modify: `frontend/src/sections/UcpSection.jsx`
- Modify: `frontend/src/sections/UsersSection.jsx`

**Interfaces:**
- Consumes: render-local modal components and the parent values they capture.
- Produces: module-level modal components receiving all captured values through explicit props.

- [ ] **Step 1: Capture static-components count**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-static-before.json || true
node -e 'const r=require("/tmp/eslint-static-before.json"); console.log(r.flatMap(f=>f.messages).filter(m=>m.ruleId==="react-hooks/static-components").length)'
```

Expected: `13` before extraction from the original baseline.

- [ ] **Step 2: Move each modal to module scope**

Extract `AmbpTopicModal`, `EventModal`, `AddTaskModal`, `EventTaskModal`, `PlanTaskModal`, `CreateStickerModal`, `CreateUcpTaskModal`, and `UserEditModal`. Every previously captured value becomes an explicit prop:

```jsx
function EntityModal({ entity, members, isMobile, onClose, onSubmit }) {
  // Existing modal body, unchanged.
}
```

Pass stable keys for create/edit identity and retain the same submit and close handlers.

- [ ] **Step 3: Verify static component findings are zero**

Run:

```bash
cd frontend
npx eslint src --format json > /tmp/eslint-static-after.json || true
node -e 'const r=require("/tmp/eslint-static-after.json"); const x=r.flatMap(f=>f.messages).filter(m=>m.ruleId==="react-hooks/static-components"); console.log(x.length); process.exit(x.length?1:0)'
npm test
npm run build
```

Expected: `0`, tests and build pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/sections
git commit -m "refactor: extract stable frontend modal components"
```

### Task 5: Application Effects and Full CI Lint Gate

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/sections/UsersSection.jsx`
- Modify: `.github/workflows/ci.yml`
- Modify: `ops/tests/workflow_contract_test.py`

**Interfaces:**
- Consumes: route section state, push initialization, initial users load, existing CI frontend job.
- Produces: effect-safe application initialization and a full `npm run lint` required check.

- [ ] **Step 1: Strengthen the workflow contract first**

Add this assertion to `test_frontend_security_and_workbook_gates`:

```python
require(content, "npm run lint")
assert "Lint changed frontend files" not in content
```

Run:

```bash
python3 ops/tests/workflow_contract_test.py
```

Expected: FAIL because CI still lints only changed files.

- [ ] **Step 2: Remove remaining effect violations and enable full lint**

Derive the active section from the route instead of synchronously mirroring it in an effect. Initialize denied notification status from the browser permission when state is created, and invoke push initialization from an effect-safe callback. Keep the users request asynchronous and cancellation-safe. Replace the changed-file lint step in `.github/workflows/ci.yml` with:

```yaml
- name: Lint frontend
  run: npm run lint
```

- [ ] **Step 3: Run the complete acceptance gate**

Run:

```bash
cd frontend
npm run lint
npm test
npm run build
cd ..
python3 ops/tests/workflow_contract_test.py
git diff --check
```

Expected: ESLint reports zero problems; tests, build, workflow contract, and diff check pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src .github/workflows/ci.yml ops/tests/workflow_contract_test.py
git commit -m "ci: require complete frontend lint"
```

### Task 6: Final Regression and Pull Request

**Files:**
- Verify only; no planned production file changes.

**Interfaces:**
- Consumes: all preceding commits.
- Produces: a reviewable branch with a zero-warning lint baseline.

- [ ] **Step 1: Re-run all relevant local gates**

```bash
cd frontend
npm ci
npm run lint
npm test
npm run verify:xlsx
npm run build
cd ..
python3 ops/tests/workflow_contract_test.py
node --test tests/caddy_contract.test.js
git diff --check origin/main...HEAD
```

Expected: every command exits 0.

- [ ] **Step 2: Confirm scope**

```bash
git status --short
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: only the design, plan, frontend lint fixes, workflow, and workflow contract are present.

- [ ] **Step 3: Push and open a draft pull request**

```bash
git push -u origin codex/eslint-cleanup
gh pr create --draft --base main --head codex/eslint-cleanup --title "refactor: eliminate frontend ESLint debt" --body-file /tmp/eslint-pr-body.md
```

Expected: GitHub returns the pull request URL.
