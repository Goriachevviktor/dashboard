export const PLANNING_BUCKETS = Object.freeze(['now', 'next', 'later']);

const idOf = value => String(value ?? '');
const isPlanningBucket = value => PLANNING_BUCKETS.includes(value);
const isPlanningRank = value => Number.isInteger(value) && value >= 0;
const hasSameOrder = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);

function hasSameBarOrderByLane(left, right) {
  if (left.length !== right.length) return false;
  const groupByLane = items => {
    const grouped = new Map();
    items.forEach(item => {
      const laneId = idOf(item.lane);
      const laneItems = grouped.get(laneId) || [];
      laneItems.push(idOf(item.id));
      grouped.set(laneId, laneItems);
    });
    return grouped;
  };
  const leftGroups = groupByLane(left);
  const rightGroups = groupByLane(right);
  if (leftGroups.size !== rightGroups.size) return false;
  return [...leftGroups].every(([laneId, itemIds]) => {
    const rightIds = rightGroups.get(laneId);
    return rightIds && hasSameOrder(itemIds, rightIds);
  });
}

function insertRelative(items, item, targetId, position, getId) {
  if (!targetId) return [...items, item];
  const targetIndex = items.findIndex(candidate => getId(candidate) === idOf(targetId));
  if (targetIndex < 0) return null;
  const index = targetIndex + (position === 'after' ? 1 : 0);
  return [...items.slice(0, index), item, ...items.slice(index)];
}

export function moveRoadmapLane(lanes, request) {
  const sourceId = idOf(request?.sourceLaneId);
  const targetId = idOf(request?.targetLaneId);
  const source = lanes.find(item => idOf(item.id) === sourceId);
  if (!source || !targetId || sourceId === targetId) return lanes;
  const remaining = lanes.filter(item => idOf(item.id) !== sourceId);
  const result = insertRelative(remaining, source, request?.targetLaneId, request?.position, item => idOf(item.id));
  return !result || hasSameOrder(result, lanes) ? lanes : result;
}

export function moveRoadmapBar(bars, request) {
  const barId = idOf(request?.barId);
  const targetLaneId = idOf(request?.targetLaneId);
  const sourceIndex = bars.findIndex(item => idOf(item.id) === barId);
  if (sourceIndex < 0 || !targetLaneId) return bars;

  const source = bars[sourceIndex];
  const remaining = bars.filter((_, index) => index !== sourceIndex);
  const targetBars = remaining.filter(item => idOf(item.lane) === targetLaneId);
  const targetBarId = request?.targetBarId;
  if (targetBarId && !targetBars.some(item => idOf(item.id) === idOf(targetBarId))) return bars;
  if (targetBarId && idOf(targetBarId) === barId) return bars;

  const moved = idOf(source.lane) === targetLaneId ? source : { ...source, lane: request.targetLaneId };
  if (!targetBarId) {
    const lastTargetIndex = remaining.reduce((last, item, index) => (
      idOf(item.lane) === targetLaneId ? index : last
    ), -1);
    const insertionIndex = lastTargetIndex + 1 || remaining.length;
    const result = [...remaining.slice(0, insertionIndex), moved, ...remaining.slice(insertionIndex)];
    return hasSameBarOrderByLane(result, bars) ? bars : result;
  }

  const targetIndex = remaining.findIndex(item => idOf(item.id) === idOf(targetBarId));
  const insertionIndex = targetIndex + (request?.position === 'after' ? 1 : 0);
  const result = [...remaining.slice(0, insertionIndex), moved, ...remaining.slice(insertionIndex)];
  return hasSameBarOrderByLane(result, bars) ? bars : result;
}

function automaticPlanningBucket(bar, today) {
  const start = new Date(`${bar.startDate}T00:00:00`);
  const end = new Date(`${bar.endDate}T00:00:00`);
  const startsNowOrPast = !Number.isNaN(start.valueOf()) && start <= today;
  const endsFuture = !Number.isNaN(end.valueOf()) && end >= today;
  return bar.status === 'progress' || (startsNowOrPast && endsFuture) ? 'now' : 'upcoming';
}

function dateCompare(left, right, first, second) {
  return String(left[first] || '').localeCompare(String(right[first] || ''))
    || String(left[second] || '').localeCompare(String(right[second] || ''))
    || left.index - right.index;
}

export function resolveRoadmapPlanningGroups(bars, { today }) {
  const day = new Date(today);
  day.setHours(0, 0, 0, 0);
  const explicit = { now: [], next: [], later: [] };
  const automaticNow = [];
  const automaticUpcoming = [];

  bars.forEach((bar, index) => {
    if (bar.status === 'done') return;
    const item = { bar, index };
    if (isPlanningBucket(bar.planningBucket)) {
      explicit[bar.planningBucket].push(item);
    } else if (automaticPlanningBucket(bar, day) === 'now') {
      automaticNow.push(item);
    } else {
      automaticUpcoming.push(item);
    }
  });

  for (const bucket of PLANNING_BUCKETS) {
    explicit[bucket].sort((left, right) => {
      const leftRank = isPlanningRank(left.bar.planningRank) ? left.bar.planningRank : Infinity;
      const rightRank = isPlanningRank(right.bar.planningRank) ? right.bar.planningRank : Infinity;
      return leftRank - rightRank || left.index - right.index;
    });
  }
  automaticNow.sort((left, right) => dateCompare(left.bar, right.bar, 'endDate', 'startDate'));
  automaticUpcoming.sort((left, right) => dateCompare(left.bar, right.bar, 'startDate', 'endDate'));

  return {
    now: [...explicit.now, ...automaticNow].map(item => item.bar),
    next: [...explicit.next, ...automaticUpcoming.slice(0, 4)].map(item => item.bar),
    later: [...explicit.later, ...automaticUpcoming.slice(4)].map(item => item.bar),
  };
}

export function moveRoadmapPlanningBar(bars, request) {
  const barId = idOf(request?.barId);
  const targetBucket = request?.targetBucket;
  if (!isPlanningBucket(targetBucket)) return bars;

  const source = bars.find(item => idOf(item.id) === barId);
  if (!source || source.status === 'done') return bars;
  const groups = resolveRoadmapPlanningGroups(bars, { today: request?.today });
  const sourceBucket = PLANNING_BUCKETS.find(bucket => groups[bucket].some(item => idOf(item.id) === barId));
  if (!sourceBucket) return bars;

  const targetBarId = request?.targetBarId;
  const target = targetBarId && groups[targetBucket].find(item => idOf(item.id) === idOf(targetBarId));
  if (targetBarId && !target) return bars;
  if (target && idOf(target.id) === barId) return bars;

  const updatedGroups = Object.fromEntries(PLANNING_BUCKETS.map(bucket => [
    bucket,
    groups[bucket].filter(item => idOf(item.id) !== barId),
  ]));
  const inserted = insertRelative(updatedGroups[targetBucket], source, targetBarId, request?.position, item => idOf(item.id));
  updatedGroups[targetBucket] = inserted;
  const isVisualNoOp = PLANNING_BUCKETS.every(bucket => hasSameOrder(updatedGroups[bucket], groups[bucket]));
  if (isVisualNoOp) return bars;

  const affected = new Map();
  for (const bucket of PLANNING_BUCKETS) {
    updatedGroups[bucket].forEach((bar, planningRank) => {
      affected.set(idOf(bar.id), { planningBucket: bucket, planningRank });
    });
  }
  return bars.map(bar => {
    const planning = affected.get(idOf(bar.id));
    return planning ? { ...bar, ...planning } : bar;
  });
}
