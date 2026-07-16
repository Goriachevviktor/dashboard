import test from 'node:test';
import assert from 'node:assert/strict';

import { replaceTaskById } from './dashboardTasks.js';

test('replaces the matching task immutably and preserves unrelated task references', () => {
  const first = { id: 1, title: 'First' };
  const second = { id: 2, title: 'Second' };
  const saved = { id: '1', title: 'Saved' };
  const tasks = [first, second];

  const result = replaceTaskById(tasks, saved);

  assert.notEqual(result, tasks);
  assert.equal(result[0], saved);
  assert.equal(result[1], second);
  assert.deepEqual(tasks, [first, second]);
});
