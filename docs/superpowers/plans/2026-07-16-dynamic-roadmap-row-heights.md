# Dynamic Roadmap Row Heights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep labels, Gantt bars, dependencies, milestones, grid backgrounds, and the Today line vertically aligned when roadmap task or lane names wrap.

**Architecture:** Render each logical timeline row as one two-cell CSS-grid row so the browser gives its sticky label and chart cell one shared natural height. Measure the resulting ordered rows through a focused `ResizeObserver` hook, normalize the measurements with pure utilities, and feed the actual row centers and total height to dependency and overlay geometry; use the same paired-row structure in print output.

**Tech Stack:** React 19, JavaScript ES modules, CSS Grid via inline styles, `ResizeObserver`, `requestAnimationFrame`, Node.js built-in test runner, ESLint, Vite.

## Global Constraints

- Task rows have a minimum height of exactly `54px`; lane rows have a minimum height of exactly `40px`.
- Task titles and lane names display in full with no line clamp or maximum row height.
- The sticky label column remains exactly `340px` wide.
- Gantt bars remain exactly `30px` high and vertically centered in their measured row.
- Roadmap payloads, API contracts, drag/resize date calculations, task linking, persistence, CSV, JSON, and XLSX exports do not change.
- Missing measurements fall back to the existing minimum row heights and never block interaction.
- Observer work is presentation-only, batched through one animation frame, equality-guarded, and cleaned up on unmount.
- Print/PDF uses paired dynamic rows and waits for its layout pass before printing.

---

## File Structure

- Create `frontend/src/utils/timelineRowLayout.js`: pure row keys, fallback layout, measured-layout normalization, equality, and row-center lookup.
- Create `frontend/src/utils/timelineRowLayout.test.js`: unit tests for unequal heights, fallbacks, stable equality, and centers.
- Create `frontend/src/hooks/useTimelineRowLayout.js`: row registration plus `ResizeObserver`/window-resize measurement lifecycle.
- Modify `frontend/src/utils/roadmapDependencies.js`: accept explicit source and target row centers while retaining horizontal geometry.
- Modify `frontend/src/utils/roadmapDependencies.test.js`: verify unequal-height dependency endpoints and existing standard geometry.
- Modify `frontend/src/sections/RoadmapsSection.jsx`: paired grid rows, measured overlays and dependencies, dynamic print layout, and smoke-test hooks.
- Modify `docs/TEST_DEV_ROADMAPS.md`: record the long-label visual regression procedure.

### Task 1: Pure dynamic-row geometry

**Files:**
- Create: `frontend/src/utils/timelineRowLayout.js`
- Create: `frontend/src/utils/timelineRowLayout.test.js`
- Modify: `frontend/src/utils/roadmapDependencies.js:91-116`
- Modify: `frontend/src/utils/roadmapDependencies.test.js:67-82`

**Interfaces:**
- Consumes: ordered rows shaped as `{ key, type, taskId? }`, measured rectangles shaped as `{ key, top, height }`.
- Produces: `TIMELINE_TASK_MIN_HEIGHT`, `TIMELINE_LANE_MIN_HEIGHT`, `timelineRowKey(row)`, `buildFallbackTimelineLayout(rows)`, `normalizeMeasuredTimelineLayout(rows, measurements)`, `timelineLayoutsEqual(a, b)`, `timelineRowCenter(layoutRow)`, and `computeDependencyLineLayout({ predecessorEndPct, targetStartPct, chartWidth, predecessorCenterY, targetCenterY })`.

- [ ] **Step 1: Write failing row-layout tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TIMELINE_LANE_MIN_HEIGHT,
  TIMELINE_TASK_MIN_HEIGHT,
  buildFallbackTimelineLayout,
  normalizeMeasuredTimelineLayout,
  timelineLayoutsEqual,
  timelineRowCenter,
} from './timelineRowLayout.js';

const rows = [
  { key: 'lane:structure', type: 'lane' },
  { key: 'task:one', type: 'bar', taskId: 'one' },
  { key: 'task:two', type: 'bar', taskId: 'two' },
];

test('fallback layout uses the existing minimum row heights', () => {
  const layout = buildFallbackTimelineLayout(rows);
  assert.equal(TIMELINE_LANE_MIN_HEIGHT, 40);
  assert.equal(TIMELINE_TASK_MIN_HEIGHT, 54);
  assert.deepEqual(layout.map(({ top, height }) => ({ top, height })), [
    { top: 0, height: 40 },
    { top: 40, height: 54 },
    { top: 94, height: 54 },
  ]);
});

