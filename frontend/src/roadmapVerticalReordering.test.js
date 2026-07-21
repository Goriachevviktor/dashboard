import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./sections/RoadmapsSection.jsx", import.meta.url), "utf8");
const reorderEffectStart = source.indexOf('const isRoadmapDragging');

function roadmapPointerUpSource() {
  const start = source.indexOf('function handlePointerUp', reorderEffectStart);
  return source.slice(start, source.indexOf('function handlePointerCancel', start));
}

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

test('pointer release synchronously applies its final coordinates before commit', () => {
  const pointerUpSource = roadmapPointerUpSource();
  assert.match(pointerUpSource, /updatePointer\(event\.clientX, event\.clientY\);[\s\S]*const current = dragSessionRef\.current/);
});

test('timeline drag owns one captured pointer and cancels on capture loss or blur', () => {
  assert.match(source, /pointerId: event\.pointerId/);
  assert.match(source, /event\.pointerId !== dragSessionRef\.current\?\.pointerId/);
  assert.match(source, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(source, /releasePointerCapture\?\./);
  assert.match(source, /lostpointercapture/);
  assert.match(source, /window\.addEventListener\("blur"/);
});

test('below-threshold task release opens edit for move and resize starts', () => {
  const pointerUpSource = roadmapPointerUpSource();
  assert.match(pointerUpSource, /if \(!current\.intent\)[\s\S]*if \(current\.kind === "bar"\)[\s\S]*onBarClick\?\./);
  assert.doesNotMatch(pointerUpSource, /current\.mode === "move"/);
});
