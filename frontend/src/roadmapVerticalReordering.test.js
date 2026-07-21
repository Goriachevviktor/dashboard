import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./sections/RoadmapsSection.jsx", import.meta.url), "utf8");
const reorderEffectStart = source.indexOf('const isRoadmapDragging');

function componentSource(name, nextMarker) {
  const start = source.indexOf(`function ${name}`);
  return source.slice(start, source.indexOf(nextMarker, start));
}

function roadmapPointerUpSource() {
  const start = source.indexOf('function handlePointerUp', reorderEffectStart);
  return source.slice(start, source.indexOf('function handlePointerCancel', start));
}

function roadmapListenerEffectSource() {
  const start = source.indexOf('const isRoadmapDragging');
  return source.slice(start, source.indexOf('function startMilestoneDrag', start));
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

test('global roadmap pointer listeners stay stable across parent identity churn', () => {
  const effectSource = roadmapListenerEffectSource();
  const dependencyList = effectSource.slice(effectSource.lastIndexOf('}, ['));
  assert.match(source, /latestRoadmapDragValuesRef/);
  assert.match(effectSource, /latestRoadmapDragValuesRef\.current/);
  assert.doesNotMatch(dependencyList, /onBarClick|onBarDrag|onReorder|\brm\b|\btimeline\b/);
});

test('listener cleanup invalidates the active session before releasing capture', () => {
  const effectSource = roadmapListenerEffectSource();
  const cleanupSource = effectSource.slice(effectSource.lastIndexOf('return () => {'));
  assert.match(cleanupSource, /const current = dragSessionRef\.current;[\s\S]*dragSessionRef\.current = null;[\s\S]*releaseRoadmapPointerCapture\(current\)/);
});

test('swimlanes reorder lane columns and cards through the shared reorder contract', () => {
  const swimSource = componentSource('SwimlanesView', '// ── Now / Next / Later');
  assert.match(swimSource, /function SwimlanesView\(\{ rm, members, onBarClick, onReorder, reorderPending = false \}\)/);
  assert.match(swimSource, /moveRoadmapLane/);
  assert.match(swimSource, /moveRoadmapBar/);
  assert.match(swimSource, /resolveRoadmapDropTarget/);
  assert.match(swimSource, /onReorder\?\./);
  assert.match(swimSource, /data-roadmap-lane-id=/);
  assert.match(swimSource, /data-roadmap-lane-drop-zone=/);
});

test('swimlanes use stable IDs for lane and card keys', () => {
  const swimSource = componentSource('SwimlanesView', '// ── Now / Next / Later');
  assert.match(swimSource, /key=\{lane\.id\}/);
  assert.match(swimSource, /key=\{b\.id\}/);
  assert.doesNotMatch(swimSource, /key=\{i\}/);
});

test('NNL uses shared planning groups and supports every bucket including empty drop zones', () => {
  const nnlSource = componentSource('NNLView', '// ── Детальный вид');
  assert.match(source, /moveRoadmapPlanningBar/);
  assert.match(source, /resolveRoadmapPlanningGroups/);
  assert.match(nnlSource, /function NNLView\(\{ rm, members, onBarClick, onReorder, reorderPending = false \}\)/);
  assert.match(nnlSource, /moveRoadmapPlanningBar/);
  assert.match(nnlSource, /onReorder\?\./);
  assert.match(nnlSource, /data-roadmap-planning-bucket=\{col\.key\}/);
  assert.match(nnlSource, /key=\{item\.id\}/);
  assert.doesNotMatch(nnlSource, /key=\{i\}/);
});

test('NNL commits only when the final visual bucket order changed', () => {
  const changedSource = source.slice(source.indexOf('function roadmapPlanningChanged'), source.indexOf('function closestRoadmapColumn'));
  const nnlSource = componentSource('NNLView', '// ── Детальный вид');
  assert.match(changedSource, /resolveRoadmapPlanningGroups/);
  assert.match(changedSource, /\["now", "next", "later"\]/);
  assert.match(nnlSource, /roadmapPlanningChanged\(latest\.rm, current\.previewRoadmap, planningToday\)/);
});

test('board drags retain pointer ownership, release coordinates, cancellation, and pending guards', () => {
  const swimSource = componentSource('SwimlanesView', '// ── Now / Next / Later');
  const nnlSource = componentSource('NNLView', '// ── Детальный вид');
  for (const boardSource of [swimSource, nnlSource]) {
    assert.match(boardSource, /pointerId: event\.pointerId/);
    assert.match(boardSource, /event\.pointerId !== dragSessionRef\.current\?\.pointerId/);
    assert.match(boardSource, /updatePointer\(event\.clientX, event\.clientY\);[\s\S]*const current = dragSessionRef\.current/);
    assert.match(boardSource, /lostpointercapture/);
    assert.match(boardSource, /window\.addEventListener\("blur"/);
    assert.match(boardSource, /if \(reorderPending\) return/);
  }
});

test('timeline print and CSV follow lane and stored bar order without an independent sort', () => {
  const printSource = source.slice(source.indexOf('function buildTimelinePrintHtml'), source.indexOf('function openRoadmapPrintView'));
  const csvSource = source.slice(source.indexOf('function buildRoadmapCsv'), source.indexOf('async function downloadRoadmapXls'));
  assert.match(printSource, /roadmap\.lanes\.forEach\([\s\S]*roadmap\.bars\.filter\(b => b\.lane === lane\.id\)/);
  assert.doesNotMatch(printSource, /\.sort\(/);
  assert.match(csvSource, /\(roadmap\.lanes \|\| \[\]\)\.forEach\([\s\S]*\(roadmap\.bars \|\| \[\]\)\.filter\(bar => bar\.lane === lane\.id\)[\s\S]*laneBars\.forEach/);
  assert.doesNotMatch(csvSource, /\.sort\(/);
});