test('measured layout keeps ordered unequal heights and fills missing measurements', () => {
  const layout = normalizeMeasuredTimelineLayout(rows, [
    { key: 'lane:structure', top: 0, height: 58 },
    { key: 'task:one', top: 58, height: 86 },
  ]);
  assert.deepEqual(layout.map(({ key, top, height }) => ({ key, top, height })), [
    { key: 'lane:structure', top: 0, height: 58 },
    { key: 'task:one', top: 58, height: 86 },
    { key: 'task:two', top: 144, height: 54 },
  ]);
  assert.equal(timelineRowCenter(layout[1]), 101);
});

test('layout equality compares ordered geometry and ignores new object identity', () => {
  const first = buildFallbackTimelineLayout(rows);
  const same = first.map(item => ({ ...item }));
  assert.equal(timelineLayoutsEqual(first, same), true);
  assert.equal(timelineLayoutsEqual(first, same.map((item, index) => index === 1 ? { ...item, height: 55 } : item)), false);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `cd frontend && node --test src/utils/timelineRowLayout.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `timelineRowLayout.js`.

- [ ] **Step 3: Implement the pure row-layout module**

```js
export const TIMELINE_TASK_MIN_HEIGHT = 54;
export const TIMELINE_LANE_MIN_HEIGHT = 40;

export function timelineRowKey(row) {
  return row.type === 'lane' ? `lane:${row.lane.id}` : `task:${row.b.id}`;
}

function minimumHeight(row) {
  return row.type === 'lane' ? TIMELINE_LANE_MIN_HEIGHT : TIMELINE_TASK_MIN_HEIGHT;
}

export function buildFallbackTimelineLayout(rows) {
  let top = 0;
  return rows.map(row => {
    const height = minimumHeight(row);
    const item = { ...row, key: row.key || timelineRowKey(row), top, height };
    top += height;
    return item;
  });
}

export function normalizeMeasuredTimelineLayout(rows, measurements = []) {
  const byKey = new Map(measurements.map(item => [item.key, item]));
  let top = 0;
  return rows.map(row => {
    const key = row.key || timelineRowKey(row);
    const measured = byKey.get(key);
    const height = Math.max(minimumHeight(row), Number(measured?.height) || 0);
    const item = { ...row, key, top, height };
    top += height;
    return item;
  });
}

export function timelineLayoutsEqual(left = [], right = []) {
  return left.length === right.length && left.every((item, index) => (
    item.key === right[index]?.key && item.top === right[index]?.top && item.height === right[index]?.height
  ));
}

export function timelineRowCenter(row) {
  return row.top + row.height / 2;
}
```

- [ ] **Step 4: Write the failing unequal-height dependency test**

```js
test('computeDependencyLineLayout uses explicit centers for unequal rows', () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 25,
    targetStartPct: 60,
    chartWidth: 1000,
    predecessorCenterY: 83,
    targetCenterY: 177,
  });
  assert.equal(line.startY, 83);
  assert.equal(line.endY, 177);
  assert.equal(line.startX, 250);
  assert.equal(line.endX, 600);
});
```

- [ ] **Step 5: Run the dependency test and verify RED**

Run: `cd frontend && node --test src/utils/roadmapDependencies.test.js`

Expected: FAIL because `computeDependencyLineLayout` still derives Y values from fixed `rowHeight` and row tops.

- [ ] **Step 6: Change dependency geometry to consume explicit centers**

Update the signature to:

```js
export function computeDependencyLineLayout({
  predecessorEndPct,
  targetStartPct,
  chartWidth,
  predecessorCenterY,
  targetCenterY,
}) {
  const startX = chartWidth * predecessorEndPct / 100;
  const endX = chartWidth * targetStartPct / 100;
  const direction = endX >= startX ? 1 : -1;
  const middleX = startX + direction * Math.min(24, Math.max(10, Math.abs(endX - startX) / 2));
  return { startX, startY: predecessorCenterY, middleX, endX, endY: targetCenterY };
}
```

Update the existing standard-height test to pass explicit centers and retain its current X/Y assertions.

- [ ] **Step 7: Run focused tests and commit**

Run: `cd frontend && node --test src/utils/timelineRowLayout.test.js src/utils/roadmapDependencies.test.js`

Expected: all tests PASS.

```bash
git add frontend/src/utils/timelineRowLayout.js frontend/src/utils/timelineRowLayout.test.js frontend/src/utils/roadmapDependencies.js frontend/src/utils/roadmapDependencies.test.js
git commit -m "fix: add dynamic timeline row geometry"
```

### Task 2: Measured paired-row timeline

**Files:**
- Create: `frontend/src/hooks/useTimelineRowLayout.js`
- Modify: `frontend/src/sections/RoadmapsSection.jsx:1979-2465`
- Test: `frontend/src/utils/timelineRowLayout.test.js`

**Interfaces:**
- Consumes: Task 1 layout exports and ordered rows with stable keys.
- Produces: `useTimelineRowLayout(rows)` returning `{ bodyRef, registerRow, layout, totalHeight }`, plus a paired CSS-grid timeline body.

- [ ] **Step 1: Add a failing measurement-normalization regression**

```js
test('measured top values are normalized into contiguous shared rows', () => {
  const layout = normalizeMeasuredTimelineLayout(rows, [
    { key: 'lane:structure', top: 12, height: 40.2 },
    { key: 'task:one', top: 52.2, height: 73.6 },
    { key: 'task:two', top: 125.8, height: 54.1 },
  ]);
  assert.deepEqual(layout.map(item => [item.top, item.height]), [[0, 40.2], [40.2, 73.6], [113.8, 54.1]]);
});
```

- [ ] **Step 2: Run and verify RED for decimal geometry if normalization rounds or trusts measured top**

Run: `cd frontend && node --test src/utils/timelineRowLayout.test.js`

Expected: FAIL until contiguous top accumulation preserves measured decimal heights; if Task 1 already satisfies it, record the immediate PASS as an already-established contract and do not weaken the assertion.

- [ ] **Step 3: Implement `useTimelineRowLayout`**

```js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFallbackTimelineLayout,
  normalizeMeasuredTimelineLayout,
  timelineLayoutsEqual,
} from '../utils/timelineRowLayout.js';

