# Roadmap Dependency Drag Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every incoming and outgoing dependency path attached to its circular connector throughout task move and resize previews.

**Architecture:** Add a pure helper that resolves persisted task percentages plus an optional active drag preview. Feed those resolved anchors into the existing dependency geometry without mutating roadmap dates or changing persistence and print behavior.

**Tech Stack:** React, SVG, pointer events, Node test runner, ESLint, Vite.

## Global Constraints

- Incoming paths use the active task's preview left anchor.
- Outgoing paths use the active task's preview right anchor (`previewLeft + previewWidth`).
- Unrelated paths and persisted dates remain unchanged during preview.
- Pointer cancel restores persisted anchors; pointer release keeps the existing save flow.
- Preserve connector offsets, 16 px shoulders, boundary routing, dynamic row centers, z-order, and `pointerEvents: none`.
- Print/PDF remains unchanged.

---

### Task 1: Pure preview-anchor resolution

**Files:**
- Modify: `frontend/src/utils/roadmapDependencies.js`
- Test: `frontend/src/utils/roadmapDependencies.test.js`

**Interfaces:**
- Produces: `resolveDependencyAnchorPercents({ startPct, endPct, taskIndex, barDrag })` returning `{ startPct, endPct }`.
- `barDrag` shape: `{ idx, previewLeft, previewWidth } | null`.

- [ ] **Step 1: Add failing tests**

```js
test("dependency anchors fall back to persisted percentages", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 20, endPct: 35, taskIndex: 2, barDrag: null }), {
    startPct: 20,
    endPct: 35,
  });
});

test("dependency anchors use both ends of the active move preview", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({
    startPct: 20,
    endPct: 35,
    taskIndex: 2,
    barDrag: { idx: 2, previewLeft: 42, previewWidth: 18 },
  }), { startPct: 42, endPct: 60 });
});

test("dependency anchors ignore another task preview", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({
    startPct: 20,
    endPct: 35,
    taskIndex: 2,
    barDrag: { idx: 3, previewLeft: 42, previewWidth: 18 },
  }), { startPct: 20, endPct: 35 });
});
```

- [ ] **Step 2: Verify RED**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js`

Expected: module export failure because `resolveDependencyAnchorPercents` does not exist.

- [ ] **Step 3: Implement the smallest pure helper**

```js
export function resolveDependencyAnchorPercents({ startPct, endPct, taskIndex, barDrag }) {
  if (!barDrag || barDrag.idx !== taskIndex) return { startPct, endPct };
  return {
    startPct: barDrag.previewLeft,
    endPct: barDrag.previewLeft + barDrag.previewWidth,
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js`

Expected: all dependency tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js
git commit -m "test: define dependency drag anchors"
```

---

### Task 2: Live dependency geometry during drag and resize

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx:2170-2205`
- Test: `frontend/src/utils/roadmapDependencies.test.js`
- Modify: `docs/TEST_DEV_ROADMAPS.md`

**Interfaces:**
- Consumes: `resolveDependencyAnchorPercents` from Task 1.
- Produces: dependency line geometry derived from the same `barDrag` preview used by `GanttBar`.

- [ ] **Step 1: Add a failing edge-resolution test**

Add a pure helper that resolves both ends of a dependency from source/target anchors:

```js
test("dependency edge preview changes only the active endpoint", () => {
  const edge = resolveDependencyEdgePercents({
    predecessor: { startPct: 10, endPct: 20, taskIndex: 1 },
    target: { startPct: 40, endPct: 55, taskIndex: 2 },
    barDrag: { idx: 2, previewLeft: 48, previewWidth: 12 },
  });
  assert.deepEqual(edge, { predecessorEndPct: 20, targetStartPct: 48 });
});
```

- [ ] **Step 2: Verify RED**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js`

Expected: module export failure because `resolveDependencyEdgePercents` does not exist.

- [ ] **Step 3: Implement edge resolution**

```js
export function resolveDependencyEdgePercents({ predecessor, target, barDrag }) {
  const predecessorAnchors = resolveDependencyAnchorPercents({ ...predecessor, barDrag });
  const targetAnchors = resolveDependencyAnchorPercents({ ...target, barDrag });
  return {
    predecessorEndPct: predecessorAnchors.endPct,
    targetStartPct: targetAnchors.startPct,
  };
}
```

Add a second assertion with the predecessor active to prove only `predecessorEndPct` changes.

- [ ] **Step 4: Connect preview geometry to `TimelineView`**

For each dependency, calculate persisted source and target percentages, pass their `idx` values and `barDrag` to `resolveDependencyEdgePercents`, then pass the returned percentages to `computeDependencyLineLayout`. Add `barDrag` to the `dependencyLines` memo dependencies. Do not derive or write preview dates.

- [ ] **Step 5: Verify focused behavior**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js src/utils/timelineRowLayout.test.js`

Expected: all focused tests pass.

Run: `cd frontend && npx eslint src/sections/RoadmapsSection.jsx src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js`

Expected: exit 0 without warnings.

- [ ] **Step 6: Build and perform browser smoke**

Run: `cd frontend && npm run build`.

In local dev, verify:

- moving a connected predecessor moves its right bullet and outgoing path start together;
- moving a connected target moves its left bullet and incoming path end together;
- resizing the predecessor's right edge moves the outgoing path;
- resizing the target's left edge moves the incoming path;
- pointer cancel restores the original path; release saves through the existing flow.

Record these cases in `docs/TEST_DEV_ROADMAPS.md`.

- [ ] **Step 7: Run complete verification**

Run independently from `frontend/`:

```bash
node --test src/**/*.test.js
npm run lint
npm run verify:xlsx
npm run build
```

Expected: zero failures, lint exit 0, workbook validation passed, and Vite build exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js docs/TEST_DEV_ROADMAPS.md
git commit -m "fix: move dependency lines with task previews"
```

---

### Task 3: Final review

**Files:**
- Review all changes from the drag-preview design commit through Task 2 HEAD.

- [ ] **Step 1: Request independent review**

Verify move and resize behavior for both source and target tasks, memo dependencies, cancel/release behavior, unchanged persistence, and test coverage.

- [ ] **Step 2: Fix every Critical or Important finding through a RED/GREEN cycle**

- [ ] **Step 3: Repeat the full verification commands after review fixes**
