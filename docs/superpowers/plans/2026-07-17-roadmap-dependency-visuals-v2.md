# Roadmap Dependency Visuals V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quiet dotted dependency layer whose active chain and ports are readable, responsive, drag-aware, and consistent in browser and PDF.

**Architecture:** Put all coordinate, boundary, preview, and presentation decisions in a new pure module. Render paths through a focused React overlay component that receives already-resolved edge geometry. Keep DOM width observation in a small hook and keep `TimelineView` responsible only for composing roadmap rows, active state, and drag preview inputs.

**Tech Stack:** React, inline SVG, ResizeObserver, Node test runner, ESLint, Vite.

## Global Constraints

- Every dependency is dotted with rounded caps/joins.
- Quiet lines are thin, neutral, and low-opacity; active lines are slightly stronger and neutral.
- Ports appear only for the active chain and never capture pointer input.
- Active chain is driven by hovered task or `Связать` source selection.
- X uses measured rendered chart width; Y uses measured dynamic row centers.
- Minimum shoulder is 16 px from both anchors; boundary routing stays in-chart when possible.
- Move and resize use the same preview percentages as bars.
- Print uses quiet dotted paths and no ports.
- Preserve data, linking, cycles, scheduling, persistence, import/export, drag/resize, milestones, dynamic rows, and print readiness.

---

### Task 1: Pure dependency visual model

**Files:**
- Create: `frontend/src/utils/roadmapDependencyVisuals.js`
- Create: `frontend/src/utils/roadmapDependencyVisuals.test.js`

**Interfaces:**
- `resolveDependencyAnchorPercents({ startPct, endPct, taskIndex, barDrag }) -> { startPct, endPct }`
- `resolveDependencyEdgePercents({ predecessor, target, barDrag }) -> { predecessorEndPct, targetStartPct }`
- `computeDependencyRoute({ predecessorEndPct, targetStartPct, chartWidth, predecessorCenterY, targetCenterY, sourceOffsetX = -4, targetOffsetX = 0, minimumShoulder = 16 }) -> { startX, startY, elbowX, endY, endX }`
- `dependencyPathData(route) -> string`
- `dependencyPresentation({ sourceId, targetId, activeTaskIds }) -> { active, strokeWidth, opacity, dashArray }`
- Constants: `QUIET_DEPENDENCY_STYLE` and `ACTIVE_DEPENDENCY_STYLE`.

- [ ] **Step 1: Write failing preview tests**

Test persisted fallback, unrelated preview, move, resize-start, and resize-end using exact percentages. Test source-active and target-active edge isolation.

- [ ] **Step 2: Verify preview RED**

Run: `cd frontend && node --test src/utils/roadmapDependencyVisuals.test.js`

Expected: module-not-found failure.

- [ ] **Step 3: Implement preview helpers**

Implement the two preview helpers without date conversion or mutation:

```js
export function resolveDependencyAnchorPercents({ startPct, endPct, taskIndex, barDrag }) {
  if (!barDrag || barDrag.idx !== taskIndex) return { startPct, endPct };
  return { startPct: barDrag.previewLeft, endPct: barDrag.previewLeft + barDrag.previewWidth };
}
```

`resolveDependencyEdgePercents` resolves both tasks and returns only predecessor end and target start.

- [ ] **Step 4: Write failing route tests**

Cover forward, reverse, same-X/adjacent, unequal row centers, near-left, near-right, and full-width fallback. Assert both shoulders are at least 16 px whenever either in-chart candidate fits.

- [ ] **Step 5: Implement deterministic route geometry**

Calculate physical-pixel anchors from percentages and offsets. Prefer the dependency direction; if its elbow leaves `[0, chartWidth]`, choose the opposite elbow only when it is in-chart and at least `minimumShoulder` from both anchors. Otherwise keep the preferred deterministic elbow. Serialize as `M/H/V/H`.

- [ ] **Step 6: Write and implement presentation-state tests**

Use exact exported styles:

```js
export const QUIET_DEPENDENCY_STYLE = Object.freeze({ strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
export const ACTIVE_DEPENDENCY_STYLE = Object.freeze({ strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });
```

`dependencyPresentation` is active when either endpoint belongs to `activeTaskIds`. Assert quiet/active values and no color field.

- [ ] **Step 7: Verify Task 1 GREEN and commit**

