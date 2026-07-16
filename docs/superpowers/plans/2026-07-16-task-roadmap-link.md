# Task to Roadmap Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ordinary dashboard task appear in exactly one roadmap, with deterministic two-way synchronization and safe unlink/delete behavior.

**Architecture:** Keep the ordinary task as the source of truth for title, due date, assignee/owner, column, status, and progress. Store only `linkedTaskId` plus a recovery snapshot inside the existing server-persisted roadmap payload; isolate mapping and normalization rules in a pure utility module, while `RoadmapsSection` coordinates task and roadmap API writes.

**Tech Stack:** React 19, JavaScript ES modules, Node.js built-in test runner, FastAPI/PostgreSQL roadmap payload API, ESLint, Vite.

## Global Constraints

- One ordinary task may be linked to one roadmap item in one roadmap only.
- The ordinary task remains the primary object; roadmap owns item id, lane, start date, predecessors, and visual metadata.
- No new backend table or API endpoint; persist link fields in the existing roadmap payload.
- API failure must leave both task-derived and roadmap-owned client state unchanged.
- Existing independent roadmap items must retain their current behavior.
- Events, UCP tasks, and development-plan tasks remain out of scope.

---

## File Structure

- Create `frontend/src/utils/taskRoadmapLinks.js`: pure mappings, snapshots, normalization, availability, unlinking, and task-patch calculation.
- Create `frontend/src/utils/taskRoadmapLinks.test.js`: unit coverage for every deterministic link rule.
- Modify `frontend/src/sections/RoadmapsSection.jsx`: picker UI, linked marker/editing, normalization, ordered API writes, rollback behavior, and roadmap persistence.
- Modify `frontend/src/App.jsx`: pass ordinary tasks into the roadmap section and receive the current task-to-roadmap index.
- Modify `frontend/src/sections/TasksSection.jsx`: display the linked roadmap title in the ordinary-task modal.
- Modify `frontend/src/sections/TaskArchiveSection.jsx`: forward optional link metadata into the shared task modal.

### Task 1: Pure task-roadmap link domain module

**Files:**
- Create: `frontend/src/utils/taskRoadmapLinks.js`
- Create: `frontend/src/utils/taskRoadmapLinks.test.js`

**Interfaces:**
- Consumes: ordinary tasks shaped as `{ id, title, due, column, ownerId, assigneeId }`; roadmaps shaped as `{ id, title, bars: Array }`.
- Produces: `taskColumnToRoadmapState(column)`, `roadmapStateToTaskColumn(status, progress)`, `snapshotLinkedTask(task)`, `resolveLinkedBar(bar, task)`, `normalizeTaskRoadmapLinks(roadmaps, tasks)`, `availableTasksForLink(roadmaps, tasks, linkedTaskId?)`, `unlinkTaskBar(bar, task?)`, `buildLinkedTaskPatch(previousBar, nextBar)` and `buildRoadmapLinkIndex(roadmaps)`.

- [ ] **Step 1: Write failing mapping and resolution tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availableTasksForLink, buildLinkedTaskPatch, buildRoadmapLinkIndex,
  normalizeTaskRoadmapLinks, resolveLinkedBar, roadmapStateToTaskColumn,
  snapshotLinkedTask, taskColumnToRoadmapState, unlinkTaskBar,
} from './taskRoadmapLinks.js';

test('maps task columns in both directions', () => {
  assert.deepEqual(taskColumnToRoadmapState('Беклог'), { status: 'todo', progress: 0 });
  assert.deepEqual(taskColumnToRoadmapState('В работе'), { status: 'active', progress: 50 });
  assert.deepEqual(taskColumnToRoadmapState('Готов'), { status: 'done', progress: 100 });
  assert.deepEqual(taskColumnToRoadmapState('Архив'), { status: 'done', progress: 100 });
  assert.equal(roadmapStateToTaskColumn('todo', 0), 'Беклог');
  assert.equal(roadmapStateToTaskColumn('active', 35), 'В работе');
  assert.equal(roadmapStateToTaskColumn('done', 100), 'Готов');
});

