# Roadmap FS Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intra-roadmap FS task dependencies with automatic schedule cascading, modal editing, quick linking on timeline, and timeline dependency lines.

**Architecture:** Keep the current Roadmaps UI in `frontend/src/sections/RoadmapsSection.jsx`, but extract dependency graph normalization and scheduling logic into a focused utility module with dedicated tests. The roadmap section remains the integration layer for modal state, quick-link UX, and timeline rendering.

**Tech Stack:** React 19, Vite 8, plain JSX, Node built-in test runner, ESLint

## Global Constraints

- Support only `FS` dependencies in v1.
- Support links only between tasks inside one roadmap.
- Do not block task statuses because of dependencies.
- Automatically shift dependent task dates to the right when predecessors move right.
- Preserve task duration during dependency cascade.
- Prevent self-links, duplicates, and dependency cycles.
- Keep normal task drag, resize, milestone drag, and double-click edit behavior working.

---

## File Map

- Modify: `frontend/src/sections/RoadmapsSection.jsx`
  - integrate dependency ids, modal predecessor editing, quick link mode, dependency overlay, save handlers
- Create: `frontend/src/utils/roadmapDependencies.js`
  - task id normalization, dependency sanitization, graph building, cycle detection, successor lookup, date cascade
- Create: `frontend/src/utils/roadmapDependencies.test.js`
  - regression tests for graph validation and schedule cascade
- Modify: `docs/superpowers/specs/2026-07-07-roadmap-task-fs-dependencies-design.md` only if implementation reveals a spec mismatch

### Task 1: Add dependency utility module with test-first graph logic

**Files:**
- Create: `frontend/src/utils/roadmapDependencies.test.js`
- Create: `frontend/src/utils/roadmapDependencies.js`

**Interfaces:**
- Produces:
  - `ensureRoadmapTaskIds(roadmapId: string, bars: Array<object>): Array<object>`
  - `sanitizePredecessorIds(predecessors: Array<string>, selfId?: string): Array<string>`
  - `buildDependencyState(bars: Array<object>): { taskById: Map<string, object>, successorsById: Map<string, string[]>, predecessorsById: Map<string, string[]> }`
  - `wouldCreateDependencyCycle(bars: Array<object>, sourceId: string, targetId: string): boolean`
  - `applyDependencySchedule(bars: Array<object>): Array<object>`

- [ ] **Step 1: Write the failing test file**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureRoadmapTaskIds,
  sanitizePredecessorIds,
  wouldCreateDependencyCycle,
  applyDependencySchedule,
} from './roadmapDependencies.js';

test('ensureRoadmapTaskIds assigns stable ids to bars without ids', () => {
  const bars = ensureRoadmapTaskIds('rm-demo', [{ title: 'A' }, { title: 'B' }]);
  assert.equal(bars[0].id, 'rm-demo-bar-0');
  assert.equal(bars[1].id, 'rm-demo-bar-1');
});

test('sanitizePredecessorIds removes duplicates and self references', () => {
  assert.deepEqual(
    sanitizePredecessorIds(['a', 'b', 'a', 'self'], 'self'),
    ['a', 'b']
  );
});

test('wouldCreateDependencyCycle detects transitive cycles', () => {
  const bars = [
    { id: 'a', predecessors: [] },
    { id: 'b', predecessors: ['a'] },
    { id: 'c', predecessors: ['b'] },
  ];
  assert.equal(wouldCreateDependencyCycle(bars, 'c', 'a'), true);
  assert.equal(wouldCreateDependencyCycle(bars, 'a', 'c'), false);
});

test('applyDependencySchedule shifts dependent chain right and preserves duration', () => {
  const bars = applyDependencySchedule([
    { id: 'a', startDate: '2026-07-01', endDate: '2026-07-10', predecessors: [] },
    { id: 'b', startDate: '2026-07-05', endDate: '2026-07-08', predecessors: ['a'] },
    { id: 'c', startDate: '2026-07-06', endDate: '2026-07-09', predecessors: ['b'] },
  ]);
  assert.equal(bars[1].startDate, '2026-07-11');
  assert.equal(bars[1].endDate, '2026-07-14');
  assert.equal(bars[2].startDate, '2026-07-15');
  assert.equal(bars[2].endDate, '2026-07-18');
});

