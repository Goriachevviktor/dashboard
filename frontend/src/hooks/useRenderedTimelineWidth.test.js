import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveRenderedTimelineWidth,
  updateObservedTimelineGrid,
} from './useRenderedTimelineWidth.js';

test('rendered timeline width uses a wider measured grid', () => {
  assert.equal(resolveRenderedTimelineWidth(1280.5, 720), 1280.5);
});

test('rendered timeline width falls back for zero and invalid measurements', () => {
  assert.equal(resolveRenderedTimelineWidth(0, 720), 720);
  assert.equal(resolveRenderedTimelineWidth(Number.NaN, 720), 720);
  assert.equal(resolveRenderedTimelineWidth(-10, 720), 720);
});

test('rendered timeline width never falls below its minimum', () => {
  assert.equal(resolveRenderedTimelineWidth(640, 720), 720);
});

test('observed grid lifecycle unobserves replacements and schedules measurement', () => {
  const first = {};
  const replacement = {};
  const nodeRef = { current: null };
  const calls = [];
  const observer = {
    observe: node => calls.push(['observe', node]),
    unobserve: node => calls.push(['unobserve', node]),
  };
  const schedule = () => calls.push(['schedule']);

  updateObservedTimelineGrid({ nodeRef, observer, node: first, schedule });
  updateObservedTimelineGrid({ nodeRef, observer, node: replacement, schedule });
  updateObservedTimelineGrid({ nodeRef, observer, node: null, schedule });

  assert.deepEqual(calls, [
    ['observe', first], ['schedule'],
    ['unobserve', first], ['observe', replacement], ['schedule'],
    ['unobserve', replacement], ['schedule'],
  ]);
  assert.equal(nodeRef.current, null);
});
