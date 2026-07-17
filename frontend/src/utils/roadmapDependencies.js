function taskId(value) {
  return value == null ? "" : String(value);
}

export const DEPENDENCY_SVG_OVERFLOW = "visible";

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function inclusiveDurationDays(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

export function sanitizePredecessorIds(predecessors, selfId = "") {
  const selfKey = taskId(selfId);
  return Array.from(new Set((Array.isArray(predecessors) ? predecessors : []).map(taskId).filter(Boolean)))
    .filter(id => id !== selfKey);
}

export function ensureRoadmapTaskIds(roadmapId, bars = []) {
  const prefix = taskId(roadmapId) || "roadmap";
  return (Array.isArray(bars) ? bars : []).map((bar, index) => ({
    ...bar,
    id: taskId(bar?.id) || `${prefix}-bar-${index}`,
  }));
}

export function buildDependencyState(bars = []) {
  const normalizedBars = Array.isArray(bars) ? bars : [];
  const taskById = new Map();
  const predecessorsById = new Map();
  const successorsById = new Map();

  normalizedBars.forEach(bar => {
    const id = taskId(bar?.id);
    if (!id) return;
    taskById.set(id, bar);
    predecessorsById.set(id, []);
    successorsById.set(id, []);
  });

  normalizedBars.forEach(bar => {
    const id = taskId(bar?.id);
    if (!id || !taskById.has(id)) return;
    const predecessors = sanitizePredecessorIds(bar?.predecessors, id).filter(predId => taskById.has(predId));
    predecessorsById.set(id, predecessors);
    predecessors.forEach(predId => {
      successorsById.set(predId, [...(successorsById.get(predId) || []), id]);
    });
  });

  return { taskById, predecessorsById, successorsById };
}


export function buildDependencyDebugEdges(bars = []) {
  const { taskById, predecessorsById } = buildDependencyState(bars);
  const edges = [];

  predecessorsById.forEach((predecessors, targetId) => {
    const target = taskById.get(targetId);
    (predecessors || []).forEach(sourceId => {
      const source = taskById.get(sourceId);
      if (!source || !target) return;
      edges.push({
        sourceId,
        sourceTitle: source.title || sourceId,
        targetId,
        targetTitle: target.title || targetId,
      });
    });
  });

  return edges;
}

export function computeDependencyLineLayout({
  predecessorEndPct,
  targetStartPct,
  chartWidth,
  predecessorCenterY,
  targetCenterY,
  predecessorAnchorOffsetX = -4,
  targetAnchorOffsetX = 0,
  minimumShoulder = 16,
}) {
  const startX = chartWidth * predecessorEndPct / 100 + predecessorAnchorOffsetX;
  const endX = chartWidth * targetStartPct / 100 + targetAnchorOffsetX;
  const direction = endX >= startX ? 1 : -1;
  const preferredMiddleX = direction > 0
    ? Math.max(startX, endX) + minimumShoulder
    : Math.min(startX, endX) - minimumShoulder;
  const oppositeMiddleX = direction > 0
    ? Math.min(startX, endX) - minimumShoulder
    : Math.max(startX, endX) + minimumShoulder;
  const oppositeIsValid = oppositeMiddleX >= 0
    && oppositeMiddleX <= chartWidth
    && Math.abs(oppositeMiddleX - startX) >= minimumShoulder
    && Math.abs(oppositeMiddleX - endX) >= minimumShoulder;
  const middleX = (preferredMiddleX < 0 || preferredMiddleX > chartWidth) && oppositeIsValid
    ? oppositeMiddleX
    : preferredMiddleX;
  return {
    startX,
    endX,
    startY: predecessorCenterY,
    endY: targetCenterY,
    middleX,
  };
}

export function dependencyPathData({ startX, startY, middleX, endY, endX }) {
  return `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
}

export function resolveRenderedTimelineWidth(measuredWidth, minimumWidth) {
  return Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : minimumWidth;
}

export function resolveDependencyAnchorPercents({ startPct, endPct, taskIndex, barDrag }) {
  if (!barDrag || barDrag.idx !== taskIndex) return { startPct, endPct };
  return {
    startPct: barDrag.previewLeft,
    endPct: barDrag.previewLeft + barDrag.previewWidth,
  };
}

export function resolveDependencyEdgePercents({ predecessor, target, barDrag }) {
  const predecessorAnchors = resolveDependencyAnchorPercents({ ...predecessor, barDrag });
  const targetAnchors = resolveDependencyAnchorPercents({ ...target, barDrag });
  return {
    predecessorEndPct: predecessorAnchors.endPct,
    targetStartPct: targetAnchors.startPct,
  };
}

function topologicalOrder(bars = []) {
  const { taskById, predecessorsById, successorsById } = buildDependencyState(bars);
  const inDegree = new Map();
  const queue = [];
  const order = [];

  taskById.forEach((_, id) => {
    const degree = (predecessorsById.get(id) || []).length;
    inDegree.set(id, degree);
    if (degree === 0) queue.push(id);
  });

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    (successorsById.get(id) || []).forEach(successorId => {
      const nextDegree = (inDegree.get(successorId) || 0) - 1;
      inDegree.set(successorId, nextDegree);
      if (nextDegree === 0) queue.push(successorId);
    });
  }

  return {
    order,
    hasCycle: order.length !== taskById.size,
    taskById,
    predecessorsById,
    successorsById,
  };
}

export function wouldCreateDependencyCycle(bars = [], sourceId, targetId) {
  const sourceKey = taskId(sourceId);
  const targetKey = taskId(targetId);
  if (!sourceKey || !targetKey || sourceKey === targetKey) return true;
  const nextBars = (Array.isArray(bars) ? bars : []).map(bar => {
    if (taskId(bar?.id) !== targetKey) return bar;
    return {
      ...bar,
      predecessors: [...sanitizePredecessorIds(bar?.predecessors, targetKey), sourceKey],
    };
  });
  return topologicalOrder(nextBars).hasCycle;
}

export function applyDependencySchedule(bars = []) {
  const normalizedBars = (Array.isArray(bars) ? bars : []).map(bar => ({
    ...bar,
    predecessors: sanitizePredecessorIds(bar?.predecessors, bar?.id),
  }));

  const { order, hasCycle, taskById, predecessorsById } = topologicalOrder(normalizedBars);
  if (hasCycle) return normalizedBars;

  const updated = new Map(normalizedBars.map(bar => [taskId(bar.id), { ...bar }]));

  order.forEach(id => {
    const current = updated.get(id);
    if (!current) return;
    const predecessors = predecessorsById.get(id) || [];
    if (!predecessors.length) return;

    const minStartDate = predecessors.reduce((latest, predecessorId) => {
      const predecessor = updated.get(predecessorId) || taskById.get(predecessorId);
      const predecessorEnd = parseIsoDate(predecessor?.endDate);
      if (!predecessorEnd) return latest;
      const candidate = addDays(predecessorEnd, 1);
      if (!latest || candidate > latest) return candidate;
      return latest;
    }, null);

    const currentStart = parseIsoDate(current.startDate);
    if (!minStartDate || !currentStart || currentStart >= minStartDate) return;

    const durationDays = inclusiveDurationDays(current.startDate, current.endDate);
    const nextStart = minStartDate;
    const nextEnd = addDays(nextStart, durationDays - 1);
    updated.set(id, {
      ...current,
      startDate: toIsoDate(nextStart),
      endDate: toIsoDate(nextEnd),
    });
  });

  return normalizedBars.map(bar => updated.get(taskId(bar.id)) || bar);
}
