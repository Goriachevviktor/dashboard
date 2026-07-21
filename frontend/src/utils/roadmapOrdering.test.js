import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveRoadmapBar,
  moveRoadmapLane,
  moveRoadmapPlanningBar,
  resolveRoadmapPlanningGroups,
} from './roadmapOrdering.js';

const lanes = [
  { id: 'lane-a', name: 'A' },
  { id: 'lane-b', name: 'B' },
  { id: 'lane-c', name: 'C' },
];

const bars = [
  { id: 'a1', lane: 'lane-a', title: 'A1', startDate: '2026-07-01', endDate: '2026-07-02', status: 'planned', progress: 0, predecessors: [] },
  { id: 'a2', lane: 'lane-a', title: 'A2', startDate: '2026-07-03', endDate: '2026-07-04', status: 'planned', progress: 0, predecessors: ['a1'], linkedTaskId: 17 },
  { id: 'b1', lane: 'lane-b', title: 'B1', startDate: '2026-07-05', endDate: '2026-07-06', status: 'progress', progress: 40, predecessors: [] },
  { id: 'b2', lane: 'lane-b', title: 'B2', startDate: '2026-08-01', endDate: '2026-08-02', status: 'planned', progress: 0, predecessors: [] },
  { id: 'done', lane: 'lane-b', title: 'Done', startDate: '2026-06-01', endDate: '2026-06-02', status: 'done', progress: 100, predecessors: [] },
];

const today = new Date(2026, 6, 21);

test('moves lanes forward and backward without changing lane objects', () => {
  const backward = moveRoadmapLane(lanes, { sourceLaneId: 'lane-c', targetLaneId: 'lane-a', position: 'before' });
  const forward = moveRoadmapLane(lanes, { sourceLaneId: 'lane-a', targetLaneId: 'lane-c', position: 'after' });
  assert.deepEqual(backward.map(item => item.id), ['lane-c', 'lane-a', 'lane-b']);
  assert.deepEqual(forward.map(item => item.id), ['lane-b', 'lane-c', 'lane-a']);
  assert.equal(backward[0], lanes[2]);
});

test('returns lanes unchanged for no-op and invalid lane requests', () => {
  assert.equal(moveRoadmapLane(lanes, { sourceLaneId: 'lane-a', targetLaneId: 'lane-a', position: 'before' }), lanes);
  assert.equal(moveRoadmapLane(lanes, { sourceLaneId: 'lane-b', targetLaneId: 'lane-a', position: 'after' }), lanes);
  assert.equal(moveRoadmapLane(lanes, { sourceLaneId: 'lane-b', targetLaneId: 'lane-c', position: 'before' }), lanes);
  assert.equal(moveRoadmapLane(lanes, { sourceLaneId: 'missing', targetLaneId: 'lane-a', position: 'before' }), lanes);
  assert.equal(moveRoadmapLane(lanes, { sourceLaneId: 'lane-a', targetLaneId: 'missing', position: 'before' }), lanes);
});

test('inserts a bar before, after, and at the end while preserving fields', () => {
  const before = moveRoadmapBar(bars, { barId: 'a2', targetLaneId: 'lane-b', targetBarId: 'b2', position: 'before' });
  const after = moveRoadmapBar(bars, { barId: 'a1', targetLaneId: 'lane-b', targetBarId: 'b1', position: 'after' });
  const end = moveRoadmapBar(bars, { barId: 'a1', targetLaneId: 'lane-b', targetBarId: null, position: 'after' });
  assert.deepEqual(before.filter(item => item.lane === 'lane-b').map(item => item.id), ['b1', 'a2', 'b2', 'done']);
  assert.deepEqual(after.filter(item => item.lane === 'lane-b').map(item => item.id), ['b1', 'a1', 'b2', 'done']);
  assert.deepEqual(end.filter(item => item.lane === 'lane-b').map(item => item.id), ['b1', 'b2', 'done', 'a1']);
  const moved = before.find(item => item.id === 'a2');
  assert.equal(moved.lane, 'lane-b');
  assert.equal(moved.linkedTaskId, 17);
  assert.deepEqual(moved.predecessors, ['a1']);
  assert.equal(moved.startDate, '2026-07-03');
});

test('moves a bar into an empty lane and returns bars unchanged for invalid requests', () => {
  const moved = moveRoadmapBar(bars, { barId: 'a1', targetLaneId: 'lane-c', targetBarId: null, position: 'before' });
  assert.deepEqual(moved.filter(item => item.lane === 'lane-c').map(item => item.id), ['a1']);
  assert.equal(moveRoadmapBar(bars, { barId: 'missing', targetLaneId: 'lane-b', targetBarId: null, position: 'before' }), bars);
  assert.equal(moveRoadmapBar(bars, { barId: 'a1', targetLaneId: 'lane-b', targetBarId: 'missing', position: 'before' }), bars);
});

test('returns bars unchanged for visually identical neighboring and end placements', () => {
  assert.equal(moveRoadmapBar(bars, { barId: 'a2', targetLaneId: 'lane-a', targetBarId: 'a1', position: 'after' }), bars);
  assert.equal(moveRoadmapBar(bars, { barId: 'a2', targetLaneId: 'lane-a', targetBarId: null, position: 'after' }), bars);
});

