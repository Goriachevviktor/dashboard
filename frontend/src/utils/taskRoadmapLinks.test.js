import assert from 'node:assert/strict';
import test from 'node:test';
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
