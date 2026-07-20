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
} from "./roadmapDependencyVisuals.js";

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
