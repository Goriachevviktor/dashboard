# Roadmap Vertical Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pointer-driven lane and task reordering to Timeline, Swimlanes, and Now · Next · Later without breaking horizontal date dragging, dependencies, linked tasks, print, or export.

**Architecture:** Keep ordering and gesture decisions in pure utility modules, then let each roadmap view own only its geometry-specific pointer preview. Persist one optimistic full-roadmap PATCH per completed drop through a dedicated helper that rolls back on failure. Timeline/Swimlanes share canonical `lanes` and `bars` order; NNL uses independent `planningBucket` and `planningRank` fields with legacy automatic fallback.

**Tech Stack:** React 19, Pointer Events, Vite 8, Node test runner, ESLint, existing roadmap JSON API, existing XLSX workbook utilities.

## Global Constraints

- Work only in the isolated dev branch `codex/roadmap-vertical-reordering` until the user explicitly approves promotion.
- Do not add a drag-and-drop dependency or a database/backend migration.
- Use stable lane and bar IDs; never persist array indexes as identity.
- A vertical reorder must preserve dates, status, progress, dependencies, owners, linked-task fields, and all unrelated roadmap data.
- NNL manual movement changes only `planningBucket` and `planningRank`.
- Existing bars without planning fields must retain automatic NNL grouping.
- Completed tasks remain excluded from NNL.
- Link mode disables drag; resize handles remain date-only controls.
- One completed drop emits one roadmap PATCH; pointer movement emits none.
- A failed PATCH restores the exact pre-drop roadmap.
- Timeline dependency paths must follow reordered task preview geometry.
- No push, PR, test deployment, or production deployment is part of this plan.

---

### Task 1: Canonical Roadmap Ordering Operations

**Files:**
- Create: `frontend/src/utils/roadmapOrdering.js`
- Create: `frontend/src/utils/roadmapOrdering.test.js`

**Interfaces:**
- Consumes: roadmap lane objects with `id`; roadmap bar objects with stable `id`, `lane`, dates, status, optional `planningBucket`, and optional `planningRank`.
- Produces:
  - `PLANNING_BUCKETS: readonly ["now", "next", "later"]`
  - `moveRoadmapLane(lanes, { sourceLaneId, targetLaneId, position }): Lane[]`
  - `moveRoadmapBar(bars, { barId, targetLaneId, targetBarId, position }): Bar[]`
  - `resolveRoadmapPlanningGroups(bars, { today }): { now: Bar[], next: Bar[], later: Bar[] }`
  - `moveRoadmapPlanningBar(bars, { barId, targetBucket, targetBarId, position, today }): Bar[]`

- [ ] **Step 1: Write failing tests for lane and task ordering**

Create fixtures with three lanes and five fully populated bars. Assert forward/backward lane movement, no-op movement, invalid IDs, first/middle/last task insertion, movement into an empty lane, and field preservation:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveRoadmapBar,
  moveRoadmapLane,
  moveRoadmapPlanningBar,
  resolveRoadmapPlanningGroups,
} from './roadmapOrdering.js';

const lanes = [
  { id: 'lane-a', name: 'A' },
  { id: 'lane-b', name: 'B' },
  { id: 'lane-c', name: 'C' },
];

const bars = [
  { id: 'a1', lane: 'lane-a', title: 'A1', startDate: '2026-07-01', endDate: '2026-07-02', status: 'planned', progress: 0, predecessors: [] },
  { id: 'a2', lane: 'lane-a', title: 'A2', startDate: '2026-07-03', endDate: '2026-07-04', status: 'planned', progress: 0, predecessors: ['a1'], linkedTaskId: 17 },
  { id: 'b1', lane: 'lane-b', title: 'B1', startDate: '2026-07-05', endDate: '2026-07-06', status: 'progress', progress: 40, predecessors: [] },
  { id: 'b2', lane: 'lane-b', title: 'B2', startDate: '2026-08-01', endDate: '2026-08-02', status: 'planned', progress: 0, predecessors: [] },
  { id: 'done', lane: 'lane-b', title: 'Done', startDate: '2026-06-01', endDate: '2026-06-02', status: 'done', progress: 100, predecessors: [] },
];

test('moves a lane without changing lane objects', () => {
  const result = moveRoadmapLane(lanes, { sourceLaneId: 'lane-c', targetLaneId: 'lane-a', position: 'before' });
  assert.deepEqual(result.map(item => item.id), ['lane-c', 'lane-a', 'lane-b']);
  assert.equal(result[0], lanes[2]);
});

