# Roadmap Dependency Connector Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every roadmap dependency as a visible dotted orthogonal path that touches the source and target bullets, including when task dates are immediately adjacent.

**Architecture:** Keep dependency routing in the pure `computeDependencyLineLayout` helper and make connector offsets plus the minimum shoulder explicit inputs. Browser and print renderers consume the same returned geometry. In the browser, paths move to a connection layer above bars while bullet elements receive the highest connector layer.

**Tech Stack:** React, SVG, ResizeObserver-based timeline geometry, Node test runner, ESLint, Vite.

## Global Constraints

- Keep the current blue/gray dotted orthogonal path and do not add arrows.
- Anchor paths to the visual centers of the predecessor right bullet and target left bullet.
- Render paths above task bars and below circular dependency connectors.
- Use a minimum 16 px horizontal shoulder for same-X and adjacent-date anchors.
- Preserve measured dynamic row centers and existing highlight colors.
- Browser and print/PDF must use the same routing rules.
- Do not change dependency persistence, scheduling, drag, resize, or link creation.

---

### Task 1: Connector-aware dependency geometry

**Files:**
- Modify: `frontend/src/utils/roadmapDependencies.js:91-112`
- Test: `frontend/src/utils/roadmapDependencies.test.js:67-99`

**Interfaces:**
- Consumes: timeline percentages, rendered chart width, measured row centers, source/target bullet center offsets.
- Produces: `computeDependencyLineLayout({ predecessorEndPct, targetStartPct, chartWidth, predecessorCenterY, targetCenterY, predecessorAnchorOffsetX = -4, targetAnchorOffsetX = 0, minimumShoulder = 16 })` returning `{ startX, endX, startY, endY, middleX }`.

- [ ] **Step 1: Write failing tests for visual bullet centers and same-X routing**

Add tests that assert the source anchor includes the right-bullet center offset and the target anchor includes its left-bullet center offset:

```js
test("computeDependencyLineLayout anchors to rendered bullet centers", () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 20,
    targetStartPct: 50,
    chartWidth: 1000,
    predecessorCenterY: 37,
    targetCenterY: 107,
    predecessorAnchorOffsetX: -4,
    targetAnchorOffsetX: 0,
  });
  assert.equal(line.startX, 196);
  assert.equal(line.endX, 500);
  assert.equal(line.startY, 37);
  assert.equal(line.endY, 107);
});

test("computeDependencyLineLayout keeps a visible shoulder for adjacent anchors", () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 50,
    targetStartPct: 50,
    chartWidth: 1000,
    predecessorCenterY: 27,
    targetCenterY: 81,
    predecessorAnchorOffsetX: -4,
    targetAnchorOffsetX: 0,
    minimumShoulder: 16,
  });
  assert.equal(line.startX, 496);
  assert.equal(line.endX, 500);
  assert.equal(line.middleX, 516);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js`

Expected: the new anchor test reports `200 !== 196`, and the adjacent-anchor test reports the old 10 px elbow instead of `516`.

- [ ] **Step 3: Implement connector-aware anchors and a 16 px shoulder**

Update the helper so offsets are applied before choosing the route, and route the elbow beyond both anchors in the dependency direction:

```js
export function computeDependencyLineLayout({
  predecessorEndPct,
  targetStartPct,
  chartWidth,
  predecessorCenterY,
  targetCenterY,
  predecessorAnchorOffsetX = -4,
  targetAnchorOffsetX = 0,
  minimumShoulder = 16,
}) {
  const startX = chartWidth * predecessorEndPct / 100 + predecessorAnchorOffsetX;
  const endX = chartWidth * targetStartPct / 100 + targetAnchorOffsetX;
  const direction = endX >= startX ? 1 : -1;
  const middleX = direction > 0
    ? Math.max(startX, endX) + minimumShoulder
    : Math.min(startX, endX) - minimumShoulder;
  return {
    startX,
    endX,
    startY: predecessorCenterY,
    endY: targetCenterY,
    middleX,
  };
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js src/utils/timelineRowLayout.test.js`

Expected: all dependency and dynamic-row geometry tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js
git commit -m "fix: anchor roadmap dependencies to connectors"
```

---

### Task 2: Browser and print connection layers

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx:1990-2085`
- Modify: `frontend/src/sections/RoadmapsSection.jsx:2139-2164`
- Modify: `frontend/src/sections/RoadmapsSection.jsx:2373-2395`
- Modify: `frontend/src/sections/RoadmapsSection.jsx:3310-3505`
- Test: `frontend/src/utils/roadmapDependencies.test.js`
- Verify: `docs/TEST_DEV_ROADMAPS.md`

