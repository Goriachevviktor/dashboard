import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canStartRoadmapPointerDrag,
  ROADMAP_DRAG_THRESHOLD_PX,
  resolveRoadmapAutoScrollDelta,
  resolveRoadmapDragIntent,
  resolveRoadmapDropTarget,
} from './roadmapDragIntent.js';

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

test('scales and bounds auto-scroll at each edge', () => {
  const options = { start: 100, end: 500, edgeSize: 50, maxStep: 20 };
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 0, ...options }), -20);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 125, ...options }), -10);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 300, ...options }), 0);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 475, ...options }), 10);
  assert.equal(resolveRoadmapAutoScrollDelta({ pointer: 600, ...options }), 20);
});