test('moves a bar between lanes without changing unrelated fields', () => {
  const result = moveRoadmapBar(bars, { barId: 'a2', targetLaneId: 'lane-b', targetBarId: 'b2', position: 'before' });
  assert.deepEqual(result.filter(item => item.lane === 'lane-b').map(item => item.id), ['b1', 'a2', 'b2', 'done']);
  const moved = result.find(item => item.id === 'a2');
  assert.equal(moved.lane, 'lane-b');
  assert.equal(moved.linkedTaskId, 17);
  assert.deepEqual(moved.predecessors, ['a1']);
  assert.equal(moved.startDate, '2026-07-03');
});
```

- [ ] **Step 2: Write failing tests for legacy and manual NNL order**

Use a fixed local `today` (`new Date(2026, 6, 21)`). Assert current automatic behavior, completed-task exclusion, explicit bucket precedence, contiguous ranks after cross-column movement, and independence from `bars` order:

```js
test('keeps legacy automatic grouping until a manual move', () => {
  const grouped = resolveRoadmapPlanningGroups(bars, { today: new Date(2026, 6, 21) });
  assert.deepEqual(grouped.now.map(item => item.id), ['b1']);
  assert.deepEqual(grouped.next.map(item => item.id), ['a1', 'a2', 'b2']);
  assert.deepEqual(grouped.later.map(item => item.id), []);
  assert.equal(Object.hasOwn(bars[0], 'planningBucket'), false);
});

test('moves an NNL bar without changing roadmap lane order or dates', () => {
  const result = moveRoadmapPlanningBar(bars, {
    barId: 'b2', targetBucket: 'now', targetBarId: 'b1', position: 'before', today: new Date(2026, 6, 21),
  });
  const grouped = resolveRoadmapPlanningGroups(result, { today: new Date(2026, 6, 21) });
  assert.deepEqual(grouped.now.map(item => item.id), ['b2', 'b1']);
  assert.equal(result.find(item => item.id === 'b2').lane, 'lane-b');
  assert.equal(result.find(item => item.id === 'b2').startDate, '2026-08-01');
});
```

- [ ] **Step 3: Run the ordering tests to verify RED**

Run:

```bash
cd frontend
node --test src/utils/roadmapOrdering.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `roadmapOrdering.js`.

- [ ] **Step 4: Implement immutable lane and bar movement**

Implement ID normalization, remove-then-insert semantics, `before`/`after`, end-of-container insertion when `targetBarId` is null, and identity-preserving no-ops. Do not mutate input arrays or objects. The moved bar is cloned only when its lane changes.

Core structure:

```js
const idOf = value => String(value ?? '');

function insertRelative(items, item, targetId, position, getId) {
  if (!targetId) return [...items, item];
  const targetIndex = items.findIndex(candidate => getId(candidate) === idOf(targetId));
  if (targetIndex < 0) return null;
  const index = targetIndex + (position === 'after' ? 1 : 0);
  return [...items.slice(0, index), item, ...items.slice(index)];
}

export function moveRoadmapLane(lanes, request) {
  const sourceId = idOf(request.sourceLaneId);
  const source = lanes.find(item => idOf(item.id) === sourceId);
  if (!source || sourceId === idOf(request.targetLaneId)) return lanes;
  const remaining = lanes.filter(item => idOf(item.id) !== sourceId);
  return insertRelative(remaining, source, request.targetLaneId, request.position, item => idOf(item.id)) || lanes;
}
```

`moveRoadmapBar` must rebuild the global `bars` array so the order of every untouched lane remains unchanged while the target lane receives the moved bar at the requested location.

- [ ] **Step 5: Implement shared NNL grouping and movement**

Extract the existing automatic date/status rules into `automaticPlanningBucket(bar, today)`. Resolve explicit valid buckets before automatic ones, ignore completed tasks, sort explicit ranks deterministically, and retain the existing automatic date sort for legacy bars.

