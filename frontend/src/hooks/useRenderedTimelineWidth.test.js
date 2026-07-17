import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRenderedTimelineWidthController,
  resolveRenderedTimelineWidth,
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

test('rendered width controller reconciles replacement nodes and cleanup', () => {
  const first = { getBoundingClientRect: () => ({ width: 800 }) };
  const replacement = { getBoundingClientRect: () => ({ width: 1200 }) };
  const calls = [];
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      calls.push(['construct']);
    }
    observe(node) { calls.push(['observe', node]); }
    unobserve(node) { calls.push(['unobserve', node]); }
    disconnect() { calls.push(['disconnect']); }
  }
  const windowTarget = {
    addEventListener: (...args) => calls.push(['addEventListener', ...args]),
    removeEventListener: (...args) => calls.push(['removeEventListener', ...args]),
  };
  const controller = createRenderedTimelineWidthController({
    minimumWidth: 720,
    onWidth: width => calls.push(['width', width]),
    ResizeObserverImpl: FakeResizeObserver,
    windowTarget,
  });

  controller.timelineRef(first);
  controller.timelineRef(replacement);
  controller.timelineRef(null);
  controller.cleanup();

  assert.deepEqual(calls, [
    ['construct'], ['observe', first], ['width', 800],
    ['unobserve', first], ['observe', replacement], ['width', 1200],
    ['unobserve', replacement],
    ['disconnect'],
  ]);
  assert.equal(controller.nodeRef.current, null);
});

test('rendered width controller uses window resize only without ResizeObserver', () => {
  const calls = [];
  const node = { getBoundingClientRect: () => ({ width: 900 }) };
  const windowTarget = {
    addEventListener: (name, callback) => calls.push(['add', name, callback]),
    removeEventListener: (name, callback) => calls.push(['remove', name, callback]),
  };
  const controller = createRenderedTimelineWidthController({
    minimumWidth: 720,
    onWidth: width => calls.push(['width', width]),
    ResizeObserverImpl: undefined,
    windowTarget,
  });

  controller.timelineRef(node);
  const resizeCallback = calls.find(call => call[0] === 'add')[2];
  resizeCallback();
  controller.cleanup();

  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ['add', 'resize'], ['width', 900], ['width', 900], ['remove', 'resize'],
  ]);
});
