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
  const startX = (predecessorEndPct / 100) * chartWidth + sourceOffsetX;
  const endX = (targetStartPct / 100) * chartWidth + targetOffsetX;
  const direction = endX >= startX ? 1 : -1;
  const preferredElbowX = startX + direction * minimumShoulder;
  const oppositeElbowX = startX - direction * minimumShoulder;
  const isUsableElbow = elbowX => (
    elbowX >= 0
    && elbowX <= chartWidth
    && Math.abs(elbowX - startX) >= minimumShoulder
    && Math.abs(endX - elbowX) >= minimumShoulder
  );
  const elbowX = isUsableElbow(preferredElbowX)
    ? preferredElbowX
    : isUsableElbow(oppositeElbowX)
      ? oppositeElbowX
      : preferredElbowX;

  return {
    startX,
    startY: predecessorCenterY,
    elbowX,
    endY: targetCenterY,
    endX,
  };
}

export function dependencyPathData({ startX, startY, elbowX, endY, endX }) {
  return `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`;
}

export const QUIET_DEPENDENCY_STYLE = Object.freeze({ strokeWidth: 1, opacity: 0.24, dashArray: "2 4" });
export const ACTIVE_DEPENDENCY_STYLE = Object.freeze({ strokeWidth: 1.75, opacity: 0.82, dashArray: "3 3" });

export function dependencyPresentation({ sourceId, targetId, activeTaskIds }) {
  const active = activeTaskIds?.has(sourceId) || activeTaskIds?.has(targetId) || false;
  return { active, ...(active ? ACTIVE_DEPENDENCY_STYLE : QUIET_DEPENDENCY_STYLE) };
}