export function useTimelineRowLayout(rows) {
  const bodyRef = useRef(null);
  const nodesRef = useRef(new Map());
  const frameRef = useRef(0);
  const fallback = useMemo(() => buildFallbackTimelineLayout(rows), [rows]);
  const [layout, setLayout] = useState(fallback);

  const registerRow = useCallback(key => node => {
    if (node) nodesRef.current.set(key, node);
    else nodesRef.current.delete(key);
  }, []);

  useEffect(() => {
    const measure = () => {
      frameRef.current = 0;
      const bodyTop = bodyRef.current?.getBoundingClientRect().top || 0;
      const measurements = rows.map(row => {
        const node = nodesRef.current.get(row.key);
        const rect = node?.getBoundingClientRect();
        return { key: row.key, top: rect ? rect.top - bodyTop : 0, height: rect?.height || 0 };
      });
      const next = normalizeMeasuredTimelineLayout(rows, measurements);
      setLayout(current => timelineLayoutsEqual(current, next) ? current : next);
    };
    const schedule = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (bodyRef.current) observer?.observe(bodyRef.current);
    nodesRef.current.forEach(node => observer?.observe(node));
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [rows]);

  const totalHeight = layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].height : 120;
  return { bodyRef, registerRow, layout, totalHeight };
}
```

Use an isomorphic fallback: if `window.requestAnimationFrame` is unavailable, call `measure()` synchronously; if `ResizeObserver` is unavailable, retain the window-resize listener.

- [ ] **Step 4: Replace split label/chart row stacks with paired grid rows**

In `TimelineView`, build rows with stable `key` values inside `useMemo([rm.bars, rm.lanes, timeline])` so observer effects do not restart on presentation-only state updates, call `useTimelineRowLayout(rows)`, and render one body grid:

```jsx
<div
  ref={bodyRef}
  style={{
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: `${sideW}px minmax(${chartWidth}px, 1fr)`,
    minWidth: sideW + chartWidth,
  }}
>
  {rows.map(row => (
    <div key={row.key} ref={registerRow(row.key)} style={{ display: 'contents' }}>
      <TimelineLabelCell row={row} minHeight={row.type === 'lane' ? 40 : 54} />
      <TimelineChartCell row={row} minHeight={row.type === 'lane' ? 40 : 54}>
        {row.type === 'bar' ? <GanttBarContent ... /> : null}
      </TimelineChartCell>
    </div>
  ))}
</div>
```

Because `display: contents` cannot be measured reliably, attach `registerRow(row.key)` to the chart cell and let the shared grid track determine both cell heights. Keep the label cell `position: sticky; left: 0; z-index: 6`, `width: 340px`, and full wrapping. Change `GanttBar` into content that fills its chart cell (`height: 100%; minHeight: 54; position: relative`) and centers the existing `30px` absolute bar.

- [ ] **Step 5: Feed measured geometry to overlays and dependencies**

Build `rowByTaskId` from `layout`, calculate `dependencyLines` with `timelineRowCenter(predecessorRow)` and `timelineRowCenter(targetRow)`, and set dependency SVG, Today line, month lines, and milestone guides to `height: totalHeight`. Position the overlay only over the chart column with `left: sideW`, `width: calc(100% - 340px)`, and preserve current z-index/pointer-event behavior.

- [ ] **Step 6: Verify focused behavior and commit**

Run: `cd frontend && node --test src/utils/timelineRowLayout.test.js src/utils/roadmapDependencies.test.js`

Expected: all tests PASS.

Run: `cd frontend && npx eslint src/hooks/useTimelineRowLayout.js src/sections/RoadmapsSection.jsx src/utils/timelineRowLayout.js src/utils/timelineRowLayout.test.js src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js`

Expected: exit 0 with no errors or warnings.

Run: `cd frontend && npm run build`

Expected: Vite exits 0.

```bash
git add frontend/src/hooks/useTimelineRowLayout.js frontend/src/sections/RoadmapsSection.jsx frontend/src/utils/timelineRowLayout.test.js
git commit -m "fix: align roadmap rows with wrapped labels"
```

### Task 3: Dynamic print/PDF timeline and final regression

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx:3260-3485`
- Modify: `docs/TEST_DEV_ROADMAPS.md`
- Test: `frontend/src/utils/timelineRowLayout.test.js`