test('applyDependencySchedule respects the latest predecessor finish', () => {
  const bars = applyDependencySchedule([
    { id: 'a', startDate: '2026-07-01', endDate: '2026-07-08', predecessors: [] },
    { id: 'b', startDate: '2026-07-02', endDate: '2026-07-12', predecessors: [] },
    { id: 'c', startDate: '2026-07-03', endDate: '2026-07-05', predecessors: ['a', 'b'] },
  ]);
  assert.equal(bars[2].startDate, '2026-07-13');
  assert.equal(bars[2].endDate, '2026-07-15');
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: FAIL because `roadmapDependencies.js` does not exist yet.

- [ ] **Step 3: Implement the minimal utility module**

Implement the exported functions in `frontend/src/utils/roadmapDependencies.js` using the roadmap date helpers already present in `RoadmapsSection.jsx` as the reference behavior.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: PASS

### Task 2: Integrate task ids and dependency cascade into roadmap recalculation

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Consumes: `ensureRoadmapTaskIds`, `sanitizePredecessorIds`, `applyDependencySchedule`

**Interfaces:**
- Produces:
  - normalized bars with `id` and `predecessors`
  - recalculated roadmap dates that honor dependencies

- [ ] **Step 1: Write a failing dependency integration test**

Add one more test in `frontend/src/utils/roadmapDependencies.test.js` that simulates a moved predecessor and verifies the downstream task dates after a recalculation-style pass.

- [ ] **Step 2: Run the test to verify RED**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: FAIL with an assertion mismatch for the cascade behavior you are about to wire into the section.

- [ ] **Step 3: Update `RoadmapsSection.jsx`**

Change normalization and `recalc(rm)` so that:

- bars receive stable ids derived from roadmap id when missing;
- predecessor arrays are sanitized;
- dependency schedule cascade runs before timeline metadata and period labels are rebuilt;
- deleting a task also removes that task id from other tasks' predecessor lists.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: PASS

### Task 3: Extend task modal with predecessor editing and validation

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Consumes: `sanitizePredecessorIds`, `wouldCreateDependencyCycle`

**Interfaces:**
- Produces:
  - `BarFormModal` save payload including `id` and `predecessors`
  - inline validation feedback for invalid links

- [ ] **Step 1: Add a failing test for cycle detection on modal-style save data**

Extend `frontend/src/utils/roadmapDependencies.test.js` with a case that checks cycle rejection for a proposed new predecessor selection.

- [ ] **Step 2: Run the test to verify RED**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: FAIL because the proposed validation branch is not implemented yet.

- [ ] **Step 3: Implement modal predecessor editing**

Update `BarFormModal` so that:

- it receives the current roadmap bars as selection candidates;
- it shows current predecessors;
- it allows add/remove actions;
- it disables invalid targets;
- it saves `predecessors` alongside existing task fields.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: PASS

### Task 4: Add timeline quick-link mode and dependency lines

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Consumes: dependency graph helpers from `frontend/src/utils/roadmapDependencies.js`

**Interfaces:**
- Produces:
  - `Связать` toolbar button state
  - quick-link source/target workflow
  - dependency line overlay in `TimelineView`

- [ ] **Step 1: Implement quick-link toolbar state**

Add a `Связать` button and local state in `RoadmapDetail` / `TimelineView` to track:

- link mode on/off;
- selected source task id;
- hover-highlighted related tasks.

- [ ] **Step 2: Implement dependency line overlay**

Render SVG or absolutely positioned line segments over the timeline grid using current bar coordinates.

- [ ] **Step 3: Wire source -> target creation**

On click in link mode:

- first task click selects source;
- second task click attempts to create the dependency;
- invalid links are rejected inline;
- valid links save and trigger recalculation.

- [ ] **Step 4: Verify interactions manually**

Check in browser:

- `Связать` mode creates a link;
- normal task drag/resize still works outside link mode;
- double click still opens task edit modal.

### Task 5: Verify, lint, build, and prepare commit

**Files:**
- Test: `frontend/src/utils/roadmapDependencies.test.js`
- Verify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: all previous tasks
- Produces: verified feature branch state ready for review/commit

- [ ] **Step 1: Run unit-style dependency tests**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node --test src/utils/roadmapDependencies.test.js`
Expected: PASS

- [ ] **Step 2: Run eslint**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/sections/RoadmapsSection.jsx src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npm run build`
Expected: PASS

- [ ] **Step 4: Run manual browser verification**

Verify:

- create dependency from modal;
- create dependency from `Связать` mode;
- cascade shifts dependent tasks right;
- delete a task cleans predecessor references;
- timeline renders dependency lines after reload.

- [ ] **Step 5: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js docs/superpowers/plans/2026-07-07-roadmap-fs-dependencies.md
git commit -m "Roadmaps: add FS task dependencies"
```
