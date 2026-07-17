import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureRoadmapTaskIds,
  sanitizePredecessorIds,
  wouldCreateDependencyCycle,
  applyDependencySchedule,
  computeDependencyLineLayout,
  dependencyPathData,
  DEPENDENCY_SVG_OVERFLOW,
  resolveRenderedTimelineWidth,
  buildDependencyDebugEdges,
  resolveDependencyAnchorPercents,
  resolveDependencyEdgePercents,
} from "./roadmapDependencies.js";

test("dependency edge preview changes only the active endpoint", () => {
  const targetActive = resolveDependencyEdgePercents({
    predecessor: { startPct: 10, endPct: 20, taskIndex: 1 },
    target: { startPct: 40, endPct: 55, taskIndex: 2 },
    barDrag: { idx: 2, previewLeft: 48, previewWidth: 12 },
  });
  assert.deepEqual(targetActive, { predecessorEndPct: 20, targetStartPct: 48 });

  const predecessorActive = resolveDependencyEdgePercents({
    predecessor: { startPct: 10, endPct: 20, taskIndex: 1 },
    target: { startPct: 40, endPct: 55, taskIndex: 2 },
    barDrag: { idx: 1, previewLeft: 12, previewWidth: 14 },
  });
  assert.deepEqual(predecessorActive, { predecessorEndPct: 26, targetStartPct: 40 });
});

test("resize-start moves the incoming edge while preserving the persisted outgoing edge", () => {
  const persistedTarget = { startPct: 40, endPct: 55, taskIndex: 2 };
  const resizeStartPreview = { idx: 2, previewLeft: 46, previewWidth: 9 };

  assert.deepEqual(resolveDependencyAnchorPercents({
    ...persistedTarget,
    barDrag: resizeStartPreview,
  }), { startPct: 46, endPct: 55 });
  assert.deepEqual(resolveDependencyEdgePercents({
    predecessor: { startPct: 10, endPct: 20, taskIndex: 1 },
    target: persistedTarget,
    barDrag: resizeStartPreview,
  }), { predecessorEndPct: 20, targetStartPct: 46 });
  assert.deepEqual(resolveDependencyEdgePercents({
    predecessor: persistedTarget,
    target: { startPct: 70, endPct: 80, taskIndex: 3 },
    barDrag: resizeStartPreview,
  }), { predecessorEndPct: 55, targetStartPct: 70 });
});

test("resize-end moves the outgoing edge while preserving the persisted incoming edge", () => {
  const persistedPredecessor = { startPct: 10, endPct: 20, taskIndex: 1 };
  const resizeEndPreview = { idx: 1, previewLeft: 10, previewWidth: 16 };

  assert.deepEqual(resolveDependencyAnchorPercents({
    ...persistedPredecessor,
    barDrag: resizeEndPreview,
  }), { startPct: 10, endPct: 26 });
  assert.deepEqual(resolveDependencyEdgePercents({
    predecessor: persistedPredecessor,
    target: { startPct: 40, endPct: 55, taskIndex: 2 },
    barDrag: resizeEndPreview,
  }), { predecessorEndPct: 26, targetStartPct: 40 });
  assert.deepEqual(resolveDependencyEdgePercents({
    predecessor: { startPct: 0, endPct: 5, taskIndex: 0 },
    target: persistedPredecessor,
    barDrag: resizeEndPreview,
  }), { predecessorEndPct: 5, targetStartPct: 10 });
});

test("dependency anchors fall back to persisted percentages", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({ startPct: 20, endPct: 35, taskIndex: 2, barDrag: null }), {
    startPct: 20,
    endPct: 35,
  });
});

test("dependency anchors use both ends of the active move preview", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({
    startPct: 20,
    endPct: 35,
    taskIndex: 2,
    barDrag: { idx: 2, previewLeft: 42, previewWidth: 18 },
  }), { startPct: 42, endPct: 60 });
});

test("dependency anchors ignore another task preview", () => {
  assert.deepEqual(resolveDependencyAnchorPercents({
    startPct: 20,
    endPct: 35,
    taskIndex: 2,
    barDrag: { idx: 3, previewLeft: 42, previewWidth: 18 },
  }), { startPct: 20, endPct: 35 });
});

test("ensureRoadmapTaskIds assigns stable ids to bars without ids", () => {
  const bars = ensureRoadmapTaskIds("rm-demo", [{ title: "A" }, { title: "B" }]);
  assert.equal(bars[0].id, "rm-demo-bar-0");
  assert.equal(bars[1].id, "rm-demo-bar-1");
});

test("sanitizePredecessorIds removes duplicates and self references", () => {
  assert.deepEqual(
    sanitizePredecessorIds(["a", "b", "a", "self"], "self"),
    ["a", "b"],
  );
});

test("wouldCreateDependencyCycle detects transitive cycles", () => {
  const bars = [
    { id: "a", predecessors: [] },
    { id: "b", predecessors: ["a"] },
    { id: "c", predecessors: ["b"] },
  ];
  assert.equal(wouldCreateDependencyCycle(bars, "c", "a"), true);
  assert.equal(wouldCreateDependencyCycle(bars, "a", "c"), false);
});

test("applyDependencySchedule shifts dependent chain right and preserves duration", () => {
  const bars = applyDependencySchedule([
    { id: "a", startDate: "2026-07-01", endDate: "2026-07-10", predecessors: [] },
    { id: "b", startDate: "2026-07-05", endDate: "2026-07-08", predecessors: ["a"] },
    { id: "c", startDate: "2026-07-06", endDate: "2026-07-09", predecessors: ["b"] },
  ]);
  assert.equal(bars[1].startDate, "2026-07-11");
  assert.equal(bars[1].endDate, "2026-07-14");
  assert.equal(bars[2].startDate, "2026-07-15");
  assert.equal(bars[2].endDate, "2026-07-18");
});

