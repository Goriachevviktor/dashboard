# Roadmap Task Creation Date Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default a newly created standalone roadmap task's start and end dates to the user's local creation date while preserving all existing edit, link, and legacy behavior.

**Architecture:** A small pure utility owns local `YYYY-MM-DD` formatting and resolves initial form dates from either a new-object timestamp or existing/legacy values. `BarFormModal` computes that result once per modal mount and uses it for both controlled date inputs; the backend contract remains unchanged.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, ESLint, Vite.

## Global Constraints

- Apply only to a new standalone roadmap bar created through `BarFormModal`.
- `startDate` and `endDate` both default to the user's local browser calendar date when the creation modal opens.
- Format the date from local `getFullYear()`, `getMonth()`, and `getDate()`; do not use UTC conversion.
- Keep both date fields editable and preserve the existing `endDate >= startDate` validation.
- Existing bars retain their saved dates; legacy fallback behavior remains unchanged.
- Do not change ordinary tasks, linked roadmap tasks, events, milestones, UCP, development plans, backend APIs, or stored records.
- Implement and validate in dev only; do not deploy to test or production.

---

### Task 1: Initialize new roadmap bars from the local creation date

**Files:**
- Create: `frontend/src/utils/roadmapDateDefaults.js`
- Create: `frontend/src/utils/roadmapDateDefaults.test.js`
- Modify: `frontend/src/sections/RoadmapsSection.jsx:1-25,1119-1140`
- Modify: `frontend/src/roadmapDependencyVisuals.test.js`

**Interfaces:**
- Produces: `formatLocalDateInputValue(dateLike = new Date()): string`.
- Produces: `resolveRoadmapBarInitialDates({ bar, legacyStartDate, legacyEndDate, now }): { startDate: string, endDate: string }`.
- Consumes in `BarFormModal`: current `initBar`, current legacy values from `monthValueToDate`, and the browser clock.

- [ ] **Step 1: Write failing pure-function tests**

Create `frontend/src/utils/roadmapDateDefaults.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLocalDateInputValue,
  resolveRoadmapBarInitialDates,
} from './roadmapDateDefaults.js';

test('formats local calendar components with zero padding instead of UTC date', () => {
  const dateLike = {
    getFullYear: () => 2026,
    getMonth: () => 0,
    getDate: () => 2,
    toISOString: () => '2026-01-01T21:00:00.000Z',
  };

  assert.equal(formatLocalDateInputValue(dateLike), '2026-01-02');
});

test('new roadmap bar starts and ends on its local creation date', () => {
  const now = new Date(2026, 6, 20, 23, 55);
  assert.deepEqual(resolveRoadmapBarInitialDates({
    bar: null,
    legacyStartDate: '2026-01-01',
    legacyEndDate: '2026-03-31',
    now,
  }), {
    startDate: '2026-07-20',
    endDate: '2026-07-20',
  });
});

test('existing roadmap bar keeps saved dates', () => {
  assert.deepEqual(resolveRoadmapBarInitialDates({
    bar: { startDate: '2025-11-03', endDate: '2026-02-14' },
    legacyStartDate: '2026-01-01',
    legacyEndDate: '2026-03-31',
    now: new Date(2026, 6, 20),
  }), {
    startDate: '2025-11-03',
    endDate: '2026-02-14',
  });
});

test('existing legacy bar still uses supplied legacy fallbacks', () => {
  assert.deepEqual(resolveRoadmapBarInitialDates({
    bar: {},
    legacyStartDate: '2024-01-01',
    legacyEndDate: '2024-03-31',
    now: new Date(2026, 6, 20),
  }), {
    startDate: '2024-01-01',
    endDate: '2024-03-31',
  });
});
```

- [ ] **Step 2: Add a failing integration-contract test**

Extend `frontend/src/roadmapDependencyVisuals.test.js` with a narrow source contract:

