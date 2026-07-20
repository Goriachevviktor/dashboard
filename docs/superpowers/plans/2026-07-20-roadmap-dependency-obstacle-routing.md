# Obstacle-Free Roadmap Dependency Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor dependencies 8 px outside the predecessor and route them around every rendered task bar in browser Timeline and PDF.

**Architecture:** Replace percentage-only routing with shared pixel rectangles. A pure router first tries the compact `V → H → V → H` path through a real row gap; if blocked, a deterministic shortest-path search may switch between free vertical channels as many times as minimally necessary. Browser and print both build the same rectangle shape and serialize arbitrary orthogonal point lists through one path function.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, SVG paths, Vite 8.

## Global Constraints

- The predecessor anchor is exactly 8 px to the right of its rendered bar edge whenever chart bounds permit.
- No permanent anchor dot is rendered; the active outgoing port is centered on the same anchor.
- No route segment may enter the source, target, or intermediate task rectangles.
- The compact path remains `V → H → V → H`; when it is blocked, the router may add the minimum necessary number of orthogonal bends to avoid every task.
- Browser and PDF use the same rectangle, routing, and path-serialization functions.
- Rendered minimum bar width is 8 px and must affect bars, ports, and routes identically.
- Quiet/active dotted styles, dependency IDs, cycle prevention, schedule shifting, arrows, labels, colors, and parallel link channels do not change.

---

### Task 1: Pure rendered geometry and obstacle-aware router

**Files:**
- Modify: `frontend/src/utils/roadmapDependencyVisuals.js`
- Test: `frontend/src/utils/roadmapDependencyVisuals.test.js`

**Interfaces:**
- Produces `resolveRenderedBarRect({ leftPct, widthPct, chartWidth, rowTop, rowHeight, minimumWidthPx = 8, barHeight = 30 })` returning `{ left, right, top, bottom, centerY, width }`.
- Produces `computeDependencyRoute({ sourceRect, targetRect, obstacleRects, chartWidth, anchorGap = 8, targetShoulder = 16, clearance = 2 })` returning `{ points, compact, startX, endX }`.
- Produces `dependencyPathData({ points })` returning an SVG string beginning `M`, then only `V` or `H` commands.

- [ ] **Step 1: Write failing rendered-rectangle tests**

Add:

```js
test("resolveRenderedBarRect applies the physical minimum width", () => {
  assert.deepEqual(resolveRenderedBarRect({
    leftPct: 40,
    widthPct: 0.2,
    chartWidth: 1000,
    rowTop: 54,
    rowHeight: 54,
  }), {
    left: 400,
    right: 408,
    top: 66,
    bottom: 96,
    centerY: 81,
    width: 8,
  });
});

test("resolveRenderedBarRect keeps a wider percentage width", () => {
  assert.equal(resolveRenderedBarRect({
    leftPct: 10,
    widthPct: 20,
    chartWidth: 500,
    rowTop: 0,
    rowHeight: 54,
  }).right, 150);
});
```

- [ ] **Step 2: Write failing compact-route tests**

Use rectangles:

```js
const sourceRect = { left: 40, right: 180, top: 52, bottom: 82, centerY: 67 };
const targetRect = { left: 220, right: 360, top: 106, bottom: 136, centerY: 121 };
```

Assert:

```js
const route = computeDependencyRoute({ sourceRect, targetRect, obstacleRects: [], chartWidth: 720 });
assert.equal(route.startX, 188);
assert.equal(route.endX, 220);
assert.equal(route.compact, true);
assert.deepEqual(route.points, [
  { x: 188, y: 67 },
  { x: 188, y: 94 },
  { x: 204, y: 94 },
  { x: 204, y: 121 },
  { x: 220, y: 121 },
]);
assert.equal(dependencyPathData(route), "M 188 67 V 94 H 204 V 121 H 220");
```

Add the mirrored upper-target case and assert its first segment moves upward.

- [ ] **Step 3: Write the failing intermediate-obstacle regression**

