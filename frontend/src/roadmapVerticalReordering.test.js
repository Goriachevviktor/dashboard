import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./sections/RoadmapsSection.jsx", import.meta.url), "utf8");

test('timeline locks task gesture to horizontal dates or vertical reorder', () => {
  assert.match(source, /resolveRoadmapDragIntent/);
  assert.match(source, /moveRoadmapBar/);
  assert.match(source, /moveRoadmapLane/);
  assert.match(source, /previewRoadmap/);
  assert.match(source, /onReorder\?\./);
});

test('timeline preview drives rows and dependency geometry together', () => {
  assert.match(source, /const displayedRoadmap = previewRoadmap \|\| rm/);
  assert.match(source, /displayedRoadmap\.lanes/);
  assert.match(source, /displayedRoadmap\.bars/);
  assert.match(source, /buildDependencyState\(displayedRoadmap\.bars\)/);
});

test('resize and link mode remain isolated from reorder', () => {
  assert.match(source, /forcedIntent: mode === "move" \? null : mode/);
  assert.match(source, /if \(linkMode \|\| reorderPending\) return/);
});

test('timeline reorder includes cancellation and bounded animation-frame auto-scroll', () => {
  assert.match(source, /resolveRoadmapAutoScrollDelta/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /pointercancel/);
});

test('timeline reorder uses stable IDs and lane headers as the lane drag handle', () => {
  assert.match(source, /sourceBarId/);
  assert.match(source, /sourceLaneId/);
  assert.match(source, /aria-label=.*Переместить дорожку/);
  assert.match(source, /aria-grabbed=/);
});