test("applyDependencySchedule respects the latest predecessor finish", () => {
  const bars = applyDependencySchedule([
    { id: "a", startDate: "2026-07-01", endDate: "2026-07-08", predecessors: [] },
    { id: "b", startDate: "2026-07-02", endDate: "2026-07-12", predecessors: [] },
    { id: "c", startDate: "2026-07-03", endDate: "2026-07-05", predecessors: ["a", "b"] },
  ]);
  assert.equal(bars[2].startDate, "2026-07-13");
  assert.equal(bars[2].endDate, "2026-07-15");
});

test("applyDependencySchedule keeps bars unchanged when no predecessor pushes dates", () => {
  const bars = applyDependencySchedule([
    { id: "a", startDate: "2026-07-01", endDate: "2026-07-02", predecessors: [] },
    { id: "b", startDate: "2026-07-03", endDate: "2026-07-04", predecessors: ["a"] },
  ]);
  assert.equal(bars[1].startDate, "2026-07-03");
  assert.equal(bars[1].endDate, "2026-07-04");
});

test("computeDependencyLineLayout ends on target bullet anchor", () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 20,
    targetStartPct: 50,
    chartWidth: 1000,
    predecessorCenterY: 37,
    targetCenterY: 107,
  });
  assert.equal(line.startX, 196);
  assert.equal(line.endX, 500);
  assert.equal(line.startY, 37);
  assert.equal(line.endY, 107);
});

test("computeDependencyLineLayout uses explicit centers for unequal rows", () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 25,
    targetStartPct: 60,
    chartWidth: 1000,
    predecessorCenterY: 83,
    targetCenterY: 177,
    predecessorAnchorOffsetX: 0,
    targetAnchorOffsetX: 0,
  });
  assert.equal(line.startY, 83);
  assert.equal(line.endY, 177);
  assert.equal(line.startX, 250);
  assert.equal(line.endX, 600);
});

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

test("dependencyPathData keeps both horizontal connector shoulders", () => {
  assert.equal(
    dependencyPathData({ startX: 496, startY: 27, middleX: 516, endY: 81, endX: 500 }),
    "M 496 27 H 516 V 81 H 500",
  );
});

test("resolveRenderedTimelineWidth uses a measured grid wider than the minimum", () => {
  assert.equal(resolveRenderedTimelineWidth(1280, 900), 1280);
});

test("reverse dependency routes left with a shoulder beyond both anchors", () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 80,
    targetStartPct: 20,
    chartWidth: 1000,
    predecessorCenterY: 27,
    targetCenterY: 81,
    predecessorAnchorOffsetX: -4,
    targetAnchorOffsetX: 0,
    minimumShoulder: 16,
  });
  assert.equal(line.startX, 796);
  assert.equal(line.endX, 200);
  assert.equal(line.middleX, 184);
  assert.ok(line.startX - line.middleX >= 16);
  assert.ok(line.endX - line.middleX >= 16);
  assert.equal(dependencyPathData(line), "M 796 27 H 184 V 81 H 200");
});

test("boundary routes use an opposite in-chart elbow with full shoulders", () => {
  const forwardNearRight = computeDependencyLineLayout({
    predecessorEndPct: 80,
    targetStartPct: 100,
    chartWidth: 1000,
    predecessorCenterY: 27,
    targetCenterY: 81,
  });
  const reverseNearLeft = computeDependencyLineLayout({
    predecessorEndPct: 20,
    targetStartPct: 0,
    chartWidth: 1000,
    predecessorCenterY: 81,
    targetCenterY: 27,
  });
  assert.equal(forwardNearRight.middleX, 780);
  assert.ok(forwardNearRight.startX - forwardNearRight.middleX >= 16);
  assert.ok(forwardNearRight.endX - forwardNearRight.middleX >= 16);
  assert.equal(dependencyPathData(forwardNearRight), "M 796 27 H 780 V 81 H 1000");
  assert.equal(reverseNearLeft.middleX, 212);
  assert.ok(reverseNearLeft.middleX - reverseNearLeft.startX >= 16);
  assert.ok(reverseNearLeft.middleX - reverseNearLeft.endX >= 16);
  assert.equal(dependencyPathData(reverseNearLeft), "M 196 81 H 212 V 27 H 0");
  assert.equal(DEPENDENCY_SVG_OVERFLOW, "visible");
});

test("full-width anchors keep the deterministic preferred route when neither elbow fits", () => {
  const line = computeDependencyLineLayout({
    predecessorEndPct: 0,
    targetStartPct: 100,
    chartWidth: 1000,
    predecessorCenterY: 27,
    targetCenterY: 81,
  });
  assert.equal(line.startX, -4);
  assert.equal(line.endX, 1000);
  assert.equal(line.middleX, 1016);
  assert.equal(dependencyPathData(line), "M -4 27 H 1016 V 81 H 1000");
});


test("buildDependencyDebugEdges lists resolved source and target titles", () => {
  const edges = buildDependencyDebugEdges([
    { id: "a", title: "Source", predecessors: [] },
    { id: "b", title: "Target", predecessors: ["a"] },
    { id: "c", title: "Broken", predecessors: ["missing"] },
  ]);
  assert.deepEqual(edges, [
    { sourceId: "a", sourceTitle: "Source", targetId: "b", targetTitle: "Target" },
  ]);
});
