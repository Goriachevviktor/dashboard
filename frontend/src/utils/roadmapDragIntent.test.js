import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canStartRoadmapPointerDrag,
  isRoadmapPointerInsideRect,
  ROADMAP_DRAG_THRESHOLD_PX,
  resolveRoadmapAutoScrollDelta,
  resolveRoadmapDragIntent,
  resolveRoadmapDropTarget,
  withoutRoadmapSourceGap,
} from './roadmapDragIntent.js';

test('accepts only pointer coordinates inside a valid drop rectangle', () => {
  const rect = { left: 10, right: 110, top: 20, bottom: 220 };
  assert.equal(isRoadmapPointerInsideRect({ clientX: 10, clientY: 20, rect }), true);
  assert.equal(isRoadmapPointerInsideRect({ clientX: 110, clientY: 220, rect }), true);
  assert.equal(isRoadmapPointerInsideRect({ clientX: 9, clientY: 100, rect }), false);
  assert.equal(isRoadmapPointerInsideRect({ clientX: 50, clientY: 221, rect }), false);
  assert.equal(isRoadmapPointerInsideRect({ clientX: 50, clientY: 100, rect: null }), false);
});

test('starts only one primary pointer and rejects non-left mouse buttons', () => {
  const primaryMouse = { isPrimary: true, pointerType: 'mouse', button: 0 };
  assert.equal(canStartRoadmapPointerDrag({ event: primaryMouse, activeSession: null }), true);
  assert.equal(canStartRoadmapPointerDrag({ event: primaryMouse, activeSession: { pointerId: 1 } }), false);
  assert.equal(canStartRoadmapPointerDrag({ event: { ...primaryMouse, isPrimary: false }, activeSession: null }), false);
  assert.equal(canStartRoadmapPointerDrag({ event: { ...primaryMouse, button: 2 }, activeSession: null }), false);
  assert.equal(canStartRoadmapPointerDrag({ event: { isPrimary: true, pointerType: 'touch', button: 0 }, activeSession: null }), true);
  assert.equal(canStartRoadmapPointerDrag({ event: { isPrimary: true, pointerType: 'pen', button: 2 }, activeSession: null }), true);
});

test('waits for six pixels and locks the dominant axis', () => {
  assert.equal(ROADMAP_DRAG_THRESHOLD_PX, 6);
  assert.equal(resolveRoadmapDragIntent({ deltaX: 5, deltaY: 0 }), null);
  assert.equal(resolveRoadmapDragIntent({ deltaX: 6, deltaY: 2 }), 'horizontal');
  assert.equal(resolveRoadmapDragIntent({ deltaX: 2, deltaY: 7 }), 'vertical');
  assert.equal(resolveRoadmapDragIntent({ deltaX: 50, deltaY: 1, lockedIntent: 'vertical' }), 'vertical');
});

test('prefers horizontal intent for equal deltas', () => {
  assert.equal(resolveRoadmapDragIntent({ deltaX: 6, deltaY: 6 }), 'horizontal');
});

test('forced resize intent cannot become reorder', () => {
  assert.equal(resolveRoadmapDragIntent({ deltaX: 0, deltaY: 80, forcedIntent: 'resize-start' }), 'resize-start');
});

test('resolves insertion before and after item midpoint', () => {
  const items = [{ id: 'a', start: 10, end: 30 }, { id: 'b', start: 40, end: 60 }];
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 45, items, sourceId: 'a' }), { targetId: 'b', position: 'before' });
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 58, items, sourceId: 'a' }), { targetId: 'b', position: 'after' });
});

test('excludes the source and handles an empty drop container', () => {
  const items = [{ id: 'a', start: 10, end: 30 }, { id: 'b', start: 40, end: 60 }];
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 15, items, sourceId: 'a' }), { targetId: 'b', position: 'before' });
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 10, items: [], sourceId: 'a' }), { targetId: null, position: 'before' });
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 10, items: [{ id: 'a', start: 10, end: 30 }], sourceId: 'a' }), { targetId: null, position: 'before' });
});

test('removes the source gap before resolving downward timeline drops', () => {
  const items = [
    { id: 'a', start: 0, end: 80 },
    { id: 'b', start: 80, end: 160 },
    { id: 'c', start: 160, end: 240 },
  ];
  const compacted = withoutRoadmapSourceGap(items, 'a');
  assert.deepEqual(compacted, [
    { id: 'b', start: 0, end: 80 },
    { id: 'c', start: 80, end: 160 },
  ]);
  assert.deepEqual(resolveRoadmapDropTarget({ coordinate: 60, items: compacted, sourceId: 'a' }), { targetId: 'c', position: 'before' });
});

test('scales and bounds auto-scroll at each edge', () => {
  const options = { start: 100, end: 500, edgeSize: 50, maxStep: 20 };
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 0, ...options }), -20);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 125, ...options }), -10);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 300, ...options }), 0);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 475, ...options }), 10);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 600, ...options }), 20);
});