For `moveRoadmapPlanningBar`, resolve the visible groups first, remove the moved task, insert it into the target group, then assign every visible task in the affected source and target groups explicit contiguous ranks from zero. Merge the planning fields back into the original `bars` array without changing array order.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
cd frontend
node --test src/utils/roadmapOrdering.test.js
```

Expected: all ordering tests pass with zero failures.

- [ ] **Step 7: Commit Task 1**

```bash
git add frontend/src/utils/roadmapOrdering.js frontend/src/utils/roadmapOrdering.test.js
git commit -m "feat: add roadmap ordering model"
```

---

### Task 2: Pointer Intent and Drop Geometry

**Files:**
- Create: `frontend/src/utils/roadmapDragIntent.js`
- Create: `frontend/src/utils/roadmapDragIntent.test.js`

**Interfaces:**
- Consumes: pointer deltas, optional locked/forced intent, ordered item rectangles, pointer coordinates, and scroll-container bounds.
- Produces:
  - `ROADMAP_DRAG_THRESHOLD_PX = 6`
  - `resolveRoadmapDragIntent({ deltaX, deltaY, lockedIntent, forcedIntent }): null | "horizontal" | "vertical" | "resize-start" | "resize-end"`
  - `resolveRoadmapDropTarget({ coordinate, items, sourceId }): { targetId: string | null, position: "before" | "after" }`
  - `resolveRoadmapAutoScrollDelta({ pointer, start, end, edgeSize, maxStep }): number`

- [ ] **Step 1: Write failing intent and geometry tests**

```js
test('waits for six pixels and locks the dominant axis', () => {
  assert.equal(resolveRoadmapDragIntent({ deltaX: 5, deltaY: 0 }), null);
  assert.equal(resolveRoadmapDragIntent({ deltaX: 6, deltaY: 2 }), 'horizontal');
  assert.equal(resolveRoadmapDragIntent({ deltaX: 2, deltaY: 7 }), 'vertical');
  assert.equal(resolveRoadmapDragIntent({ deltaX: 50, deltaY: 1, lockedIntent: 'vertical' }), 'vertical');
});

test('forced resize intent cannot become reorder', () => {
  assert.equal(resolveRoadmapDragIntent({ deltaX: 0, deltaY: 80, forcedIntent: 'resize-start' }), 'resize-start');
});

test('resolves insertion before and after item midpoint', () => {
  const items = [{ id: 'a', start: 10, end: 30 }, { id: 'b', start: 40, end: 60 }];
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 45, items, sourceId: 'a' }), { targetId: 'b', position: 'before' });
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 58, items, sourceId: 'a' }), { targetId: 'b', position: 'after' });
});
```

Also test equal deltas (prefer horizontal to preserve current Timeline behavior), empty containers, source exclusion, and bounded positive/negative/zero auto-scroll.

- [ ] **Step 2: Run tests to verify RED**

Run `cd frontend && node --test src/utils/roadmapDragIntent.test.js`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure gesture helpers**

Use Euclidean activation distance (`Math.hypot(deltaX, deltaY)`) and retain `lockedIntent`/`forcedIntent` verbatim. Resolve drop before/after from item midpoints after excluding `sourceId`. Auto-scroll scales linearly inside the edge zone and clamps to `[-maxStep, maxStep]`.

- [ ] **Step 4: Run tests to verify GREEN**

Run `cd frontend && node --test src/utils/roadmapDragIntent.test.js`.

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add frontend/src/utils/roadmapDragIntent.js frontend/src/utils/roadmapDragIntent.test.js
git commit -m "feat: add roadmap drag intent helpers"
```

---

### Task 3: Optimistic Reorder Persistence With Rollback

**Files:**
- Create: `frontend/src/utils/roadmapReorderPersistence.js`
- Create: `frontend/src/utils/roadmapReorderPersistence.test.js`
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: previous roadmap, next roadmap, API patch function, state replacement callback, error callback.
- Produces:
  - `persistRoadmapReorder({ previousRoadmap, nextRoadmap, patchRoadmap, replaceRoadmap, normalizeRoadmap, onError }): Promise<Roadmap | null>`
  - `RoadmapDetail` receives `reorderPending` and `onReorder`.

- [ ] **Step 1: Write failing persistence tests**

