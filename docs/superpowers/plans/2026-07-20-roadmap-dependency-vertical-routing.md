# Vertical Roadmap Dependency Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace horizontal-first dependency paths with vertical-first orthogonal paths that do not run along task bars.

**Architecture:** Keep route calculation in the pure `roadmapDependencyVisuals.js` model. Change its returned route from one X elbow to a middle Y corridor plus a target-side approach X; `dependencyPathData()` renders `V → H → V → H`. Browser Timeline and PDF already call and serialize these same functions, so one pure implementation keeps both surfaces identical.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, SVG paths, Vite 8.

## Global Constraints

- A target below exits downward; a target above exits upward.
- The route is `V → H → V → H` and ends at the left edge of the target bar.
- Quiet/active dotted styles and directional port visibility do not change.
- Preview coordinates continue to drive routes during move and resize.
- Browser and PDF use the same route and path functions.
- Dependency data, cycle prevention, schedule shifting, arrows, labels, colors, and parallel routing channels are out of scope.

---

### Task 1: Pure vertical-first route geometry

**Files:**
- Modify: `frontend/src/utils/roadmapDependencyVisuals.js:15-53`
- Test: `frontend/src/utils/roadmapDependencyVisuals.test.js:86-173`

**Interfaces:**
- Consumes: `computeDependencyRoute({ predecessorEndPct, targetStartPct, chartWidth, predecessorCenterY, targetCenterY, sourceOffsetX?, targetOffsetX?, minimumShoulder? })`.
- Produces: `{ startX, startY, corridorY, approachX, endY, endX }` and `dependencyPathData(route): string` in the form `M … V … H … V … H …`.

- [ ] **Step 1: Replace old elbow assertions with failing vertical-first assertions**

Update the route tests so their core expectations are:

```js
test("computeDependencyRoute exits vertically toward a lower target", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 30,
    targetStartPct: 60,
    chartWidth: 1000,
    predecessorCenterY: 24,
    targetCenterY: 72,
  });
  assert.deepEqual(route, {
    startX: 296,
    startY: 24,
    corridorY: 48,
    approachX: 584,
    endY: 72,
    endX: 600,
  });
  assert.equal(dependencyPathData(route), "M 296 24 V 48 H 584 V 72 H 600");
});

test("computeDependencyRoute exits vertically toward an upper target", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 80,
    targetStartPct: 20,
    chartWidth: 1000,
    predecessorCenterY: 72,
    targetCenterY: 24,
  });
  assert.deepEqual(route, {
    startX: 796,
    startY: 72,
    corridorY: 48,
    approachX: 184,
    endY: 24,
    endX: 200,
  });
  assert.equal(dependencyPathData(route), "M 796 72 V 48 H 184 V 24 H 200");
});

test("computeDependencyRoute keeps adjacent same-date tasks off their bars", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 50,
    targetStartPct: 50,
    chartWidth: 1000,
    predecessorCenterY: 24,
    targetCenterY: 56,
  });
  assert.deepEqual(route, {
    startX: 496,
    startY: 24,
    corridorY: 40,
    approachX: 484,
    endY: 56,
    endX: 500,
  });
  assert.equal(dependencyPathData(route), "M 496 24 V 40 H 484 V 56 H 500");
});
```

Replace the old `assertMinimumShoulders()` tests with boundary tests:

```js
test("computeDependencyRoute clamps its anchors near the left boundary", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 0,
    targetStartPct: 1,
    chartWidth: 1000,
    predecessorCenterY: 20,
    targetCenterY: 60,
  });
  assert.equal(route.startX, 0);
  assert.equal(route.approachX, 0);
  assert.equal(route.endX, 10);
});

test("computeDependencyRoute keeps the target approach inside the right boundary", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 100,
    targetStartPct: 100,
    chartWidth: 1000,
    predecessorCenterY: 20,
    targetCenterY: 60,
  });
  assert.equal(route.startX, 996);
  assert.equal(route.approachX, 984);
  assert.equal(route.endX, 1000);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js
```

Expected: FAIL because the current route returns `elbowX` and the current path begins with `H`.

- [ ] **Step 3: Implement the minimal vertical-first route**

Replace `computeDependencyRoute()` and `dependencyPathData()` with:

```js
export function computeDependencyRoute({
  predecessorEndPct,
  targetStartPct,
  chartWidth,
  predecessorCenterY,
  targetCenterY,
  sourceOffsetX = -4,
  targetOffsetX = 0,
  minimumShoulder = 16,
}) {
  const clampX = value => Math.max(0, Math.min(chartWidth, value));
  const startX = clampX((predecessorEndPct / 100) * chartWidth + sourceOffsetX);
  const endX = clampX((targetStartPct / 100) * chartWidth + targetOffsetX);
  const corridorY = predecessorCenterY + (targetCenterY - predecessorCenterY) / 2;
  const approachX = clampX(endX - minimumShoulder);

  return {
    startX,
    startY: predecessorCenterY,
    corridorY,
    approachX,
    endY: targetCenterY,
    endX,
  };
}

export function dependencyPathData({ startX, startY, corridorY, approachX, endY, endX }) {
  return `M ${startX} ${startY} V ${corridorY} H ${approachX} V ${endY} H ${endX}`;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js src/roadmapDependencyVisuals.test.js
npx eslint src/utils/roadmapDependencyVisuals.js src/utils/roadmapDependencyVisuals.test.js
```

