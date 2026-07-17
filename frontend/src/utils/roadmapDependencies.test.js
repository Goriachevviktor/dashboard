import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDependencySchedule,
  ensureRoadmapTaskIds,
  sanitizePredecessorIds,
  wouldCreateDependencyCycle,
} from "./roadmapDependencies.js";

test("ensureRoadmapTaskIds assigns stable ids to bars without ids", () => {
  const bars = ensureRoadmapTaskIds("rm-demo", [{ title: "A" }, { title: "B" }]);
  assert.equal(bars[0].id, "rm-demo-bar-0");
  assert.equal(bars[1].id, "rm-demo-bar-1");
});

test("sanitizePredecessorIds removes duplicates and self references", () => {
  assert.deepEqual(sanitizePredecessorIds(["a", "b", "a", "self"], "self"), ["a", "b"]);
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