```js
test("computeDependencyRoute adds a free channel around an intermediate bar", () => {
  const source = { left: 40, right: 180, top: 52, bottom: 82, centerY: 67 };
  const blocker = { left: 150, right: 350, top: 106, bottom: 136, centerY: 121 };
  const target = { left: 220, right: 360, top: 160, bottom: 190, centerY: 175 };
  const route = computeDependencyRoute({
    sourceRect: source,
    targetRect: target,
    obstacleRects: [blocker],
    chartWidth: 720,
  });
  assert.equal(route.startX, 188);
  assert.equal(route.compact, false);
  assert.equal(route.points[1].y, 94);
  assert.equal(route.points.at(-1).x, 220);
  assert.equal(route.points.at(-1).y, 175);
  assert.equal(routeIntersectsRects(route.points, [source, blocker, target], {
    allowStartOutsideSource: true,
    allowEndOnTargetLeft: true,
  }), false);
});
```

The test-only assertion helper must inspect every horizontal/vertical segment against rectangle interiors; touching the final target-left boundary is allowed.

- [ ] **Step 4: Verify RED**

Run:

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js
```

Expected: FAIL because rectangle resolution, arbitrary point routes, and obstacle detours do not exist.

- [ ] **Step 5: Implement rendered rectangles**

Implement:

```js
export function resolveRenderedBarRect({
  leftPct,
  widthPct,
  chartWidth,
  rowTop,
  rowHeight,
  minimumWidthPx = 8,
  barHeight = 30,
}) {
  const left = (leftPct / 100) * chartWidth;
  const width = Math.max(minimumWidthPx, (widthPct / 100) * chartWidth);
  const centerY = rowTop + rowHeight / 2;
  return {
    left,
    right: Math.min(chartWidth, left + width),
    top: centerY - barHeight / 2,
    bottom: centerY + barHeight / 2,
    centerY,
    width: Math.min(width, chartWidth - left),
  };
}
```

- [ ] **Step 6: Implement segment collision primitives**

Add private helpers that treat rectangle interiors as blocked and boundaries as available:

```js
function horizontalSegmentBlocked(y, x1, x2, rects, clearance) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return rects.some(rect => (
    y > rect.top - clearance
    && y < rect.bottom + clearance
    && maxX > rect.left - clearance
    && minX < rect.right + clearance
  ));
}

function verticalSegmentBlocked(x, y1, y2, rects, clearance) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return rects.some(rect => (
    x > rect.left - clearance
    && x < rect.right + clearance
    && maxY > rect.top - clearance
    && minY < rect.bottom + clearance
  ));
}
```

Check source and target interiors as well as intermediate obstacles. Exempt only the first vertical segment when it departs on or to the right of the source-right boundary, and only the final horizontal segment when it approaches `targetRect.left` from the left. This prevents endpoint rectangles from being excluded wholesale.

- [ ] **Step 7: Implement deterministic compact and detour candidates**

Rules:

```text
startX = clamp(sourceRect.right + anchorGap, 0, chartWidth)
endX = clamp(targetRect.left, 0, chartWidth)
approachX = clamp(endX - targetShoulder, 0, chartWidth)
direction = sign(targetRect.centerY - sourceRect.centerY)
sourceGapY = nearest free row-gap Y immediately after source in direction
targetGapY = nearest free row-gap Y immediately before target in direction
```

Build gap candidates from sorted `sourceRect`, `targetRect`, and obstacles using midpoint values where `upper.bottom < lower.top`. First try each single gap between source and target, ordered by distance to the endpoints' midpoint, as:

```js
[
  { x: startX, y: sourceRect.centerY },
  { x: startX, y: gapY },
  { x: approachX, y: gapY },
  { x: approachX, y: targetRect.centerY },
  { x: endX, y: targetRect.centerY },
]
```

If all compact candidates collide, build an orthogonal visibility graph. Its Y states are free row-gap midpoints plus rectangle clearance boundaries; its X states are `startX`, `approachX`, `0`, `chartWidth`, and every obstacle's clamped `left - clearance` / `right + clearance`. Connect collision-free horizontal and vertical neighbors, with the start connected only by an initial vertical move in the target's direction and the target connected only through the left-side approach.

Run deterministic Dijkstra search over `(point, incoming direction)` states. Compare candidates by total Manhattan length, then number of bends, then preference for real row-gap midpoints, then numeric coordinate order. This permits as many channel changes as minimally necessary while choosing the same route for equal inputs. Normalize duplicate and collinear search points, but preserve all five logical compact points so clamping cannot erase its `V → H → V → H` command shape. If no collision-free graph path exists, return the shortest boundary-channel fallback and expose `blocked: true` for diagnostics and tests.

- [ ] **Step 8: Serialize arbitrary orthogonal points**

```js
export function dependencyPathData({ points }) {
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    if (point.x === previous.x) return `${path} V ${point.y}`;
    return `${path} H ${point.x}`;
  }, `M ${points[0].x} ${points[0].y}`);
}
```

- [ ] **Step 9: Verify GREEN and commit**

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js src/roadmapDependencyVisuals.test.js
npx eslint src/utils/roadmapDependencyVisuals.js src/utils/roadmapDependencyVisuals.test.js
git diff --check
cd ..
git add frontend/src/utils/roadmapDependencyVisuals.js frontend/src/utils/roadmapDependencyVisuals.test.js
git commit -m "fix: route roadmap links around task bars"
```