```js
test('new roadmap bar form resolves one shared local creation date', () => {
  assert.match(timelineSource, /resolveRoadmapBarInitialDates/);
  assert.match(timelineSource, /legacyStartDate:\s*monthValueToDate\(initBar\?\.start \?\? 0, 0\)/);
  assert.match(timelineSource, /legacyEndDate:\s*monthValueToDate\(initBar\?\.end \?\? 3, 2, true\)/);
  assert.match(timelineSource, /useState\(initialDates\.startDate\)/);
  assert.match(timelineSource, /useState\(initialDates\.endDate\)/);
});
```

The final implementation may use equivalent whitespace, but the test must prove that both state fields consume one shared resolved object rather than invoking the clock independently.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd frontend
node --test src/utils/roadmapDateDefaults.test.js src/roadmapDependencyVisuals.test.js
```

Expected: FAIL because `roadmapDateDefaults.js` and its exports do not exist, and `BarFormModal` still uses the January/March legacy defaults for new bars.

- [ ] **Step 4: Implement the pure date resolver**

Create `frontend/src/utils/roadmapDateDefaults.js`:

```js
export function formatLocalDateInputValue(dateLike = new Date()) {
  return `${dateLike.getFullYear()}-${String(dateLike.getMonth() + 1).padStart(2, '0')}-${String(dateLike.getDate()).padStart(2, '0')}`;
}

export function resolveRoadmapBarInitialDates({
  bar,
  legacyStartDate,
  legacyEndDate,
  now = new Date(),
}) {
  if (bar) {
    return {
      startDate: bar.startDate || legacyStartDate,
      endDate: bar.endDate || legacyEndDate,
    };
  }

  const creationDate = formatLocalDateInputValue(now);
  return { startDate: creationDate, endDate: creationDate };
}
```

- [ ] **Step 5: Integrate once-per-mount initialization into `BarFormModal`**

Import `resolveRoadmapBarInitialDates` into `RoadmapsSection.jsx`. Replace the two direct date initializers with one lazy state initializer and two controlled field states:

```js
const [initialDates] = useState(() => resolveRoadmapBarInitialDates({
  bar: initBar,
  legacyStartDate: monthValueToDate(initBar?.start ?? 0, 0),
  legacyEndDate: monthValueToDate(initBar?.end ?? 3, 2, true),
}));
const [startDate, setStartDate] = useState(initialDates.startDate);
const [endDate, setEndDate] = useState(initialDates.endDate);
```

Do not modify the date inputs, submit payload, validation, linked-task creation, or legacy normalization.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
cd frontend
node --test src/utils/roadmapDateDefaults.test.js src/roadmapDependencyVisuals.test.js
```

Expected: all focused tests PASS.

- [ ] **Step 7: Run the complete frontend verification**

Run:

```bash
cd frontend
node --test $(find src -name '*.test.js' -print | sort)
npm run lint
npm run verify:xlsx
npm run build
cd ..
git diff --check
```

Expected: zero failed tests, ESLint clean, workbook validation passed, Vite build exit 0, and no whitespace errors.

- [ ] **Step 8: Verify behavior in the dev browser**

Use an existing dev roadmap and perform these checks without saving unintended data:

```text
1. Open “Добавить задачу”.
2. Confirm startDate == today's local YYYY-MM-DD.
3. Confirm endDate == the same value.
4. Change both values and confirm the controls accept the changes.
5. Cancel and confirm no bar was created.
6. Open an existing bar and confirm its saved dates are preserved.
7. Confirm browser console has no errors.
```

- [ ] **Step 9: Commit and request review**

```bash
git add frontend/src/utils/roadmapDateDefaults.js \
  frontend/src/utils/roadmapDateDefaults.test.js \
  frontend/src/sections/RoadmapsSection.jsx \
  frontend/src/roadmapDependencyVisuals.test.js
git commit -m "fix: default new roadmap tasks to today"
```

Request a task review and a final review against `docs/superpowers/specs/2026-07-20-roadmap-task-creation-date-default-design.md`. Resolve all Critical and Important findings and rerun Step 7. Keep the branch local to dev; do not push, create a PR, or deploy.