```js
test('installs optimistic order and replaces it with server response', async () => {
  const installed = [];
  const previousRoadmap = { id: 'r1', lanes: [{ id: 'a' }, { id: 'b' }] };
  const nextRoadmap = { ...previousRoadmap, lanes: [{ id: 'b' }, { id: 'a' }] };
  const saved = { ...nextRoadmap, period: 'normalized' };
  const result = await persistRoadmapReorder({
    previousRoadmap,
    nextRoadmap,
    patchRoadmap: async () => saved,
    replaceRoadmap: roadmap => installed.push(roadmap),
    normalizeRoadmap: roadmap => roadmap,
  });
  assert.deepEqual(installed, [nextRoadmap, saved]);
  assert.equal(result, saved);
});

test('restores the exact previous roadmap after PATCH failure', async () => {
  const installed = [];
  const error = new Error('offline');
  const result = await persistRoadmapReorder({
    previousRoadmap,
    nextRoadmap,
    patchRoadmap: async () => { throw error; },
    replaceRoadmap: roadmap => installed.push(roadmap),
    normalizeRoadmap: roadmap => roadmap,
    onError: received => assert.equal(received, error),
  });
  assert.deepEqual(installed, [nextRoadmap, previousRoadmap]);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run `cd frontend && node --test src/utils/roadmapReorderPersistence.test.js`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the persistence helper**

Install `nextRoadmap` before awaiting. Call `patchRoadmap(nextRoadmap.id, nextRoadmap)` exactly once. Normalize and install the response. On rejection install the original `previousRoadmap`, call `onError`, and return null.

- [ ] **Step 4: Integrate one-at-a-time persistence in RoadmapsSection**

Add `const [reorderPendingId, setReorderPendingId] = useState('')`. Implement:

```jsx
async function handleReorderRoadmap(nextRoadmap) {
  const previousRoadmap = roadmaps.find(item => item.id === nextRoadmap?.id);
  if (!previousRoadmap || reorderPendingId === previousRoadmap.id) return null;
  setReorderPendingId(previousRoadmap.id);
  try {
    return await persistRoadmapReorder({
      previousRoadmap,
      nextRoadmap: recalc(nextRoadmap),
      patchRoadmap: (id, roadmap) => api.patchRoadmap(id, roadmap),
      replaceRoadmap,
      normalizeRoadmap: recalc,
      onError,
    });
  } finally {
    setReorderPendingId('');
  }
}
```

Pass `onReorder={handleReorderRoadmap}` and `reorderPending={reorderPendingId === rm.id}` to `RoadmapDetail`. Do not route reorder changes through `persistLinkedBarChange`.

- [ ] **Step 5: Run focused and existing linked-task tests**

```bash
cd frontend
node --test src/utils/roadmapReorderPersistence.test.js src/utils/taskRoadmapLinks.test.js
```

Expected: all tests pass and linked-task patch behavior remains unchanged.

- [ ] **Step 6: Commit Task 3**

```bash
git add frontend/src/utils/roadmapReorderPersistence.js frontend/src/utils/roadmapReorderPersistence.test.js frontend/src/sections/RoadmapsSection.jsx
git commit -m "feat: persist roadmap reorder safely"
```

---

### Task 4: Timeline Lane and Task Reordering

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Modify: `frontend/src/roadmapDependencyVisuals.test.js`
- Create: `frontend/src/roadmapVerticalReordering.test.js`

**Interfaces:**
- Consumes: Task 1 ordering helpers, Task 2 intent helpers, `onReorder`, `reorderPending`, current Timeline row geometry.
- Produces: live preview roadmap state inside `TimelineView`; vertical lane/task drop callbacks; unchanged horizontal date and resize behavior.

- [ ] **Step 1: Write failing source-contract tests**

Read `RoadmapsSection.jsx` as text and assert the integration contracts rather than brittle styling:

```js
test('timeline locks task gesture to horizontal dates or vertical reorder', () => {
  assert.match(source, /resolveRoadmapDragIntent/);
  assert.match(source, /moveRoadmapBar/);
  assert.match(source, /moveRoadmapLane/);
  assert.match(source, /previewRoadmap/);
  assert.match(source, /onReorder\?\./);
});

test('timeline preview drives rows and dependency geometry together', () => {
  assert.match(source, /const displayedRoadmap = previewRoadmap \|\| rm/);
  assert.match(source, /displayedRoadmap\.lanes/);
  assert.match(source, /displayedRoadmap\.bars/);
  assert.match(source, /buildDependencyState\(displayedRoadmap\.bars\)/);
});