Expected: focused tests pass and ESLint is clean.

---

### Task 2: Browser rendered geometry and external active port

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx:1995-2155,2395-2430`
- Modify: `frontend/src/components/RoadmapDependencyOverlay.jsx`
- Test: `frontend/src/roadmapDependencyVisuals.test.js`

**Interfaces:**
- Consumes `resolveRenderedBarRect()` and `computeDependencyRoute()` from Task 1.
- `RoadmapDependencyPort({ anchorX })` renders an 8 px active port centered at the exact pixel anchor.
- Timeline routes consume the same effective bar rectangles used for visible bars and ports.

- [ ] **Step 1: Add failing structural integration assertions**

Assert that `RoadmapsSection.jsx` imports and calls `resolveRenderedBarRect`, passes `sourceRect`, `targetRect`, and `obstacleRects`, and that `RoadmapDependencyPort` receives `anchorX`. Assert the old outgoing formula ``calc(${left + width}% - 8px)`` is absent.

- [ ] **Step 2: Verify RED**

```bash
cd frontend
node --test src/roadmapDependencyVisuals.test.js
```

Expected: FAIL on missing rendered rectangle and `anchorX` wiring.

- [ ] **Step 3: Build one `renderedBarRectById` map**

Inside Timeline, derive each task's current `leftPct` and `widthPct` from persisted dates or the active `barDrag` preview. Call `resolveRenderedBarRect()` with the measured `renderedWidth` and its measured row `{ top, height }`. Use the map for every route and pass all other rectangles as `obstacleRects`.

- [ ] **Step 4: Center active ports on route anchors**

Replace the port component with:

```jsx
export function RoadmapDependencyPort({ anchorX }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', left: anchorX - 4, top: '50%', width: 8, height: 8,
        borderRadius: '50%', background: '#fff',
        border: '1px solid rgba(71, 85, 105, .7)', boxSizing: 'border-box',
        transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 5,
      }}
    />
  );
}
```

For an incoming port, pass `targetRect.left`; for an outgoing port, pass the exact route `startX` (`sourceRect.right + 8`, chart-clamped). Do not render ports outside active direct edges.

- [ ] **Step 5: Verify focused integration and commit**

```bash
cd frontend
node --test src/roadmapDependencyVisuals.test.js src/utils/roadmapDependencyVisuals.test.js src/hooks/useRenderedTimelineWidth.test.js
npx eslint src/sections/RoadmapsSection.jsx src/components/RoadmapDependencyOverlay.jsx src/roadmapDependencyVisuals.test.js
cd ..
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/components/RoadmapDependencyOverlay.jsx frontend/src/roadmapDependencyVisuals.test.js
git commit -m "fix: align roadmap ports with rendered bars"
```

Expected: focused tests pass and ESLint is clean.

---

### Task 3: PDF parity, acceptance, and final verification

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx:3380-3445`
- Modify: `docs/TEST_DEV_ROADMAPS.md`
- Test: `frontend/src/roadmapDependencyVisuals.test.js`

