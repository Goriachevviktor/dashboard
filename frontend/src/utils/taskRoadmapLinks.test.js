import assert from 'node:assert/strict';
import test from 'node:test';
import * as taskRoadmapLinks from './taskRoadmapLinks.js';
import {
  availableTasksForLink, buildLinkedTaskPatch, buildRoadmapLinkIndex,
  loadRoadmapLinkIndex, normalizeTaskRoadmapLinks, resolveLinkedBar, roadmapStateToTaskColumn,
  snapshotLinkedTask, taskColumnToRoadmapState, unlinkTaskBar,
} from './taskRoadmapLinks.js';

test('maps task columns in both directions', () => {
  assert.deepEqual(taskColumnToRoadmapState('Беклог'), { status: 'planned', progress: 0 });
  assert.deepEqual(taskColumnToRoadmapState('В работе'), { status: 'progress', progress: 50 });
  assert.deepEqual(taskColumnToRoadmapState('Готов'), { status: 'done', progress: 100 });
  assert.deepEqual(taskColumnToRoadmapState('Архив'), { status: 'done', progress: 100 });
  assert.equal(roadmapStateToTaskColumn('planned', 0), 'Беклог');
  assert.equal(roadmapStateToTaskColumn('progress', 35), 'В работе');
  assert.equal(roadmapStateToTaskColumn('done', 100), 'Готов');
});

test('resolves task-owned values and preserves roadmap-owned values', () => {
  const bar = { id: 'bar-1', linkedTaskId: 7, lane: 'lane-a', startDate: '2026-07-10', endDate: '2026-07-15', predecessors: ['bar-0'] };
  const task = { id: 7, title: 'Отчёт', due: '2026-07-20', column: 'В работе', ownerId: 2, assigneeId: 3 };
  assert.deepEqual(resolveLinkedBar(bar, task), {
    ...bar, title: 'Отчёт', endDate: '2026-07-20', owner: 3,
    status: 'progress', progress: 50, linkedTaskSnapshot: snapshotLinkedTask(task),
  });
});

