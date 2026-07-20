# Roadmap Dependency Source Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Join the outgoing dotted dependency line to the predecessor's rendered right edge while leaving the dependent-task attachment unchanged.

**Architecture:** Keep obstacle search anchored at the existing `startX = sourceRect.right + 8` coordinate. Add `sourceAttachX = sourceRect.right` to the route result and let the shared path serializer prepend one horizontal bridge from `sourceAttachX` to `startX`; browser and PDF inherit the same behavior automatically.

**Tech Stack:** React 19, SVG paths, JavaScript, Node test runner, Vite.

## Global Constraints

- Preserve the existing outgoing anchor 8 px to the right of the predecessor's actual rendered edge.
- Do not change the incoming target attachment or its final horizontal segment.
- Keep the active outgoing port centered at `startX`; add no permanent dot.
- Preserve obstacle routing, drag behavior, blocked-route suppression, colors, dash styles, opacity, and active-edge styling.
- Browser and PDF must consume the same shared serializer.

---

### Task 1: Add the source bridge to the shared route serializer

**Files:**
- Modify: `frontend/src/utils/roadmapDependencyVisuals.js`
- Test: `frontend/src/utils/roadmapDependencyVisuals.test.js`
- Test: `frontend/src/roadmapDependencyVisuals.test.js`

**Interfaces:**
- Consumes: `computeDependencyRoute({ sourceRect, targetRect, obstacleRects, chartWidth, clearance })` and `dependencyPathData(route)`.
- Produces: route property `sourceAttachX: number`; path prefix `M <sourceAttachX> <sourceY> H <startX>` followed by the existing orthogonal commands.

- [ ] **Step 1: Write the failing unit test**

Update the compact-route assertion so the route exposes the physical source edge and the serialized path includes the bridge:

```js
assert.equal(route.sourceAttachX, 180);
assert.equal(route.startX, 188);
assert.equal(
  dependencyPathData(route),
  "M 180 67 H 188 V 94 H 204 V 121 H 220",
);
```

Add assertions to the upper-target and obstacle-detour cases that their path starts at the source edge but ends at the same target coordinate as before. Update the executable print-runtime test to expect the same bridge from the serialized shared functions.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js src/roadmapDependencyVisuals.test.js
```

Expected: FAIL because `route.sourceAttachX` is absent and `dependencyPathData(route)` still starts at `startX`.

- [ ] **Step 3: Implement the minimal shared change**

In every successful and blocked return from `computeDependencyRoute`, add the same physical source attachment:

```js
const sourceAttachX = clampX(sourceRect.right);
// existing startX remains clampX(sourceRect.right + anchorGap)

return {
  points,
  compact,
  startX,
  endX,
  sourceAttachX,
  // preserve blocked where applicable
};
```

Change only the initial value used by `dependencyPathData`; keep its reduction over `points.slice(1)` unchanged:

```js
const sourceY = points[0].y;
const sourcePrefix = sourceAttachX === points[0].x
  ? `M ${sourceAttachX} ${sourceY}`
  : `M ${sourceAttachX} ${sourceY} H ${points[0].x}`;
```

Use `sourcePrefix` as the reducer's initial path. This preserves all existing vertical-first search points and the target-side commands.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd frontend
node --test src/utils/roadmapDependencyVisuals.test.js src/roadmapDependencyVisuals.test.js
```

Expected: all focused tests PASS, including the executable PDF runtime regression.

- [ ] **Step 5: Run the full verification**

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

Expected: 0 failed tests, ESLint clean, workbook validation passed, Vite build exit 0, and no whitespace errors.

- [ ] **Step 6: Perform browser smoke verification**

On the temporary smoke roadmap, verify from measured DOM/SVG coordinates:

```text
path first X == predecessor rendered right edge
path second X == predecessor rendered right edge + 8 px (subject to chart clamp)
active outgoing port center X == path second X
path final X == dependent task rendered left edge
path changes while the predecessor is dragged
```

Restore all temporary roadmap dates and dependencies after the smoke test. Confirm no browser console errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/roadmapDependencyVisuals.js \
  frontend/src/utils/roadmapDependencyVisuals.test.js \
  frontend/src/roadmapDependencyVisuals.test.js
git commit -m "fix: join roadmap dependency source lines"
```

- [ ] **Step 8: Request final code review**

Review the task against `docs/superpowers/specs/2026-07-20-roadmap-dependency-source-bridge-design.md`. Resolve every Critical or Important finding, rerun Step 5, and require a final READY verdict.