test('resize and link mode remain isolated from reorder', () => {
  assert.match(source, /forcedIntent: mode === "move" \? null : mode/);
  assert.match(source, /if \(linkMode \|\| reorderPending\) return/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd frontend
node --test src/roadmapVerticalReordering.test.js src/roadmapDependencyVisuals.test.js
```

Expected: new source contracts fail because preview reorder is not integrated.

- [ ] **Step 3: Extend Timeline task pointer state**

Replace the move-only activation with a session that records `startClientX`, `startClientY`, `intent`, source bar ID, original percentages, and `previewRoadmap`. Use `resolveRoadmapDragIntent` on pointer move. Preserve the existing horizontal math verbatim after horizontal lock. In vertical mode, measure current task-row rectangles, resolve the target lane/task, and call `moveRoadmapBar` to update local preview only.

Click behavior remains: if the threshold is never crossed, pointer-up opens `onBarClick`. Resize handles pass forced intent and cannot reorder.

- [ ] **Step 4: Add Timeline lane header drag**

Add pointer handlers only to lane header rows. Measure lane group bounds, resolve before/after placement, and preview `moveRoadmapLane`. Keep task rows out of the lane drag target. Add `aria-label`, `aria-grabbed`, `grab/grabbing` cursors, placeholder styling, target tint, and the blue insertion line.

- [ ] **Step 5: Make preview drive all Timeline geometry**

Introduce:

```jsx
const displayedRoadmap = previewRoadmap || rm;
```

Build rows, dependency state, rendered bar rectangles, dependency edges, lane headers, bars, and milestones from `displayedRoadmap`. Use IDs rather than original indexes when preview order differs; resolve the persisted index only when opening the existing edit modal or invoking the existing date save callback.

On vertical pointer-up call `onReorder?.(previewRoadmap)` once only when the canonical order changed. On cancel/Escape clear preview and emit nothing. Disable reorder start while `reorderPending` or link mode is active.

- [ ] **Step 6: Add bounded auto-scroll and cleanup**

Use `requestAnimationFrame` while the pointer is inside the edge zone. Apply Task 2's scroll delta to the Timeline scroll container. Cancel the frame and remove window listeners on pointer-up, pointercancel, Escape, mode change, and unmount.

- [ ] **Step 7: Run focused tests and lint**

```bash
cd frontend
node --test src/roadmapVerticalReordering.test.js src/roadmapDependencyVisuals.test.js src/utils/roadmapOrdering.test.js src/utils/roadmapDragIntent.test.js
npm run lint
```

Expected: all focused tests and lint pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/roadmapVerticalReordering.test.js frontend/src/roadmapDependencyVisuals.test.js
git commit -m "feat: reorder roadmap timeline rows"
```

---

### Task 5: Swimlanes and NNL Drag-and-Drop

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Modify: `frontend/src/roadmapVerticalReordering.test.js`
- Modify: `frontend/src/utils/roadmapWorkbook.js`
- Create: `frontend/src/utils/roadmapWorkbookPlanning.test.js`

**Interfaces:**
- Consumes: Task 1 ordering/grouping, Task 2 drop helpers, shared `onReorder`, and `reorderPending`.
- Produces: lane-column and card reorder in Swimlanes; independent card order and categories in NNL; shared browser/workbook grouping.

- [ ] **Step 1: Write failing contracts for both views**

Assert that `SwimlanesView` consumes `moveRoadmapLane` and `moveRoadmapBar`, `NNLView` consumes `moveRoadmapPlanningBar`, both receive `onReorder/reorderPending`, and empty NNL columns are drop targets. Assert React keys use stable IDs instead of indexes.

- [ ] **Step 2: Write failing workbook planning tests**

Export the shared group resolver from `roadmapOrdering.js` and construct a workbook from bars whose dates imply `next` but whose explicit planning fields put them in `now/later`. Inspect the Now-Next-Later worksheet cells and assert manual group/rank order. Also assert a legacy roadmap still follows date/status grouping.

- [ ] **Step 3: Run tests to verify RED**

```bash
cd frontend
node --test src/roadmapVerticalReordering.test.js src/utils/roadmapWorkbookPlanning.test.js
```

Expected: source contracts and workbook manual-order assertions fail.

- [ ] **Step 4: Implement Swimlanes preview and drop**

Give `SwimlanesView` local drag state. Lane headers resolve horizontal insertion and call `moveRoadmapLane`; cards resolve vertical insertion and call `moveRoadmapBar`, including empty lane columns. Suppress card click after activated drag. Render placeholder, insertion line, target tint, grab/grabbing cursor, and ARIA state. Pointer-up emits one `onReorder`; cancellation emits none.

- [ ] **Step 5: Implement NNL preview and drop**

Replace the local `buildNowNextLater` function with `resolveRoadmapPlanningGroups`. Give `NNLView` local pointer state and use `moveRoadmapPlanningBar` for preview. Support empty columns and all source/target bucket pairs. Preserve dates and status. Block drag while saving and retain click-to-edit below the threshold.

- [ ] **Step 6: Share NNL grouping with XLSX**

Remove the duplicate automatic grouping implementation from `roadmapWorkbook.js`. Import `resolveRoadmapPlanningGroups` and use it in `buildNowNextLaterSheet`. Pass a date explicitly where needed so tests are deterministic. Do not change worksheet names, columns, styles, or other sheets.

- [ ] **Step 7: Align print and CSV ordering**

Ensure Timeline print iterates `roadmap.lanes` and filters `roadmap.bars` without an independent sort. Ensure CSV does the same. Add source-contract assertions that no date/title sort is introduced. JSON export requires no change because it already serializes the full roadmap.

- [ ] **Step 8: Run focused tests, workbook verification, and lint**

```bash
cd frontend
node --test src/roadmapVerticalReordering.test.js src/utils/roadmapWorkbookPlanning.test.js src/utils/roadmapOrdering.test.js
npm run verify:xlsx
npm run lint
```

Expected: all tests pass, workbook validation passes, and lint exits zero.

- [ ] **Step 9: Commit Task 5**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/roadmapVerticalReordering.test.js frontend/src/utils/roadmapWorkbook.js frontend/src/utils/roadmapWorkbookPlanning.test.js
git commit -m "feat: reorder roadmap cards across views"
```

---

### Task 6: Full Verification and Dev Browser Smoke

**Files:**
- Modify only if verification exposes a defect in files already owned by Tasks 1-5.
- Record task execution evidence in a unique untracked report path; do not overwrite another task's `.superpowers/sdd/task-1-report.md`.

**Interfaces:**
- Consumes: completed implementation from Tasks 1-5.
- Produces: independently reviewed, dev-only feature with fresh automated and browser evidence.

- [ ] **Step 1: Run the complete frontend suite**

```bash
cd frontend
node --test $(find src -name '*.test.js' -print | sort)
npm run lint
npm run verify:xlsx
npm run build
cd ..
git diff --check origin/main..HEAD
```

Expected: zero test failures, ESLint success, workbook validation success, build exit zero, and no whitespace errors. The existing Vite large-chunk advisory is non-blocking.

- [ ] **Step 2: Run regression checks for API and release contracts**

Use the same commands as `.github/workflows/ci.yml` for backend, Caddy, release-contract, and compose-build validation when Docker is available. If a local service is unavailable, report the exact missing prerequisite and rely only on successful GitHub CI after later promotion; do not claim an unrun check.

- [ ] **Step 3: Perform Timeline browser smoke in dev**

On a disposable roadmap with at least three lanes, two tasks per lane, one empty lane, and one dependency:

1. Click a Gantt block without moving and confirm edit opens.
2. Move it horizontally and confirm only dates change.
3. Resize both edges and confirm no vertical reorder.
4. Drag it vertically within the lane and confirm dates stay identical.
5. Drag it into the empty lane and confirm lane changes.
6. Move a lane header and confirm all its tasks move together.
7. Confirm dependency lines follow the live preview.
8. Enable link mode and confirm drag is disabled.

- [ ] **Step 4: Perform Swimlanes and NNL browser smoke**

1. Reorder Swimlane columns by headers.
2. Reorder cards and move one into another lane.
3. Reorder within each NNL column.
4. Move cards through `Now`, `Next`, and `Later`, including an empty column.
5. Confirm NNL movement does not change status or dates.
6. Reload and confirm lane, task, and NNL orders persist independently.
7. Confirm browser console has no errors.

- [ ] **Step 5: Verify rollback**

Temporarily intercept or force the roadmap PATCH to fail in dev, complete one reorder, and verify the exact prior roadmap order returns with the existing error message. Restore normal networking and verify the next reorder succeeds.

- [ ] **Step 6: Request code review and resolve findings**

Use `superpowers:requesting-code-review` against `origin/main..HEAD`. Resolve all Critical and Important findings, rerun the complete suite, and request final review. Do not promote while findings remain.

- [ ] **Step 7: Commit any verification fixes**

If fixes were required, stage only their intended files and commit:

```bash
git commit -m "fix: harden roadmap vertical reordering"
```

If no fixes were required, do not create an empty commit.

- [ ] **Step 8: Stop at the dev promotion gate**

Report the branch, final SHA, test counts, browser scenarios, review result, and any unrun checks. Keep the worktree and branch intact. Do not push, open a PR, or deploy until the user explicitly approves the next environment.
