import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TIMELINE_LANE_MIN_HEIGHT,
  TIMELINE_TASK_MIN_HEIGHT,
  buildFallbackTimelineLayout,
  clearTimelineFrame,
  normalizeMeasuredTimelineLayout,
  pruneTimelineRowCallbacks,
  reconcileTimelineLayoutRows,
  updateObservedTimelineNode,
  timelineLayoutsEqual,
  timelineRowCenter,
} from './timelineRowLayout.js';

const rows = [
  { key: 'lane:structure', type: 'lane' },
  { key: 'task:one', type: 'bar', taskId: 'one' },
  { key: 'task:two', type: 'bar', taskId: 'two' },
];

test('fallback layout uses the existing minimum row heights', () => {
  const layout = buildFallbackTimelineLayout(rows);
  assert.equal(TIMELINE_LANE_MIN_HEIGHT, 40);
  assert.equal(TIMELINE_TASK_MIN_HEIGHT, 54);
  assert.deepEqual(layout.map(({ top, height }) => ({ top, height })), [
    { top: 0, height: 40 },
    { top: 40, height: 54 },
    { top: 94, height: 54 },
  ]);
});

test('row reconciliation replaces stale large geometry when keys shrink or reorder', () => {
  const stale = {
    signature: 'lane:structure\u0000task:one\u0000task:two',
    layout: [
      { ...rows[0], top: 0, height: 80 },
      { ...rows[1], top: 80, height: 120 },
      { ...rows[2], top: 200, height: 140 },
    ],
  };
  const nextRows = [rows[0], rows[2]];
  assert.deepEqual(reconcileTimelineLayoutRows(nextRows, stale), {
    signature: 'lane:structure\u0000task:two',
    layout: [
      { ...rows[0], top: 0, height: 40 },
      { ...rows[2], top: 40, height: 54 },
    ],
  });
});

test('observed row node lifecycle unobserves replacements and schedules measurement', () => {
  const first = {};
  const replacement = {};
  const nodes = new Map();
  const calls = [];
  const observer = {
    observe: node => calls.push(['observe', node]),
    unobserve: node => calls.push(['unobserve', node]),
  };
  const schedule = () => calls.push(['schedule']);

  updateObservedTimelineNode({ nodes, observer, key: 'task:one', node: first, schedule });
  updateObservedTimelineNode({ nodes, observer, key: 'task:one', node: replacement, schedule });
  updateObservedTimelineNode({ nodes, observer, key: 'task:one', node: null, schedule });

  assert.deepEqual(calls, [
    ['observe', first], ['schedule'],
    ['unobserve', first], ['observe', replacement], ['schedule'],
    ['unobserve', replacement], ['schedule'],
  ]);
  assert.equal(nodes.has('task:one'), false);
});

test('frame cleanup clears a pending token even without a cancel function', () => {
  const frameRef = { current: 27 };
  clearTimelineFrame(frameRef);
  assert.equal(frameRef.current, 0);

  const cancelled = [];
  frameRef.current = 42;
  clearTimelineFrame(frameRef, token => cancelled.push(token));
  assert.deepEqual(cancelled, [42]);
  assert.equal(frameRef.current, 0);
});

test('callback pruning removes stale keys without replacing live callbacks', () => {
  const laneCallback = () => {};
  const liveTaskCallback = () => {};
  const removedTaskCallback = () => {};
  const callbacks = new Map([
    ['lane:structure', laneCallback],
    ['task:one', liveTaskCallback],
    ['task:removed', removedTaskCallback],
  ]);

  pruneTimelineRowCallbacks(callbacks, [rows[0], rows[1]]);

  assert.deepEqual([...callbacks.keys()], ['lane:structure', 'task:one']);
  assert.equal(callbacks.get('lane:structure'), laneCallback);
  assert.equal(callbacks.get('task:one'), liveTaskCallback);
});

test('measured layout keeps ordered unequal heights and fills missing measurements', () => {
  const layout = normalizeMeasuredTimelineLayout(rows, [
    { key: 'lane:structure', top: 0, height: 58 },
    { key: 'task:one', top: 58, height: 86 },
  ]);
  assert.deepEqual(layout.map(({ key, top, height }) => ({ key, top, height })), [
    { key: 'lane:structure', top: 0, height: 58 },
    { key: 'task:one', top: 58, height: 86 },
    { key: 'task:two', top: 144, height: 54 },
  ]);
  assert.equal(timelineRowCenter(layout[1]), 101);
});

test('measured top values are normalized into contiguous shared rows', () => {
  const layout = normalizeMeasuredTimelineLayout(rows, [
    { key: 'lane:structure', top: 12, height: 40.2 },
    { key: 'task:one', top: 52.2, height: 73.6 },
    { key: 'task:two', top: 125.8, height: 54.1 },
  ]);
  assert.deepEqual(layout.map(item => [item.top, item.height]), [[0, 40.2], [40.2, 73.6], [113.8, 54.1]]);
});

test('layout equality compares ordered geometry and ignores new object identity', () => {
  const first = buildFallbackTimelineLayout(rows);
  const same = first.map(item => ({ ...item }));
  assert.equal(timelineLayoutsEqual(first, same), true);
  assert.equal(timelineLayoutsEqual(first, same.map((item, index) => index === 1 ? { ...item, height: 55 } : item)), false);
});