Run:

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js src/utils/roadmapDependencies.test.js
npx eslint src/utils/roadmapDependencyVisuals.js src/utils/roadmapDependencyVisuals.test.js
```

Commit:

```bash
git add frontend/src/utils/roadmapDependencyVisuals.js frontend/src/utils/roadmapDependencyVisuals.test.js
git commit -m "feat: add quiet dependency visual model"
```

---

### Task 2: Browser overlay, ports, and measured width

**Files:**
- Create: `frontend/src/hooks/useRenderedTimelineWidth.js`
- Create: `frontend/src/hooks/useRenderedTimelineWidth.test.js`
- Create: `frontend/src/components/RoadmapDependencyOverlay.jsx`
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Modify: `frontend/src/roadmapDependencyVisuals.test.js`

**Interfaces:**
- `useRenderedTimelineWidth(gridRef, minimumWidth) -> number`
- `RoadmapDependencyOverlay({ width, height, edges })`, where every edge contains `{ id, route, presentation }`.
- `GanttBar` receives `showIncomingPort` and `showOutgoingPort`; ports use the same preview left/width as the bar.

- [ ] **Step 1: Write failing rendered-width lifecycle tests**

Extract a pure `resolveRenderedTimelineWidth(measuredWidth, minimumWidth)` and test wider measured width, invalid/zero measurement fallback, and minimum-width fallback. Test observer cleanup through the same node-lifecycle pattern used by `useTimelineRowLayout`.

- [ ] **Step 2: Implement the width hook**

Measure `gridRef.current.getBoundingClientRect().width` immediately after mount, observe the actual grid with `ResizeObserver`, disconnect on cleanup, and use a window resize listener only as fallback when ResizeObserver is unavailable. State changes must not affect grid sizing.

- [ ] **Step 3: Implement the focused overlay component**

Render one SVG with:

```jsx
<svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
  style={{ position: "absolute", inset: 0, width: "100%", height, overflow: "visible", pointerEvents: "none", zIndex: 4 }}>
```

For every edge render a `<path>` using `dependencyPathData`, `stroke="currentColor"`, its tested width/opacity/dash array, `strokeLinecap="round"`, `strokeLinejoin="round"`, and `vectorEffect="non-scaling-stroke"`. The component accepts no roadmap objects and performs no date calculation.

- [ ] **Step 4: Integrate edge composition in TimelineView**

Build `rowByTaskId` from measured layout. Resolve active IDs from hovered task or `linkSourceId` plus its direct predecessors/successors. For every stored predecessor:

1. resolve source/target persisted percentages;
2. apply `barDrag` through `resolveDependencyEdgePercents`;
3. compute route with rendered width and measured row centers;
4. attach quiet/active presentation.

Include `barDrag`, rendered width, layout, active IDs, dependency state, and timeline in memo dependencies.

- [ ] **Step 5: Add active ports without introducing a bar stacking trap**

Render visual port spans as siblings of the positioned bar inside its row wrapper. Incoming center is `calc(previewLeft% - 4px)` and outgoing center is `calc((previewLeft + previewWidth)% - 8px)`. Use 8 px circles, neutral background/stroke, z-index 5, and `pointerEvents: "none"`. Render ports only when the bar belongs to the active chain and has the corresponding edge.

- [ ] **Step 6: Replace the old absence-only structural test**

Update `roadmapDependencyVisuals.test.js` to assert the new component owns SVG/path/port presentation and `RoadmapsSection.jsx` does not inline SVG dependency path markup. Keep the assertion that no production debug block or permanent dependency legend exists.

- [ ] **Step 7: Verify Task 2 and commit**

Run focused tests, changed-file ESLint, `npm run build`, and local browser smoke at narrow and wide widths. Check quiet links, active hover/source chain, no pointer interception, exact port endpoints, adjacent dates, and drag/resize preview.

Commit:

```bash
git add frontend/src/hooks/useRenderedTimelineWidth.js frontend/src/hooks/useRenderedTimelineWidth.test.js frontend/src/components/RoadmapDependencyOverlay.jsx frontend/src/sections/RoadmapsSection.jsx frontend/src/roadmapDependencyVisuals.test.js
git commit -m "feat: render quiet roadmap dependencies"
```

---

### Task 3: Print/PDF dotted dependencies

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`
- Modify: `frontend/src/roadmapDependencyVisuals.test.js`
- Modify: `docs/TEST_DEV_ROADMAPS.md`

**Interfaces:**
- Reuse the pure route/path helpers by injecting their standalone function source into the print document.
- Print edges always use `QUIET_DEPENDENCY_STYLE` and render no ports.

- [ ] **Step 1: Add failing print-structure assertions**

Assert print markup contains dotted dependency paths, rounded caps/joins, `pointer-events:none`, and no connector markup.

- [ ] **Step 2: Implement print dependency paths**

After fonts and two animation frames, measure paired print row centers and chart width, compute routes for stored predecessors, and append a single SVG overlay. Use quiet stroke width/opacity/dash array and no circles. Keep `window.__timelineReady`, timeout fallback, `print()`, and iframe cleanup unchanged.

- [ ] **Step 3: Update dev acceptance documentation**

Document browser states, dense narrow/wide layouts, adjacent/boundary routing, live move/resize, stored predecessor preservation, and PDF dotted paths without ports.

- [ ] **Step 4: Run complete verification**

Run independently:

```bash
cd frontend
node --test src/**/*.test.js
npm run lint
npm run verify:xlsx
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/roadmapDependencyVisuals.test.js docs/TEST_DEV_ROADMAPS.md
git commit -m "feat: print quiet roadmap dependencies"
```

---

### Task 4: Final visual and code review

- [ ] **Step 1: Browser-smoke a copied dense roadmap**

Verify quiet lines, active chain, ports, same/adjacent dates, reverse and boundary routes, narrow/wide widths, dynamic row heights, hover/link source, and live move/resize. Remove temporary smoke data.

- [ ] **Step 2: Request independent broad review**

Review geometry, observer lifecycle, layering, preview synchronization, multi-edge active state, print readiness, data preservation, tests, and scope.

- [ ] **Step 3: Fix all Critical/Important findings through RED/GREEN and repeat full verification**