**Interfaces:**
- Print creates `{ left, right, top, bottom, centerY, width }` from each measured bar rectangle relative to the chart/body.
- Print passes every other task rectangle as obstacles to the same router and serializes the returned points with the same path function.

- [ ] **Step 1: Add failing print-parity assertions**

Assert the print script builds a rectangle map, passes `sourceRect`, `targetRect`, `obstacleRects`, uses `dependencyPathData(route)`, and creates no port/circle elements.

- [ ] **Step 2: Verify RED**

```bash
cd frontend
node --test src/roadmapDependencyVisuals.test.js
```

Expected: FAIL because print still passes percentage anchors and row centers.

- [ ] **Step 3: Convert print routing to measured rectangles**

Build all task rectangles once from `getBoundingClientRect()` relative to `chartRect.left` and `bodyRect.top`. For every predecessor/target pair, pass those rectangles and all remaining rectangles to `computeDependencyRoute()`. Keep quiet dotted styling and no print ports.

- [ ] **Step 4: Update acceptance documentation**

Add the exact checks:

```markdown
- Точка выхода связи находится на 8 px правее фактического края предшественника; постоянная точка не отображается.
- Активный выходной порт центрирован на той же точке крепления.
- Связь через несколько строк не пересекает промежуточные плашки и при необходимости использует дополнительный ортогональный обход.
- Очень короткая задача имеет одинаковую точку крепления в Timeline и PDF с учётом минимальной ширины 8 px.
```

Add `frontend/src/utils/roadmapDependencyVisuals.js`, `frontend/src/components/RoadmapDependencyOverlay.jsx`, and `frontend/src/hooks/useRenderedTimelineWidth.js` to the selective transfer list.

- [ ] **Step 5: Run the complete automated verification**

```bash
cd frontend
node --test $(find src -name '*.test.js' -print | sort)
npm run lint
npm run verify:xlsx
npm run build
```

Expected: all tests pass, lint has zero errors/warnings, XLSX validation passes, and Vite builds successfully; the existing informational chunk-size warning may remain.

- [ ] **Step 6: Run built-dev smoke**

Verify on the local smoke roadmap:

```text
1. Quiet source anchor is 8 px beyond the rendered predecessor right edge.
2. Active outgoing port center equals the route start point.
3. A link spanning an intermediate overlapping task uses a collision-free detour.
4. Moving and resizing a task updates all affected path points immediately.
5. A short task on a wide timeline keeps the bar, port, browser path, and print path anchored to the same rendered edge.
6. At 1024 px and 1600 px, overlay width equals chart width.
7. Console has no errors or warnings.
8. Print paths reuse the same obstacle route and contain no ports.
```

- [ ] **Step 7: Commit documentation/integration**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/roadmapDependencyVisuals.test.js docs/TEST_DEV_ROADMAPS.md
git commit -m "fix: keep printed roadmap links clear of tasks"
```

---

### Task 4: Final independent review

**Files:**
- Review all changes after base `708801e`.

**Interfaces:**
- Consumes committed Tasks 1-3 and their verification reports.
- Produces a merge-readiness verdict with no open Critical or Important findings.

- [ ] **Step 1: Review spec compliance and route safety**

Review source-anchor clearance, obstacle collision checks on every segment, deterministic shortest-route selection, short-bar parity, live previews, active ports, print reuse, chart boundaries, tests, and selective-transfer documentation.

- [ ] **Step 2: Fix all Critical/Important findings in one RED→GREEN wave**

Add a failing regression for each behavioral finding before changing production code. Run the covering focused suite and record exact results before re-review.

- [ ] **Step 3: Run final verification**

```bash
cd frontend
node --test $(find src -name '*.test.js' -print | sort)
npm run lint
npm run verify:xlsx
npm run build
cd ..
git diff --check 708801e...HEAD
```

Expected: all commands exit zero except the accepted informational Vite chunk-size warning; `git diff --check` prints no output.
