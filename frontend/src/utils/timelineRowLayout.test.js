import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TIMELINE_LANE_MIN_HEIGHT,
  TIMELINE_TASK_MIN_HEIGHT,
  buildFallbackTimelineLayout,
  normalizeMeasuredTimelineLayout,
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

test('layout equality compares ordered geometry and ignores new object identity', () => {
  const first = buildFallbackTimelineLayout(rows);
  const same = first.map(item => ({ ...item }));
  assert.equal(timelineLayoutsEqual(first, same), true);
  assert.equal(timelineLayoutsEqual(first, same.map((item, index) => index === 1 ? { ...item, height: 55 } : item)), false);
});
