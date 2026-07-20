export function resolveDependencyAnchorPercents({ startPct, endPct, taskIndex, barDrag }) {
  if (!barDrag || barDrag.idx !== taskIndex) return { startPct, endPct };
  return { startPct: barDrag.previewLeft, endPct: barDrag.previewLeft + barDrag.previewWidth };
}

export function resolveDependencyEdgePercents({ predecessor, target, barDrag }) {
  const predecessorPercents = resolveDependencyAnchorPercents({ ...predecessor, barDrag });
  const targetPercents = resolveDependencyAnchorPercents({ ...target, barDrag });
  return {
    predecessorEndPct: predecessorPercents.endPct,
    targetStartPct: targetPercents.startPct,
  };
}

export function computeDependencyRoute({
  predecessorEndPct,
  targetStartPct,
  chartWidth,
  predecessorCenterY,
  targetCenterY,
  sourceOffsetX = -4,
  targetOffsetX = 0,
  minimumShoulder = 16,
}) {
  const clampX = value => Math.max(0, Math.min(chartWidth, value));
  const startX = clampX((predecessorEndPct / 100) * chartWidth + sourceOffsetX);
  const endX = clampX((targetStartPct / 100) * chartWidth + targetOffsetX);
  const corridorY = predecessorCenterY + (targetCenterY - predecessorCenterY) / 2;
  const approachX = clampX(endX - minimumShoulder);

  return {
    startX,
    startY: predecessorCenterY,
    corridorY,
    approachX,
    endY: targetCenterY,
    endX,
  };
}

export function dependencyPathData({ startX, startY, corridorY, approachX, endY, endX }) {
  return `M ${startX} ${startY} V ${corridorY} H ${approachX} V ${endY} H ${endX}`;
}

export const QUIET_DEPENDENCY_STYLE = Object.freeze({ strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
export const ACTIVE_DEPENDENCY_STYLE = Object.freeze({ strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });

export function resolveActiveDependencyVisualState({ activeTaskId, predecessorsById, successorsById }) {
  const normalizedActiveTaskId = activeTaskId == null ? "" : String(activeTaskId);
  const activeEdgeIds = new Set();
  const incomingPortTaskIds = new Set();
  const outgoingPortTaskIds = new Set();
  if (!normalizedActiveTaskId) return { activeEdgeIds, incomingPortTaskIds, outgoingPortTaskIds };

  for (const predecessorId of predecessorsById?.get(normalizedActiveTaskId) || []) {
    const normalizedPredecessorId = String(predecessorId);
    activeEdgeIds.add(`${normalizedPredecessorId}:${normalizedActiveTaskId}`);
    outgoingPortTaskIds.add(normalizedPredecessorId);
    incomingPortTaskIds.add(normalizedActiveTaskId);
  }
  for (const successorId of successorsById?.get(normalizedActiveTaskId) || []) {
    const normalizedSuccessorId = String(successorId);
    activeEdgeIds.add(`${normalizedActiveTaskId}:${normalizedSuccessorId}`);
    outgoingPortTaskIds.add(normalizedActiveTaskId);
    incomingPortTaskIds.add(normalizedSuccessorId);
  }

  return { activeEdgeIds, incomingPortTaskIds, outgoingPortTaskIds };
}

export function dependencyPresentation({ edgeId, activeEdgeIds }) {
  const active = activeEdgeIds?.has(String(edgeId)) || false;
  return { active, ...(active ? ACTIVE_DEPENDENCY_STYLE : QUIET_DEPENDENCY_STYLE) };
}
