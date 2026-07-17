# Remove Roadmap Dependency Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the current dependency-line and connector-bullet visualization from browser and PDF while keeping dependency data, linking, validation, and scheduling intact.

**Architecture:** Delete browser/print render paths and all visual-only geometry helpers. Keep the dependency model helpers used for predecessor storage, cycle checks, scheduling, and link creation. Add a structural source regression plus existing model tests to guard both halves of this boundary.

**Tech Stack:** React, Node test runner, ESLint, Vite.

## Global Constraints

- Do not migrate, rewrite, or erase existing `predecessors` data.
- Keep the `Связать` workflow, cycle prevention, automatic scheduling, and persistence.
- Remove browser/PDF paths, connector bullets, dependency legend, debug display, and visual-only helpers/tests/docs.
- Keep task drag/resize, dynamic row heights, milestones, and unrelated roadmap behavior unchanged.
- Print/PDF must contain no dependency path or connector markup.

---

### Task 1: Remove browser dependency visuals

**Files:**
- Create: `frontend/src/roadmapDependencyVisuals.test.js`
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Modify: `frontend/src/utils/roadmapDependencies.js`
- Modify: `frontend/src/utils/roadmapDependencies.test.js`

**Interfaces:**
- Preserve model exports: `sanitizePredecessorIds`, `buildDependencyState`, `wouldCreateDependencyCycle`, `applyDependencySchedule`, and task-ID helpers.
- Remove visual exports: `computeDependencyLineLayout`, `dependencyPathData`, `resolveRenderedTimelineWidth`, `resolveDependencyAnchorPercents`, `resolveDependencyEdgePercents`, `DEPENDENCY_SVG_OVERFLOW`, and `buildDependencyDebugEdges`.

- [ ] **Step 1: Add a structural test and verify RED**

Create a source-level test that reads `RoadmapsSection.jsx` and asserts the removed implementation markers are absent:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./sections/RoadmapsSection.jsx", import.meta.url), "utf8");

test("roadmap timeline contains no legacy dependency visuals", () => {
  for (const marker of [
    "dependencyLines",
    "TIMELINE_DEPENDENCY_LAYER",
    "TIMELINE_CONNECTOR_LAYER",
    "hasIncomingLink",
    "hasOutgoingLink",
    "Debug связей",
    ">Зависимость<",
  ]) {
    assert.equal(source.includes(marker), false, `legacy dependency visual remains: ${marker}`);
  }
});
```

Run: `cd frontend && node --test src/roadmapDependencyVisuals.test.js`

Expected: FAIL listing the legacy markers still present.

- [ ] **Step 2: Remove browser paths and bullets**

In `RoadmapsSection.jsx`:

- remove dependency geometry imports and visual layer constants;
- remove `useRenderedTimelineWidth` and return to the existing fixed minimum `chartWidth` only for layout sizing;
- remove incoming/outgoing props and sibling bullet spans from `GanttBar`;
- restore normal title padding without dependency-specific left padding;
- remove `dependencyLines`, `dependencyDebugEdges`, and the SVG dependency overlay;
- remove the dependency legend item and debug display;
- remove neighbor highlighting driven only by predecessor/successor state;
- preserve source selection feedback in link mode with `linkSourceId === r.b.id`;
- do not modify `handleLinkTasks`, `applyDependencySchedule`, predecessor writes, or cycle validation.

- [ ] **Step 3: Remove visual-only helpers and tests**

Delete the visual exports listed in Task 1 Interfaces from `roadmapDependencies.js`. Delete only their test cases/imports from `roadmapDependencies.test.js`; retain all normalization, graph, cycle, and scheduling tests.

- [ ] **Step 4: Verify Task 1 GREEN**

Run:

```bash
cd frontend
node --test src/roadmapDependencyVisuals.test.js src/utils/roadmapDependencies.test.js src/utils/timelineRowLayout.test.js
npx eslint src/roadmapDependencyVisuals.test.js src/sections/RoadmapsSection.jsx src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js
```

Expected: structural and dependency-model tests pass; ESLint exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/roadmapDependencyVisuals.test.js frontend/src/sections/RoadmapsSection.jsx frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js
git commit -m "refactor: remove roadmap dependency visuals"
```

---

### Task 2: Remove print visuals and verify preserved dependency behavior

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Modify: `frontend/src/roadmapDependencyVisuals.test.js`
- Modify: `docs/TEST_DEV_ROADMAPS.md`

**Interfaces:**
- Preserve browser/PDF task rows and dynamic heights.
- Produce print markup with no `.dependency-overlay`, `.connector`, injected geometry helpers, or generated SVG paths.

- [ ] **Step 1: Extend the structural test and verify RED**

Add markers for the print implementation:

```js
for (const marker of [
  "dependency-overlay",
  'class="connector"',
  "computeDependencyLineLayout.toString",
  "dependencyPathData.toString",
]) {
  assert.equal(source.includes(marker), false, `legacy print dependency visual remains: ${marker}`);
}
```

Run: `cd frontend && node --test src/roadmapDependencyVisuals.test.js`

Expected: FAIL because print CSS/markup/script still contains these markers.

- [ ] **Step 2: Remove print/PDF dependency rendering**

Remove `.dependency-overlay` and `.connector` print CSS, connector spans in printed task rows, injected dependency geometry/path helpers, dependency path creation after row measurement, and any print-only dependency-state calculation. Keep `window.__timelineReady`, font readiness, dynamic row measurement, and print cleanup unchanged.

- [ ] **Step 3: Update the dev verification checklist**

Remove checklist cases for endpoint alignment, adjacent shoulders, boundary elbows, and drag-preview movement. Add one current acceptance block:

```md
## Dependency model without visualization

- Timeline and PDF show no dependency lines, connector bullets, dependency legend, or debug block.
- The «Связать» action still stores predecessor IDs.
- Cycle prevention and automatic schedule shifting still work.
- Saving and reopening a roadmap preserves existing predecessor IDs.
```

- [ ] **Step 4: Run complete verification**

Run independently from `frontend/`:

```bash
node --test src/**/*.test.js
npm run lint
npm run verify:xlsx
npm run build
```

Expected: zero failures, lint exit 0, workbook validation passed, and Vite build exit 0.

- [ ] **Step 5: Local smoke**

Build local dev and verify a roadmap containing stored predecessors displays no lines or bullets. Use `Связать` to create a dependency, save/reopen, and confirm the predecessor remains through API/data inspection and schedule recalculation, without visual artifacts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/roadmapDependencyVisuals.test.js docs/TEST_DEV_ROADMAPS.md
git commit -m "refactor: remove dependency visuals from print"
```

---

### Task 3: Final review

- [ ] **Step 1: Request independent broad review**

Verify that all browser/PDF visuals and dead helpers are gone, while predecessor persistence, linking, cycle prevention, scheduling, drag/resize, and dynamic rows remain intact.

- [ ] **Step 2: Fix Critical or Important findings through RED/GREEN cycles**

- [ ] **Step 3: Repeat the complete verification after review fixes**