Expected: all focused tests pass and ESLint reports zero errors and warnings.

- [ ] **Step 5: Commit the pure geometry change**

```bash
git add frontend/src/utils/roadmapDependencyVisuals.js frontend/src/utils/roadmapDependencyVisuals.test.js
git commit -m "fix: route roadmap dependencies between task rows"
```

---

### Task 2: Shared browser/PDF acceptance and regression verification

**Files:**
- Modify: `docs/TEST_DEV_ROADMAPS.md`
- Verify: `frontend/src/sections/RoadmapsSection.jsx:2120-2151`
- Verify: `frontend/src/sections/RoadmapsSection.jsx:3400-3440`
- Verify: `frontend/src/components/RoadmapDependencyOverlay.jsx`

**Interfaces:**
- Consumes: the new `computeDependencyRoute()` object and `dependencyPathData()` string from Task 1.
- Produces: identical vertical-first SVG routes in browser and PDF, plus an updated manual acceptance checklist.

- [ ] **Step 1: Verify both rendering surfaces still consume the shared functions**

Confirm with:

```bash
rg -n "computeDependencyRoute|dependencyPathData" \
  frontend/src/sections/RoadmapsSection.jsx \
  frontend/src/components/RoadmapDependencyOverlay.jsx
```

Expected: Timeline calls `computeDependencyRoute`, the overlay calls `dependencyPathData`, and the print document serializes and calls both functions. No duplicate path formula should be introduced.

- [ ] **Step 2: Update the manual acceptance checklist**

Add these exact checks under `## Визуальные связи задач` in `docs/TEST_DEV_ROADMAPS.md`:

```markdown
- Связь сначала выходит из порта вертикально в промежуток между строками и только затем идёт горизонтально к цели.
- Для цели ниже первый сегмент направлен вниз, для цели выше — вверх.
- У задач с совпадающими или соседними датами линия не проходит вдоль плашки и не заходит внутрь неё.
- В Timeline и PDF используется одинаковый маршрут `V → H → V → H`.
```

- [ ] **Step 3: Run the complete automated verification**

Run:

```bash
cd frontend
node --test $(find src -name '*.test.js' -print | sort)
npm run lint
npm run verify:xlsx
npm run build
```

Expected: all tests pass; ESLint has zero errors/warnings; XLSX validates `Timeline`, `Дорожки`, `Now-Next-Later`; Vite build succeeds. The existing non-failing large-chunk warning may remain.

- [ ] **Step 4: Run browser smoke against the built dev app**

Open the existing local smoke roadmap and verify:

```text
1. Quiet paths begin M … V, not M … H.
2. Selecting the middle task strengthens only its direct incoming/outgoing edges.
3. Ports appear only for active direct edges.
4. The route stays between rows for a lower and an upper target.
5. Dragging and resizing a task changes the SVG path immediately.
6. At 1024 px and 1600 px viewport widths, overlay width equals rendered chart width.
7. Browser console contains no errors or warnings.
```

Inspect the generated PDF/print document and confirm its `.print-dependency-path` values also begin `M … V` and contain the same `V → H → V → H` command sequence without interactive ports.

- [ ] **Step 5: Commit acceptance documentation**

```bash
git add docs/TEST_DEV_ROADMAPS.md
git commit -m "docs: verify vertical roadmap dependency routes"
```

---

### Task 3: Final review gate

**Files:**
- Review: `frontend/src/utils/roadmapDependencyVisuals.js`
- Review: `frontend/src/utils/roadmapDependencyVisuals.test.js`
- Review: `docs/TEST_DEV_ROADMAPS.md`

**Interfaces:**
- Consumes: committed implementation and verification evidence from Tasks 1-2.
- Produces: a review verdict for the complete change range.

- [ ] **Step 1: Review the complete change range against the spec**

Use base commit `59216ab` and the final implementation HEAD. Check route direction, boundary clamping, same-date tasks, live preview reuse, PDF reuse, unchanged dependency data, and absence of unrelated refactoring.

- [ ] **Step 2: Fix findings through a new RED→GREEN cycle**

For each behavioral finding, first add the smallest failing test to `frontend/src/utils/roadmapDependencyVisuals.test.js`, run it to observe the expected failure, implement only the corresponding route change, and rerun focused tests before committing.

- [ ] **Step 3: Repeat final verification after review fixes**

Run:

```bash
cd frontend
node --test $(find src -name '*.test.js' -print | sort)
npm run lint
npm run verify:xlsx
npm run build
git diff --check 59216ab...HEAD
```

Expected: all commands exit zero except the accepted informational Vite chunk-size warning; `git diff --check` prints no output.