test('resolves task-owned values and preserves roadmap-owned values', () => {
  const bar = { id: 'bar-1', linkedTaskId: 7, laneId: 'lane-a', startDate: '2026-07-10', endDate: '2026-07-15', predecessors: ['bar-0'] };
  const task = { id: 7, title: 'Отчёт', due: '2026-07-20', column: 'В работе', ownerId: 2, assigneeId: 3 };
  assert.deepEqual(resolveLinkedBar(bar, task), {
    ...bar, title: 'Отчёт', endDate: '2026-07-20', ownerId: 3,
    status: 'active', progress: 50, linkedTaskSnapshot: snapshotLinkedTask(task),
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && node --test src/utils/taskRoadmapLinks.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `taskRoadmapLinks.js`.

- [ ] **Step 3: Implement mappings, snapshots, resolution, normalization, availability, unlinking, patch generation, and index creation**

```js
const COLUMN_TO_STATE = {
  'Беклог': { status: 'todo', progress: 0 },
  'В работе': { status: 'active', progress: 50 },
  'Готов': { status: 'done', progress: 100 },
  'Архив': { status: 'done', progress: 100 },
};

export function taskColumnToRoadmapState(column) {
  return COLUMN_TO_STATE[column] || COLUMN_TO_STATE['Беклог'];
}

export function roadmapStateToTaskColumn(status, progress) {
  if (status === 'done' || Number(progress) >= 100) return 'Готов';
  if (status === 'active' || Number(progress) > 0) return 'В работе';
  return 'Беклог';
}
```

Implement the remaining exported functions with these exact rules: compare ids with `String(id)`; preserve a bar `endDate` when task due is empty or `"—"`; choose `assigneeId || ownerId` for resolved owner; refresh the snapshot whenever a task resolves; scan roadmaps and bars in array order so the first duplicate keeps its link; convert later duplicates and missing tasks with `unlinkTaskBar`; exclude all used ids except the optionally edited `linkedTaskId`; emit task patches only for changed `due` and mapped `column`; and index links as `{ [String(taskId)]: { roadmapId, roadmapTitle, barId } }`.

- [ ] **Step 4: Add edge-case tests**

```js
test('normalization keeps first duplicate and converts later duplicate and missing links', () => {
  const tasks = [{ id: 7, title: 'A', due: '—', column: 'Беклог', ownerId: 2 }];
  const roadmaps = [
    { id: 'r1', title: 'One', bars: [{ id: 'a', linkedTaskId: 7, endDate: '2026-07-20' }] },
    { id: 'r2', title: 'Two', bars: [
      { id: 'b', linkedTaskId: 7, linkedTaskSnapshot: { title: 'Old A', column: 'Готов' } },
      { id: 'c', linkedTaskId: 99, linkedTaskSnapshot: { title: 'Deleted', due: '2026-08-01', column: 'В работе', ownerId: 4 } },
    ] },
  ];
  const normalized = normalizeTaskRoadmapLinks(roadmaps, tasks);
  assert.equal(normalized[0].bars[0].linkedTaskId, 7);
  assert.equal(normalized[0].bars[0].endDate, '2026-07-20');
  assert.equal(normalized[1].bars[0].linkedTaskId, undefined);
  assert.equal(normalized[1].bars[1].title, 'Deleted');
});

test('availability, unlink, patches, and index preserve one-task-one-roadmap', () => {
  const roadmaps = [{ id: 'r1', title: 'One', bars: [{ id: 'a', linkedTaskId: 7 }] }];
  const tasks = [{ id: 7 }, { id: 8 }];
  assert.deepEqual(availableTasksForLink(roadmaps, tasks).map(task => task.id), [8]);
  assert.equal(unlinkTaskBar({ id: 'a', linkedTaskId: 7, linkedTaskSnapshot: { title: 'A' } }).title, 'A');
  assert.deepEqual(buildLinkedTaskPatch(
    { endDate: '2026-07-20', status: 'todo', progress: 0 },
    { endDate: '2026-07-21', status: 'active', progress: 50 },
  ), { due: '2026-07-21', column: 'В работе' });
  assert.deepEqual(buildRoadmapLinkIndex(roadmaps)['7'], { roadmapId: 'r1', roadmapTitle: 'One', barId: 'a' });
});
```

- [ ] **Step 5: Run the domain tests and commit**

Run: `cd frontend && node --test src/utils/taskRoadmapLinks.test.js`

Expected: all tests PASS.

```bash
git add frontend/src/utils/taskRoadmapLinks.js frontend/src/utils/taskRoadmapLinks.test.js
git commit -m "feat: add task roadmap link domain rules"
```

### Task 2: Roadmap linking and normalization UI

**Files:**
- Modify: `frontend/src/App.jsx:24-31`
- Modify: `frontend/src/sections/RoadmapsSection.jsx:1094-1290,2760-2910,3402-3640`

**Interfaces:**
- Consumes: Task 1 exports and new prop `tasks = []` on `RoadmapsSection`.
- Produces: `RoadmapsSection` prop `onLinkIndexChange(index)` and UI actions for link, unlink, save, delete, drag, and resize.

- [ ] **Step 1: Add a failing component-contract test to the domain test file**

```js
test('a newly linked bar resolves immediately from its task', () => {
  const task = { id: 8, title: 'План', due: '2026-08-02', column: 'Готов', assigneeId: 5 };
  const bar = resolveLinkedBar({ id: 'bar-8', linkedTaskId: task.id, laneId: 'lane-a', startDate: '2026-07-25', predecessors: [] }, task);
  assert.equal(bar.title, 'План');
  assert.equal(bar.endDate, '2026-08-02');
  assert.equal(bar.ownerId, 5);
  assert.equal(bar.status, 'done');
  assert.equal(bar.progress, 100);
});
```

- [ ] **Step 2: Run the focused test and verify RED if any required behavior is missing**

Run: `cd frontend && node --test src/utils/taskRoadmapLinks.test.js`

Expected: the new test fails until resolution handles all asserted fields; otherwise record immediate PASS because Task 1 already supplies the contract.

- [ ] **Step 3: Pass tasks from App and normalize loaded roadmaps**

Change the section factory to:

```jsx
roadmaps: ({ data, api, currentUser, onError, onRoadmapLinksChange }) => (
  <RoadmapsSection
    tasks={data.tasks}
    team={data.team}
    api={api}
    currentUser={currentUser}
    onError={onError}
    onLinkIndexChange={onRoadmapLinksChange}
  />
),
```

In `RoadmapsSection`, accept `tasks = []`, normalize every successful `listRoadmaps()` result before `recalc`, and use a memoized `taskById` map. Add an effect on `[roadmaps, onLinkIndexChange]` that publishes `buildRoadmapLinkIndex(roadmaps)`.

- [ ] **Step 4: Add the link picker and linked marker**

Add a modal opened by a new `Связать обычную задачу` action next to the existing `Новая задача` action. The modal must search by title, render only `availableTasksForLink(roadmaps, tasks)`, show title/status/due/assignee, and call `handleLinkTask(task)`; the handler creates a bar with a generated roadmap item id, current lane/default owner, sensible start date, empty predecessors, `linkedTaskId`, and `linkedTaskSnapshot`, resolves it, then persists the containing roadmap.

Pass `linkedTask` and `onUnlink` into `BarFormModal`. Render badge `Связана с обычной задачей`; disable title and owner controls; keep lane, start date, end date, status/progress, and dependencies editable; render `Отвязать` to convert via `unlinkTaskBar` without changing the ordinary task.

- [ ] **Step 5: Make linked saves transactional from the client perspective**

For linked bars, calculate `taskPatch = buildLinkedTaskPatch(previousResolvedBar, nextBar)`. If it is non-empty, await `api.patchTask(linkedTaskId, taskPatch)` first. Only after that succeeds, call `api.patchRoadmap` with roadmap-owned fields plus a refreshed snapshot. If task patching fails, call `onError(error)` and return without changing `roadmaps`; if roadmap patching fails after a task patch, call `onError(error)`, leave local roadmap state unchanged, and rely on the next bootstrap/remount normalization to show the server task state.

Apply the same ordered write rule to timeline drag/resize. A changed `endDate` patches task `due`; a start-only change persists only roadmap `startDate`. Deleting a linked bar uses only `api.patchRoadmap`; it never calls `deleteTask`. Unlinking uses only `api.patchRoadmap`.

- [ ] **Step 6: Run focused tests, lint touched modules, and commit**

Run: `cd frontend && node --test src/utils/taskRoadmapLinks.test.js src/sections/roadmapState.test.js`

Expected: all tests PASS.

Run: `cd frontend && npx eslint src/App.jsx src/sections/RoadmapsSection.jsx src/utils/taskRoadmapLinks.js src/utils/taskRoadmapLinks.test.js`

Expected: exit 0 with no errors.

```bash
git add frontend/src/App.jsx frontend/src/sections/RoadmapsSection.jsx frontend/src/utils/taskRoadmapLinks.test.js
git commit -m "feat: link ordinary tasks to roadmaps"
```

### Task 3: Show roadmap relationship in ordinary task details

**Files:**
- Modify: `frontend/src/App.jsx:24-31,40-70,341`
- Modify: `frontend/src/sections/TasksSection.jsx:12-180,925,1017`
- Modify: `frontend/src/sections/TaskArchiveSection.jsx:5-31`

**Interfaces:**
- Consumes: `onLinkIndexChange(index)` from Task 2, where index values are `{ roadmapId, roadmapTitle, barId }`.
- Produces: optional `roadmapLink` prop on `TaskDetailModal` and `roadmapLinksByTaskId` props on Tasks and Archive sections.

- [ ] **Step 1: Add state and prop plumbing in App**

```jsx
const [roadmapLinksByTaskId, setRoadmapLinksByTaskId] = useState({});

tasks: ({ data, api, onError, currentUser, roadmapLinks }) => (
  <TasksSection initialTasks={data.tasks} team={data.team} api={api} onError={onError} currentUser={currentUser} roadmapLinksByTaskId={roadmapLinks} />
),
archive: ({ data, api, onError, currentUser, roadmapLinks }) => (
  <TaskArchiveSection initialTasks={data.tasks} team={data.team} api={api} onError={onError} currentUser={currentUser} roadmapLinksByTaskId={roadmapLinks} />
),
```

Pass `roadmapLinks: roadmapLinksByTaskId` and `onRoadmapLinksChange: setRoadmapLinksByTaskId` into the active section factory context.

- [ ] **Step 2: Forward the selected task's link metadata**

Update all `TaskDetailModal` call sites in `TasksSection` and `TaskArchiveSection`:

```jsx
<TaskDetailModal
  task={editTask}
  roadmapLink={roadmapLinksByTaskId[String(editTask.id)] || null}
  onClose={...}
  onSave={...}
  team={team}
  currentUser={currentUser}
/>
```

- [ ] **Step 3: Render the relationship read-only in the modal**

Accept `roadmapLink = null` in `TaskDetailModal`. When present, render a compact blue badge above the editable fields with label `Дорожная карта` and value `roadmapLink.roadmapTitle`. Do not add navigation or alter ordinary task saving.

- [ ] **Step 4: Run lint/build and commit**

Run: `cd frontend && npx eslint src/App.jsx src/sections/TasksSection.jsx src/sections/TaskArchiveSection.jsx`

Expected: exit 0 with no errors.

Run: `cd frontend && npm run build`

Expected: Vite exits 0 and writes `frontend/dist`.

```bash
git add frontend/src/App.jsx frontend/src/sections/TasksSection.jsx frontend/src/sections/TaskArchiveSection.jsx
git commit -m "feat: show roadmap link in task details"
```

### Task 4: Regression verification and operator documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-task-roadmap-link-design.md`
- Modify: `docs/TEST_DEV_ROADMAPS.md`

**Interfaces:**
- Consumes: completed feature from Tasks 1–3.
- Produces: verified build and a concise architecture note that linked fields live inside the existing roadmap payload.

- [ ] **Step 1: Document the final data flow**

Add a roadmap-link subsection stating: ordinary task is authoritative; roadmap payload stores `linkedTaskId` and snapshot; one task can be linked once; task API is written before roadmap API; unlink/delete never delete the ordinary task; missing tasks fall back to snapshots.

- [ ] **Step 2: Run the complete frontend test suite**

Run: `cd frontend && node --test $(find src -name '*.test.js' -print | sort)`

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Run all frontend quality gates**

Run: `cd frontend && npm run lint`

Expected: exit 0 with no ESLint errors or warnings.

Run: `cd frontend && npm run verify:xlsx`

Expected: workbook verification exits 0.

Run: `cd frontend && npm run build`

Expected: production build exits 0.

- [ ] **Step 4: Perform the browser smoke test**

Start the project using its documented local command, sign in, open a roadmap, link an unlinked ordinary task, and verify title/status/due/assignee. Edit due/status from the roadmap and verify the ordinary task; drag the end edge and verify due; unlink and verify the task remains; relink then delete the bar and verify the task remains; refresh and verify persistence; create/edit/drag an independent roadmap item and export it.

Expected: all scenarios match the approved specification and no console error appears.

- [ ] **Step 5: Commit documentation and final verification record**

```bash
git add docs/superpowers/specs/2026-07-16-task-roadmap-link-design.md docs
git commit -m "docs: describe task roadmap synchronization"
```

Record the exact passing command totals and browser smoke-test result in the commit/PR description; do not commit generated `frontend/dist` unless repository policy explicitly tracks it.
