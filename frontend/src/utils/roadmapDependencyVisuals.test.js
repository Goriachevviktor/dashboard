import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_DEPENDENCY_STYLE,
  computeDependencyRoute,
  dependencyPathData,
  dependencyPresentation,
  QUIET_DEPENDENCY_STYLE,
  resolveDependencyAnchorPercents,
  resolveDependencyEdgePercents,
} from "./roadmapDependencyVisuals.js";

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

function assertMinimumShoulders(route, minimumShoulder = 16) {
  assert.ok(Math.abs(route.elbowX - route.startX) >= minimumShoulder);
  assert.ok(Math.abs(route.endX - route.elbowX) >= minimumShoulder);
}

test("computeDependencyRoute routes a forward dependency toward the target", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 30,
    targetStartPct: 60,
    chartWidth: 1000,
    predecessorCenterY: 24,
    targetCenterY: 72,
  });
  assert.deepEqual(route, { startX: 296, startY: 24, elbowX: 312, endY: 72, endX: 600 });
  assertMinimumShoulders(route);
  assert.equal(dependencyPathData(route), "M 296 24 H 312 V 72 H 600");
});

test("computeDependencyRoute routes a reverse dependency toward the target", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 80,
    targetStartPct: 20,
    chartWidth: 1000,
    predecessorCenterY: 24,
    targetCenterY: 72,
  });
  assert.deepEqual(route, { startX: 796, startY: 24, elbowX: 780, endY: 72, endX: 200 });
  assertMinimumShoulders(route);
});

test("computeDependencyRoute uses the opposite shoulder for same-X adjacent anchors", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 50,
    targetStartPct: 50,
    chartWidth: 1000,
    predecessorCenterY: 24,
    targetCenterY: 56,
  });
  assert.deepEqual(route, { startX: 496, startY: 24, elbowX: 480, endY: 56, endX: 500 });
  assertMinimumShoulders(route);
});

test("computeDependencyRoute preserves unequal row centers", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 10,
    targetStartPct: 40,
    chartWidth: 500,
    predecessorCenterY: 17.5,
    targetCenterY: 103.25,
  });
  assert.equal(route.startY, 17.5);
  assert.equal(route.endY, 103.25);
});

test("computeDependencyRoute keeps an in-chart preferred elbow near the left edge", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 0,
    targetStartPct: 4,
    chartWidth: 1000,
    predecessorCenterY: 20,
    targetCenterY: 60,
  });
  assert.equal(route.elbowX, 12);
  assertMinimumShoulders(route);
});

test("computeDependencyRoute switches to an in-chart opposite elbow near the right edge", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 100,
    targetStartPct: 100,
    chartWidth: 1000,
    predecessorCenterY: 20,
    targetCenterY: 60,
  });
  assert.equal(route.elbowX, 980);
  assertMinimumShoulders(route);
});

test("computeDependencyRoute keeps the preferred deterministic elbow when no candidate has full shoulders", () => {
  const route = computeDependencyRoute({
    predecessorEndPct: 0,
    targetStartPct: 100,
    chartWidth: 20,
    predecessorCenterY: 20,
    targetCenterY: 60,
  });
  assert.deepEqual(route, { startX: -4, startY: 20, elbowX: 12, endY: 60, endX: 20 });
});

test("dependencyPresentation returns the exact quiet style for unrelated endpoints", () => {
  assert.deepEqual(QUIET_DEPENDENCY_STYLE, { strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
  const presentation = dependencyPresentation({
    sourceId: "source",
    targetId: "target",
    activeTaskIds: new Set(["other"]),
  });
  assert.deepEqual(presentation, { active: false, strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
  assert.equal(Object.hasOwn(presentation, "color"), false);
});

test("dependencyPresentation returns the exact active style when the source is active", () => {
  assert.deepEqual(ACTIVE_DEPENDENCY_STYLE, { strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });
  const presentation = dependencyPresentation({
    sourceId: "source",
    targetId: "target",
    activeTaskIds: new Set(["source"]),
  });
  assert.deepEqual(presentation, { active: true, strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });
  assert.equal(Object.hasOwn(presentation, "color"), false);
});

test("dependencyPresentation is active when the target is active", () => {
  assert.deepEqual(dependencyPresentation({
    sourceId: "source",
    targetId: "target",
    activeTaskIds: new Set(["target"]),
  }), { active: true, strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });
});