**Interfaces:**
- Consumes: Task 1 minimum-height constants and the paired-row DOM convention from Task 2.
- Produces: print HTML with `[data-timeline-row]` paired rows and a `window.__timelineReady` promise resolved after dependency layout.

- [ ] **Step 1: Add a print-layout contract test to the pure utility suite**

```js
test('row keys remain stable for print and browser layout', () => {
  assert.equal(timelineRowKey({ type: 'lane', lane: { id: 'people' } }), 'lane:people');
  assert.equal(timelineRowKey({ type: 'bar', b: { id: 'hire-lead' } }), 'task:hire-lead');
});
```

- [ ] **Step 2: Run the focused test and verify PASS/RED contract status**

Run: `cd frontend && node --test src/utils/timelineRowLayout.test.js`

Expected: PASS if Task 1 already covers stable keys; otherwise FAIL until `timelineRowKey` handles both row shapes exactly.

- [ ] **Step 3: Convert print timeline body to paired CSS-grid rows**

Generate markup shaped as:

```html
<div id="timeline-body" class="timeline-body">
  <div class="timeline-pair" data-timeline-row="lane:people">
    <div class="timeline-label lane-label">People</div>
    <div class="timeline-chart-row lane-chart"></div>
  </div>
  <div class="timeline-pair" data-timeline-row="task:hire-lead" data-task-id="hire-lead">
    <div class="timeline-label task-label">Hire lead</div>
    <div class="timeline-chart-row task-chart"><div class="gantt-bar">…</div></div>
  </div>
</div>
```

CSS must use `.timeline-pair { display:grid; grid-template-columns:340px ${chartW}px; align-items:stretch }`, task/lane minimum heights, full text wrapping, and a vertically centered `30px` bar.

- [ ] **Step 4: Measure print rows before printing**

Embed one deterministic script that waits for `document.fonts.ready` when available, reads each `[data-timeline-row]` rectangle relative to `#timeline-body`, resizes the dependency SVG and Today/milestone guides, and rewrites dependency path `d` attributes from actual task-row centers. Expose completion as:

```js
window.__timelineReady = (async () => {
  if (document.fonts?.ready) await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  layoutTimelineOverlays();
})();
```

In `openRoadmapPrintView`, await `frameWindow.__timelineReady` with a 1500ms timeout fallback before `frameWindow.print()`. Always call the existing iframe cleanup in `finally`.

- [ ] **Step 5: Document and run the visual smoke procedure**

Add to `docs/TEST_DEV_ROADMAPS.md`:

- open `Первые 100 дней ЦАЗС` in dev;
- verify the long `Структура` task labels align with their bars;
- resize to narrow and wide desktop widths;
- verify unequal-height dependency endpoints;
- drag and resize one bar, then cancel/revert test data;
- open PDF print preview and verify label/bar alignment;
- confirm no browser console errors.

- [ ] **Step 6: Run complete automated gates**

Run: `cd frontend && node --test $(find src -name '*.test.js' -print | sort)`

Expected: all tests PASS with zero failures.

Run: `cd frontend && npm run lint`

Expected: exit 0 with zero errors and warnings.

Run: `cd frontend && npm run verify:xlsx`

Expected: `Workbook validation passed` for `Timeline`, `Дорожки`, and `Now-Next-Later`.

Run: `cd frontend && npm run build`

Expected: production build exits 0; the pre-existing large-chunk advisory may remain non-fatal.

- [ ] **Step 7: Run browser smoke and commit**

Use the in-app browser against `http://localhost:8080`, execute the documented scenarios, and inspect console errors. Temporary edits to the copied roadmap must be reverted before completion.

```bash
git add frontend/src/sections/RoadmapsSection.jsx docs/TEST_DEV_ROADMAPS.md frontend/src/utils/timelineRowLayout.test.js
git commit -m "fix: align dynamic roadmap rows in print"
```
