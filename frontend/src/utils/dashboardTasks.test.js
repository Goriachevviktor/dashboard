import test from 'node:test';
import assert from 'node:assert/strict';

import * as dashboardTasks from './dashboardTasks.js';
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

test('applies immutable task cache upserts and removals', () => {
  assert.equal(typeof dashboardTasks.applyTaskCacheMutation, 'function');
  const original = [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }];
  const patched = dashboardTasks.applyTaskCacheMutation(original, { type: 'upsert', task: { id: 2, title: 'Updated' } });
  const created = dashboardTasks.applyTaskCacheMutation(patched, { type: 'upsert', task: { id: 3, title: 'Three' } });
  const removed = dashboardTasks.applyTaskCacheMutation(created, { type: 'remove', taskId: 1 });
  assert.deepEqual(original, [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }]);
  assert.deepEqual(removed, [{ id: 2, title: 'Updated' }, { id: 3, title: 'Three' }]);
});