**Interfaces:**
- Consumes: Task 1 `computeDependencyLineLayout` geometry.
- Produces: browser and print SVG paths whose stacking order is grid < bars < paths < bullets.

- [ ] **Step 1: Add a failing route serialization regression test**

Export a small pure helper from `roadmapDependencies.js`:

```js
export function dependencyPathData({ startX, startY, middleX, endY, endX }) {
  return `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
}
```

Write the test first, before adding the helper:

```js
test("dependencyPathData keeps both horizontal connector shoulders", () => {
  assert.equal(
    dependencyPathData({ startX: 496, startY: 27, middleX: 516, endY: 81, endX: 500 }),
    "M 496 27 H 516 V 81 H 500",
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js`

Expected: FAIL because `dependencyPathData` is not exported.

- [ ] **Step 3: Implement shared path serialization**

Add `dependencyPathData` exactly as specified and use it for both the browser `<path d={...}>` and print/PDF path markup. Escape only values already produced as finite geometry numbers; do not accept arbitrary path strings from roadmap data.

- [ ] **Step 4: Correct browser stacking without changing interactions**

Define timeline layer constants next to the existing timeline constants:

```js
const TIMELINE_BAR_LAYER = 2;
const TIMELINE_DEPENDENCY_LAYER = 4;
const TIMELINE_CONNECTOR_LAYER = 5;
```

Apply them as follows:

- task bars use `TIMELINE_BAR_LAYER` (highlighted bars may remain below the connector layer);
- dependency SVG uses `TIMELINE_DEPENDENCY_LAYER`;
- incoming and outgoing bullet spans use `TIMELINE_CONNECTOR_LAYER`; render them as siblings of the positioned bar when necessary so the bar's stacking context cannot trap them below the dependency SVG;
- dependency SVG remains `pointerEvents: "none"`;
- grid/date guides stay below bars.

Pass explicit `predecessorAnchorOffsetX: -4`, `targetAnchorOffsetX: 0`, and `minimumShoulder: 16` from the renderer so the CSS bullet geometry and path geometry are visibly coupled.

- [ ] **Step 5: Apply the same route to print/PDF**

In the print document script, compute each dependency with the same connector offsets and 16 px shoulder, serialize it through the equivalent shared formula, and assign CSS stacking so `.dependency-layer` is above `.bar` and below `.connector`. Keep `window.__timelineReady` waiting for fonts and measured rows before path generation.

- [ ] **Step 6: Run focused verification**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js src/utils/timelineRowLayout.test.js`

Expected: all focused tests pass, including the same-X route.

Run: `cd frontend && npx eslint src/sections/RoadmapsSection.jsx src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js`

Expected: exit 0 with no ESLint errors or warnings.

- [ ] **Step 7: Rebuild local dev and visually reproduce both cases**

Run from the worktree root:

```bash
docker compose -f server/docker-compose.yml -f server/docker-compose.override.yml up -d --build
```

In `http://localhost:8080`, verify with browser geometry inspection:

- a dependency with separated dates starts/ends at the bullet centers;
- a dependency whose target starts immediately after its predecessor has at least 16 px of visible horizontal shoulder;
- the path is visible over bars but the white bullets remain above its endpoints;
- unequal wrapped row heights still place endpoints at measured row centers;
- no pointer interaction is intercepted by the SVG.

- [ ] **Step 8: Run complete verification**

Run independently from `frontend/`:

```bash
node --test src/**/*.test.js
npm run lint
npm run verify:xlsx
npm run build
```

Expected: zero test failures, ESLint exit 0, workbook validation passed, and Vite build exit 0. The existing large-chunk advisory is non-blocking.

- [ ] **Step 9: Document and commit Task 2**

Append the two dependency-line smoke cases to `docs/TEST_DEV_ROADMAPS.md`, then commit:

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js docs/TEST_DEV_ROADMAPS.md
git commit -m "fix: keep roadmap dependency lines visible"
```

---

### Task 3: Final review gate

**Files:**
- Review: all changes from the connector-design commit through Task 2 HEAD.

**Interfaces:**
- Consumes: completed geometry, browser, print, documentation, and verification evidence.
- Produces: an independent READY assessment or actionable findings.

- [ ] **Step 1: Request independent code review**

Ask the reviewer to verify anchor offsets, same-X routing, stacking order, dynamic-row centers, browser/print parity, and unchanged drag/link interactions.

- [ ] **Step 2: Address every Critical or Important finding with a new RED/GREEN test cycle**

For each valid finding, add a failing regression test, run it to confirm RED, implement the smallest fix, and rerun focused tests to GREEN.

- [ ] **Step 3: Repeat complete verification after review fixes**

Run the four commands from Task 2 Step 8 again and record their fresh exit status before declaring completion.
