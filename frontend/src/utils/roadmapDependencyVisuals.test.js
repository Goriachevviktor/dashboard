import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_DEPENDENCY_STYLE,
  computeDependencyRoute,
  dependencyPathData,
  dependencyPresentation,
  QUIET_DEPENDENCY_STYLE,
  resolveActiveDependencyVisualState,
  resolveDependencyAnchorPercents,
  resolveDependencyEdgePercents,
  resolveRenderedBarRect,
} from "./roadmapDependencyVisuals.js";

function routeIntersectsRects(points, rects, {
  allowStartOutsideSource = false,
  allowEndOnTargetLeft = false,
} = {}) {
  return points.slice(1).some((point, index) => {
    const previous = points[index];
    const lastSegment = index === points.length - 2;

    return rects.some((rect, rectIndex) => {
      if (
        allowStartOutsideSource
        && index === 0
        && rectIndex === 0
        && previous.x >= rect.right
      ) return false;
      if (
        allowEndOnTargetLeft
        && lastSegment
        && rectIndex === rects.length - 1
        && point.x === rect.left
      ) return false;

      if (point.y === previous.y) {
        const minX = Math.min(previous.x, point.x);
        const maxX = Math.max(previous.x, point.x);
        return point.y > rect.top
          && point.y < rect.bottom
          && maxX > rect.left
          && minX < rect.right;
      }

      assert.equal(point.x, previous.x, "dependency routes must remain orthogonal");
      const minY = Math.min(previous.y, point.y);
      const maxY = Math.max(previous.y, point.y);
      return point.x > rect.left
        && point.x < rect.right
        && maxY > rect.top
        && minY < rect.bottom;
    });
  });
}

test("resolveActiveDependencyVisualState normalizes a numeric active id and mixed neighbor ids", () => {
  const state = resolveActiveDependencyVisualState({
    activeTaskId: 42,
    predecessorsById: new Map([["42", [7, "8"]]]),
    successorsById: new Map([["42", [9, "10"]]]),
  });

  assert.deepEqual([...state.activeEdgeIds], ["7:42", "8:42", "42:9", "42:10"]);
  assert.deepEqual([...state.incomingPortTaskIds], ["42", "9", "10"]);
  assert.deepEqual([...state.outgoingPortTaskIds], ["7", "8", "42"]);
});

test("resolveDependencyAnchorPercents falls back to persisted percentages", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 12.5, endPct: 37.5, taskIndex: 2 }), {
    startPct: 12.5,
    endPct: 37.5,
  });
});

test("resolveDependencyAnchorPercents ignores another task preview", () => {
  const barDrag = { idx: 3, previewLeft: 40, previewWidth: 15, mode: "move" };
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 10, endPct: 30, taskIndex: 2, barDrag }), {
    startPct: 10,
    endPct: 30,
  });
});

test("resolveDependencyAnchorPercents uses move preview percentages", () => {
  const barDrag = { idx: 2, previewLeft: 42.25, previewWidth: 18.5, mode: "move" };
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 10, endPct: 30, taskIndex: 2, barDrag }), {
    startPct: 42.25,
    endPct: 60.75,
  });
});

test("resolveDependencyAnchorPercents uses resize-start preview percentages", () => {
  const barDrag = { idx: 2, previewLeft: 14.75, previewWidth: 25.25, mode: "resize-start" };
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 20, endPct: 40, taskIndex: 2, barDrag }), {
    startPct: 14.75,
    endPct: 40,
  });
});

test("resolveDependencyAnchorPercents uses resize-end preview percentages", () => {
  const barDrag = { idx: 2, previewLeft: 20, previewWidth: 31.125, mode: "resize-end" };
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 20, endPct: 40, taskIndex: 2, barDrag }), {
    startPct: 20,
    endPct: 51.125,
  });
});

test("resolveDependencyEdgePercents isolates a source-active preview", () => {
  const predecessor = { startPct: 10, endPct: 30, taskIndex: 0 };
  const target = { startPct: 55, endPct: 70, taskIndex: 1 };
  const barDrag = { idx: 0, previewLeft: 25, previewWidth: 20, mode: "move" };
  assert.deepEqual(resolveDependencyEdgePercents({ predecessor, target, barDrag }), {
    predecessorEndPct: 45,
    targetStartPct: 55,
  });
});

test("resolveDependencyEdgePercents isolates a target-active preview", () => {
  const predecessor = { startPct: 10, endPct: 30, taskIndex: 0 };
  const target = { startPct: 55, endPct: 70, taskIndex: 1 };
  const barDrag = { idx: 1, previewLeft: 48.5, previewWidth: 15, mode: "resize-start" };
  assert.deepEqual(resolveDependencyEdgePercents({ predecessor, target, barDrag }), {
    predecessorEndPct: 30,
    targetStartPct: 48.5,
  });
});

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

test("computeDependencyRoute uses a compact route toward a lower target", () => {
  const sourceRect = { left: 40, right: 180, top: 52, bottom: 82, centerY: 67 };
  const targetRect = { left: 220, right: 360, top: 106, bottom: 136, centerY: 121 };
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
});

test("computeDependencyRoute starts upward toward an upper target", () => {
  const sourceRect = { left: 40, right: 180, top: 106, bottom: 136, centerY: 121 };
  const targetRect = { left: 220, right: 360, top: 52, bottom: 82, centerY: 67 };
  const route = computeDependencyRoute({ sourceRect, targetRect, obstacleRects: [], chartWidth: 720 });

  assert.equal(route.compact, true);
  assert.equal(route.points[1].y < route.points[0].y, true);
  assert.equal(dependencyPathData(route), "M 188 121 V 94 H 204 V 67 H 220");
});

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

test("dependencyPresentation returns the exact quiet style for unrelated endpoints", () => {
  assert.deepEqual(QUIET_DEPENDENCY_STYLE, { strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
  const presentation = dependencyPresentation({
    edgeId: "source:target",
    activeEdgeIds: new Set(["other:edge"]),
  });
  assert.deepEqual(presentation, { active: false, strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
  assert.equal(Object.hasOwn(presentation, "color"), false);
});

test("active dependency state isolates direct edges and directional ports", () => {
  const state = resolveActiveDependencyVisualState({
    activeTaskId: "B",
    predecessorsById: new Map([["B", ["A"]], ["A", ["X"]]]),
    successorsById: new Map([["B", ["C"]], ["C", ["D"]]]),
  });

  assert.deepEqual([...state.activeEdgeIds], ["A:B", "B:C"]);
  assert.deepEqual([...state.incomingPortTaskIds], ["B", "C"]);
  assert.deepEqual([...state.outgoingPortTaskIds], ["A", "B"]);
  assert.equal(dependencyPresentation({ edgeId: "X:A", activeEdgeIds: state.activeEdgeIds }).active, false);
  assert.equal(dependencyPresentation({ edgeId: "C:D", activeEdgeIds: state.activeEdgeIds }).active, false);
});

test("dependencyPresentation returns the exact active style for an active edge", () => {
  assert.deepEqual(ACTIVE_DEPENDENCY_STYLE, { strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });
  const presentation = dependencyPresentation({
    edgeId: "source:target",
    activeEdgeIds: new Set(["source:target"]),
  });
  assert.deepEqual(presentation, { active: true, strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });
  assert.equal(Object.hasOwn(presentation, "color"), false);
});

test("dependencyPresentation stays quiet when only an endpoint belongs to another active edge", () => {
  assert.deepEqual(dependencyPresentation({
    edgeId: "target:next",
    activeEdgeIds: new Set(["source:target"]),
  }), { active: false, strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
});
