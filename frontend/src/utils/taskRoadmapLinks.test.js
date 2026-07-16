import assert from 'node:assert/strict';
import test from 'node:test';
import * as taskRoadmapLinks from './taskRoadmapLinks.js';
import {
  availableTasksForLink, buildLinkedTaskPatch, buildRoadmapLinkIndex,
  normalizeTaskRoadmapLinks, resolveLinkedBar, roadmapStateToTaskColumn,
  snapshotLinkedTask, taskColumnToRoadmapState, unlinkTaskBar,
} from './taskRoadmapLinks.js';

test('maps task columns in both directions', () => {
  assert.deepEqual(taskColumnToRoadmapState('Беклог'), { status: 'todo', progress: 0 });
  assert.deepEqual(taskColumnToRoadmapState('В работе'), { status: 'active', progress: 50 });
  assert.deepEqual(taskColumnToRoadmapState('Готов'), { status: 'done', progress: 100 });
  assert.deepEqual(taskColumnToRoadmapState('Архив'), { status: 'done', progress: 100 });
  assert.equal(roadmapStateToTaskColumn('todo', 0), 'Беклог');
  assert.equal(roadmapStateToTaskColumn('active', 35), 'В работе');
  assert.equal(roadmapStateToTaskColumn('done', 100), 'Готов');
});

test('resolves task-owned values and preserves roadmap-owned values', () => {
  const bar = { id: 'bar-1', linkedTaskId: 7, laneId: 'lane-a', startDate: '2026-07-10', endDate: '2026-07-15', predecessors: ['bar-0'] };
  const task = { id: 7, title: 'Отчёт', due: '2026-07-20', column: 'В работе', ownerId: 2, assigneeId: 3 };
  assert.deepEqual(resolveLinkedBar(bar, task), {
    ...bar, title: 'Отчёт', endDate: '2026-07-20', ownerId: 3,
    status: 'active', progress: 50, linkedTaskSnapshot: snapshotLinkedTask(task),
  });
});

test('a newly linked bar resolves immediately from its task', () => {
  const task = { id: 8, title: 'План', due: '2026-08-02', column: 'Готов', assigneeId: 5 };
  const bar = resolveLinkedBar({ id: 'bar-8', linkedTaskId: task.id, laneId: 'lane-a', startDate: '2026-07-25', predecessors: [] }, task);
  assert.equal(bar.title, 'План');
  assert.equal(bar.endDate, '2026-08-02');
  assert.equal(bar.ownerId, 5);
  assert.equal(bar.status, 'done');
  assert.equal(bar.progress, 100);
});

test('normalization keeps first duplicate and converts later duplicate and missing links', () => {
  const tasks = [{ id: 7, title: 'A', due: '—', column: 'Беклог', ownerId: 2 }];
  const roadmaps = [
    { id: 'r1', title: 'One', bars: [{ id: 'a', linkedTaskId: 7, endDate: '2026-07-20' }] },
    { id: 'r2', title: 'Two', bars: [
      { id: 'b', linkedTaskId: 7, linkedTaskSnapshot: { title: 'Old A', column: 'Готов' } },
      { id: 'c', linkedTaskId: 99, linkedTaskSnapshot: { title: 'Deleted', due: '2026-08-01', column: 'В работе', ownerId: 4 } },
    ] },
  ];
  const normalized = normalizeTaskRoadmapLinks(roadmaps, tasks);
  assert.equal(normalized[0].bars[0].linkedTaskId, 7);
  assert.equal(normalized[0].bars[0].endDate, '2026-07-20');
  assert.equal(normalized[1].bars[0].linkedTaskId, undefined);
  assert.equal(normalized[1].bars[1].title, 'Deleted');
});

test('availability, unlink, patches, and index preserve one-task-one-roadmap', () => {
  const roadmaps = [{ id: 'r1', title: 'One', bars: [{ id: 'a', linkedTaskId: 7 }] }];
  const tasks = [{ id: 7 }, { id: 8 }];
  assert.deepEqual(availableTasksForLink(roadmaps, tasks).map(task => task.id), [8]);
  assert.equal(unlinkTaskBar({ id: 'a', linkedTaskId: 7, linkedTaskSnapshot: { title: 'A' } }).title, 'A');
  assert.deepEqual(buildLinkedTaskPatch(
    { endDate: '2026-07-20', status: 'todo', progress: 0 },
    { endDate: '2026-07-21', status: 'active', progress: 50 },
  ), { due: '2026-07-21', column: 'В работе' });
  assert.deepEqual(buildRoadmapLinkIndex(roadmaps)['7'], { roadmapId: 'r1', roadmapTitle: 'One', barId: 'a' });
});

test('linked roadmap writes patch the task before the roadmap and refresh the snapshot', async () => {
  assert.equal(typeof taskRoadmapLinks.persistLinkedBarChange, 'function');
  const calls = [];
  const task = { id: 7, title: 'A', due: '2026-07-20', column: 'Беклог', assigneeId: 3 };
  const roadmap = { id: 'r1', bars: [{ id: 'a', linkedTaskId: 7, ...taskRoadmapLinks.resolveLinkedBar({}, task) }] };
  const previousBar = roadmap.bars[0];
  const nextBar = { ...previousBar, startDate: '2026-07-11', endDate: '2026-07-22' };
  const api = {
    patchTask: async (id, patch) => {
      calls.push(['task', id, patch]);
      return { ...task, due: patch.due };
    },
    patchRoadmap: async (id, value) => {
      calls.push(['roadmap', id]);
      return value;
    },
  };

  const saved = await taskRoadmapLinks.persistLinkedBarChange({ api, roadmap, previousBar, nextBar });
  assert.deepEqual(calls, [['task', 7, { due: '2026-07-22' }], ['roadmap', 'r1']]);
  assert.equal(saved.bars[0].linkedTaskSnapshot.due, '2026-07-22');
  assert.equal(saved.bars[0].startDate, '2026-07-11');
});

test('linked roadmap writes stop before roadmap persistence when task patching fails', async () => {
  assert.equal(typeof taskRoadmapLinks.persistLinkedBarChange, 'function');
  let roadmapWrites = 0;
  const error = new Error('task failed');
  await assert.rejects(() => taskRoadmapLinks.persistLinkedBarChange({
    api: {
      patchTask: async () => { throw error; },
      patchRoadmap: async () => { roadmapWrites += 1; },
    },
    roadmap: { id: 'r1', bars: [{ id: 'a', linkedTaskId: 7, endDate: '2026-07-20' }] },
    previousBar: { id: 'a', linkedTaskId: 7, endDate: '2026-07-20', status: 'todo', progress: 0 },
    nextBar: { id: 'a', linkedTaskId: 7, endDate: '2026-07-22', status: 'todo', progress: 0 },
  }), error);
  assert.equal(roadmapWrites, 0);
});