test('a newly linked bar resolves immediately from its task', () => {
  const task = { id: 8, title: 'План', due: '2026-08-02', column: 'Готов', assigneeId: 5 };
  const bar = resolveLinkedBar({ id: 'bar-8', linkedTaskId: task.id, lane: 'lane-a', startDate: '2026-07-25', predecessors: [] }, task);
  assert.equal(bar.title, 'План');
  assert.equal(bar.endDate, '2026-08-02');
  assert.equal(bar.owner, 5);
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

test('corrupt linked snapshots preserve existing roadmap bar values when unlinked', () => {
  const bar = { id: 'a', linkedTaskId: 7, title: 'Keep', endDate: '2026-08-01', owner: 4, status: 'progress', progress: 30 };
  for (const snapshot of [{}, { title: 9, due: {}, column: 'Unknown', assigneeId: {} }, { title: 'Valid', due: null, column: 7, ownerId: null }]) {
    const unlinked = unlinkTaskBar({ ...bar, linkedTaskSnapshot: snapshot });
    assert.equal(unlinked.title, typeof snapshot.title === 'string' ? snapshot.title : 'Keep');
    assert.equal(unlinked.endDate, '2026-08-01');
    assert.equal(unlinked.owner, 4);
    assert.equal(unlinked.status, 'progress');
    assert.equal(unlinked.progress, 30);
  }
});

test('valid partial linked snapshots overlay only their supported fields', () => {
  const bar = { id: 'a', linkedTaskId: 7, title: 'Keep', endDate: '2026-08-01', owner: 4, status: 'planned', progress: 0 };
  const unlinked = unlinkTaskBar({ ...bar, linkedTaskSnapshot: { due: '2026-08-12', column: 'Готов', assigneeId: 8 } });
  assert.equal(unlinked.title, 'Keep');
  assert.equal(unlinked.endDate, '2026-08-12');
  assert.equal(unlinked.owner, 8);
  assert.equal(unlinked.status, 'done');
  assert.equal(unlinked.progress, 100);
});

test('availability, unlink, patches, and index preserve one-task-one-roadmap', () => {
  const roadmaps = [{ id: 'r1', title: 'One', bars: [{ id: 'a', linkedTaskId: 7 }] }];
  const tasks = [{ id: 7 }, { id: 8 }];
  assert.deepEqual(availableTasksForLink(roadmaps, tasks).map(task => task.id), [8]);
  assert.equal(unlinkTaskBar({ id: 'a', linkedTaskId: 7, linkedTaskSnapshot: { title: 'A' } }).title, 'A');
  assert.deepEqual(buildLinkedTaskPatch(
    { endDate: '2026-07-20', status: 'planned', progress: 0 },
    { endDate: '2026-07-21', status: 'progress', progress: 50 },
  ), { due: '2026-07-21', column: 'В работе' });
  assert.deepEqual(buildRoadmapLinkIndex(roadmaps)['7'], { roadmapId: 'r1', roadmapTitle: 'One', barId: 'a' });
});

test('loads listed roadmaps and builds their task link index', async () => {
  let calls = 0;
  const index = await loadRoadmapLinkIndex({
    listRoadmaps: async () => {
      calls += 1;
      return [{ id: 'r1', title: 'Launch', bars: [{ id: 'bar-7', linkedTaskId: 7 }] }];
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(index, {
    '7': { roadmapId: 'r1', roadmapTitle: 'Launch', barId: 'bar-7' },
  });
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
    previousBar: { id: 'a', linkedTaskId: 7, endDate: '2026-07-20', status: 'planned', progress: 0 },
    nextBar: { id: 'a', linkedTaskId: 7, endDate: '2026-07-22', status: 'planned', progress: 0 },
  }), error);
  assert.equal(roadmapWrites, 0);
});

test('linked roadmap writes publish the saved task only after roadmap persistence succeeds', async () => {
  const published = [];
  const task = { id: 7, title: 'A', due: '2026-07-22', column: 'Беклог' };
  const previousBar = { id: 'a', linkedTaskId: 7, endDate: '2026-07-20', status: 'planned', progress: 0, linkedTaskSnapshot: { ...task, due: '2026-07-20' } };
  await taskRoadmapLinks.persistLinkedBarChange({
    api: {
      patchTask: async () => task,
      patchRoadmap: async (_id, roadmap) => roadmap,
    },
    roadmap: { id: 'r1', bars: [previousBar] },
    previousBar,
    nextBar: { ...previousBar, endDate: '2026-07-22' },
    onTaskUpdated: savedTask => published.push(savedTask),
  });
  assert.deepEqual(published, [task]);
});

test('linked roadmap writes do not publish for start-only changes or failed transactions', async () => {
  const published = [];
  const task = { id: 7, title: 'A', due: '2026-07-20', column: 'Беклог' };
  const previousBar = { id: 'a', linkedTaskId: 7, startDate: '2026-07-10', endDate: '2026-07-20', status: 'planned', progress: 0, linkedTaskSnapshot: task };
  await taskRoadmapLinks.persistLinkedBarChange({
    api: {
      patchTask: async () => { throw new Error('unexpected task patch'); },
      patchRoadmap: async (_id, roadmap) => roadmap,
    },
    roadmap: { id: 'r1', bars: [previousBar] },
    previousBar,
    nextBar: { ...previousBar, startDate: '2026-07-11' },
    onTaskUpdated: savedTask => published.push(savedTask),
  });
  await assert.rejects(() => taskRoadmapLinks.persistLinkedBarChange({
    api: {
      patchTask: async () => ({ ...task, due: '2026-07-22' }),
      patchRoadmap: async () => { throw new Error('roadmap failed'); },
    },
    roadmap: { id: 'r1', bars: [previousBar] },
    previousBar,
    nextBar: { ...previousBar, endDate: '2026-07-22' },
    onTaskUpdated: savedTask => published.push(savedTask),
  }), /roadmap failed/);
  assert.deepEqual(published, []);
});

test('linked roadmap writes still return the saved roadmap when task publication throws', async () => {
  const task = { id: 7, title: 'A', due: '2026-07-22', column: 'Беклог' };
  const previousBar = { id: 'a', linkedTaskId: 7, endDate: '2026-07-20', status: 'planned', progress: 0, linkedTaskSnapshot: { ...task, due: '2026-07-20' } };
  const savedRoadmap = { id: 'r1', bars: [{ ...previousBar, endDate: '2026-07-22' }] };

  const saved = await taskRoadmapLinks.persistLinkedBarChange({
    api: {
      patchTask: async () => task,
      patchRoadmap: async () => savedRoadmap,
    },
    roadmap: { id: 'r1', bars: [previousBar] },
    previousBar,
    nextBar: { ...previousBar, endDate: '2026-07-22' },
    onTaskUpdated: () => { throw new Error('render callback failed'); },
  });

  assert.equal(saved, savedRoadmap);
});

test('normalization reports repaired roadmaps and removes legacy field aliases', () => {
  assert.equal(typeof taskRoadmapLinks.normalizeTaskRoadmapLinksWithChanges, 'function');
  const roadmaps = [{ id: 'r1', bars: [{ id: 'a', linkedTaskId: 7, laneId: 'legacy', ownerId: 9 }] }];
  const tasks = [{ id: 7, title: 'A', due: '—', column: 'Беклог', assigneeId: 3 }];
  const result = taskRoadmapLinks.normalizeTaskRoadmapLinksWithChanges(roadmaps, tasks);
  assert.deepEqual(result.changedRoadmapIds, ['r1']);
  assert.equal(result.roadmaps[0].bars[0].lane, 'legacy');
  assert.equal(result.roadmaps[0].bars[0].owner, 3);
  assert.equal('laneId' in result.roadmaps[0].bars[0], false);
  assert.equal('ownerId' in result.roadmaps[0].bars[0], false);
});

test('link availability is revalidated against current global roadmap state', () => {
  assert.equal(typeof taskRoadmapLinks.canLinkTaskToRoadmaps, 'function');
  const task = { id: 7 };
  assert.equal(taskRoadmapLinks.canLinkTaskToRoadmaps([], task), true);
  assert.equal(taskRoadmapLinks.canLinkTaskToRoadmaps([{ id: 'r1', bars: [{ linkedTaskId: 7 }] }], task), false);
});

test('single-flight runner shares an in-flight write and permits a later write', async () => {
  assert.equal(typeof taskRoadmapLinks.createSingleFlight, 'function');
  const gate = taskRoadmapLinks.createSingleFlight();
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = gate.run(async () => { calls += 1; await pending; return true; });
  const second = gate.run(async () => { calls += 1; return true; });
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  await first;
  await gate.run(async () => { calls += 1; return true; });
  assert.equal(calls, 2);
});

test('single-flight runner clears its guard after rejection so the user can retry', async () => {
  const gate = taskRoadmapLinks.createSingleFlight();
  await assert.rejects(() => gate.run(async () => { throw new Error('save failed'); }), /save failed/);
  assert.equal(gate.pending, false);
  assert.equal(await gate.run(async () => 'saved'), 'saved');
  assert.equal(gate.pending, false);
});

test('repaired roadmaps persist independently and report failures safely', async () => {
  assert.equal(typeof taskRoadmapLinks.persistRoadmapRepairs, 'function');
  const roadmaps = [{ id: 'r1' }, { id: 'r2' }];
  const errors = [];
  const result = await taskRoadmapLinks.persistRoadmapRepairs({
    roadmaps,
    changedRoadmapIds: ['r1', 'r2'],
    patchRoadmap: async (id, roadmap) => {
      if (id === 'r2') throw new Error('failed repair');
      return { ...roadmap, saved: true };
    },
    onError: error => errors.push(error.message),
  });
  assert.deepEqual(result.roadmaps, [{ id: 'r1', saved: true }, { id: 'r2' }]);
  assert.deepEqual(result.failedRoadmapIds, ['r2']);
  assert.deepEqual(errors, ['failed repair']);
});