test('uses canonical per-lane order for no-ops when global bars are interleaved', () => {
  const interleaved = [bars[0], bars[2], bars[1], bars[3]];
  assert.equal(moveRoadmapBar(interleaved, {
    barId: 'a2', targetLaneId: 'lane-a', targetBarId: null, position: 'after',
  }), interleaved);
  assert.equal(moveRoadmapBar(interleaved, {
    barId: 'b2', targetLaneId: 'lane-b', targetBarId: 'b1', position: 'after',
  }), interleaved);

  const singletonInterleaved = [bars[0], bars[2], bars[1]];
  assert.equal(moveRoadmapBar(singletonInterleaved, {
    barId: 'b1', targetLaneId: 'lane-b', targetBarId: null, position: 'after',
  }), singletonInterleaved);

  const moved = moveRoadmapBar(interleaved, {
    barId: 'a2', targetLaneId: 'lane-a', targetBarId: 'a1', position: 'before',
  });
  assert.deepEqual(moved.filter(item => item.lane === 'lane-a').map(item => item.id), ['a2', 'a1']);
});

test('keeps legacy automatic grouping until a manual move', () => {
  const grouped = resolveRoadmapPlanningGroups(bars, { today });
  assert.deepEqual(grouped.now.map(item => item.id), ['b1']);
  assert.deepEqual(grouped.next.map(item => item.id), ['a1', 'a2', 'b2']);
  assert.deepEqual(grouped.later.map(item => item.id), []);
  assert.equal(Object.hasOwn(bars[0], 'planningBucket'), false);
});

test('uses explicit buckets and ranks before automatic ordering independently of array order', () => {
  const explicit = [
    { ...bars[3], planningBucket: 'later', planningRank: 1 },
    { ...bars[1], planningBucket: 'later', planningRank: 0 },
    { ...bars[2], planningBucket: 'now', planningRank: 0 },
    bars[0],
    { ...bars[4], planningBucket: 'now', planningRank: 2 },
  ];
  const grouped = resolveRoadmapPlanningGroups(explicit, { today });
  assert.deepEqual(grouped.now.map(item => item.id), ['b1']);
  assert.deepEqual(grouped.next.map(item => item.id), ['a1']);
  assert.deepEqual(grouped.later.map(item => item.id), ['a2', 'b2']);
});

test('moves an NNL bar and assigns contiguous ranks without changing roadmap lane or dates', () => {
  const result = moveRoadmapPlanningBar(bars, {
    barId: 'b2', targetBucket: 'now', targetBarId: 'b1', position: 'before', today,
  });
  const grouped = resolveRoadmapPlanningGroups(result, { today });
  assert.deepEqual(grouped.now.map(item => item.id), ['b2', 'b1']);
  assert.deepEqual(grouped.next.map(item => item.id), ['a1', 'a2']);
  assert.deepEqual(grouped.now.map(item => item.planningRank), [0, 1]);
  assert.deepEqual(grouped.next.map(item => item.planningRank), [0, 1]);
  assert.equal(result.find(item => item.id === 'b2').lane, 'lane-b');
  assert.equal(result.find(item => item.id === 'b2').startDate, '2026-08-01');
});

test('returns legacy planning bars unchanged for visually identical placements', () => {
  const endPlacement = moveRoadmapPlanningBar(bars, {
    barId: 'b1', targetBucket: 'now', targetBarId: null, position: 'after', today,
  });
  const neighboringPlacement = moveRoadmapPlanningBar(bars, {
    barId: 'a2', targetBucket: 'next', targetBarId: 'a1', position: 'after', today,
  });
  assert.equal(endPlacement, bars);
  assert.equal(neighboringPlacement, bars);
  assert.equal(Object.hasOwn(bars[0], 'planningBucket'), false);
  assert.equal(Object.hasOwn(bars[2], 'planningRank'), false);
});

test('a first manual NNL move materializes all visible groups and freezes untouched Later', () => {
  const legacy = [
    { id: 'now', lane: 'lane-a', title: 'Now', status: 'progress', startDate: '2026-01-01', endDate: '2026-01-31' },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `future-${index + 1}`,
      lane: 'lane-a',
      title: `Future ${index + 1}`,
      status: 'planned',
      startDate: `2026-0${index + 2}-01`,
      endDate: `2026-0${index + 2}-15`,
    })),
  ];
  const before = resolveRoadmapPlanningGroups(legacy, { today });
  assert.deepEqual(before.next.map(item => item.id), ['future-1', 'future-2', 'future-3', 'future-4']);
  assert.deepEqual(before.later.map(item => item.id), ['future-5', 'future-6']);

  const result = moveRoadmapPlanningBar(legacy, {
    barId: 'future-2', targetBucket: 'next', targetBarId: 'future-1', position: 'before', today,
  });
  const after = resolveRoadmapPlanningGroups(result, { today });

  assert.deepEqual(after.now.map(item => item.id), ['now']);
  assert.deepEqual(after.next.map(item => item.id), ['future-2', 'future-1', 'future-3', 'future-4']);
  assert.deepEqual(after.later.map(item => item.id), before.later.map(item => item.id));
  for (const bucket of ['now', 'next', 'later']) {
    assert.deepEqual(after[bucket].map(item => item.planningBucket), after[bucket].map(() => bucket));
    assert.deepEqual(after[bucket].map(item => item.planningRank), after[bucket].map((_, index) => index));
  }
});
