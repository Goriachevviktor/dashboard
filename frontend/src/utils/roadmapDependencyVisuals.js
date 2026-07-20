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

export function resolveRenderedBarRect({
  leftPct,
  widthPct,
  chartWidth,
  rowTop,
  rowHeight,
  minimumWidthPx = 8,
  barHeight = 30,
}) {
  const left = (leftPct / 100) * chartWidth;
  const width = Math.max(minimumWidthPx, (widthPct / 100) * chartWidth);
  const renderedWidth = Math.min(width, chartWidth - left);
  const centerY = rowTop + rowHeight / 2;

  return {
    left,
    right: Math.min(chartWidth, left + width),
    top: centerY - barHeight / 2,
    bottom: centerY + barHeight / 2,
    centerY,
    width: renderedWidth,
  };
}

function horizontalSegmentBlocked(y, x1, x2, rects, clearance) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return rects.some(rect => (
    y > rect.top - clearance
    && y < rect.bottom + clearance
    && maxX > rect.left - clearance
    && minX < rect.right + clearance
  ));
}

function verticalSegmentBlocked(x, y1, y2, rects, clearance) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return rects.some(rect => (
    x > rect.left - clearance
    && x < rect.right + clearance
    && maxY > rect.top - clearance
    && minY < rect.bottom + clearance
  ));
}

function removeConsecutiveDuplicatePoints(points) {
  return points.filter((point, index) => (
    index === 0
    || point.x !== points[index - 1].x
    || point.y !== points[index - 1].y
  ));
}

function routeLength(points) {
  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index];
    return length + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }, 0);
}

function routeBlocked(points, rects, clearance) {
  return points.slice(1).some((point, index) => {
    const previous = points[index];
    if (point.x === previous.x) {
      return verticalSegmentBlocked(point.x, previous.y, point.y, rects, clearance);
    }
    return horizontalSegmentBlocked(point.y, previous.x, point.x, rects, clearance);
  });
}

function buildGapYs(rects) {
  const sortedRects = [...rects].sort((first, second) => (
    first.top - second.top
    || first.bottom - second.bottom
    || first.left - second.left
  ));
  const gapYs = [];

  for (let index = 1; index < sortedRects.length; index += 1) {
    const upper = sortedRects[index - 1];
    const lower = sortedRects[index];
    if (upper.bottom < lower.top) gapYs.push((upper.bottom + lower.top) / 2);
  }

  return gapYs;
}

function closestGapAfter(gapYs, centerY, direction) {
  const directionalGaps = gapYs.filter(gapY => (
    direction > 0 ? gapY > centerY : gapY < centerY
  ));
  directionalGaps.sort((first, second) => (
    Math.abs(first - centerY) - Math.abs(second - centerY)
    || first - second
  ));
  return directionalGaps[0];
}

function makeDetourPoints({
  startX,
  endX,
  approachX,
  sourceCenterY,
  targetCenterY,
  sourceGapY,
  targetGapY,
  channelX,
}) {
  return removeConsecutiveDuplicatePoints([
    { x: startX, y: sourceCenterY },
    { x: startX, y: sourceGapY },
    { x: channelX, y: sourceGapY },
    { x: channelX, y: targetGapY },
    { x: approachX, y: targetGapY },
    { x: approachX, y: targetCenterY },
    { x: endX, y: targetCenterY },
  ]);
}

export function computeDependencyRoute({
  sourceRect,
  targetRect,
  obstacleRects = [],
  chartWidth,
  anchorGap = 8,
  targetShoulder = 16,
  clearance = 2,
}) {
  const clampX = value => Math.max(0, Math.min(chartWidth, value));
  const startX = clampX(sourceRect.right + anchorGap);
  const endX = clampX(targetRect.left);
  const approachX = clampX(endX - targetShoulder);
  const obstacles = obstacleRects.filter(rect => rect !== sourceRect && rect !== targetRect);
  const gapYs = buildGapYs([sourceRect, targetRect, ...obstacles]);
  const minimumCenterY = Math.min(sourceRect.centerY, targetRect.centerY);
  const maximumCenterY = Math.max(sourceRect.centerY, targetRect.centerY);
  const endpointsMidpointY = (sourceRect.centerY + targetRect.centerY) / 2;
  const compactGapYs = gapYs
    .filter(gapY => gapY > minimumCenterY && gapY < maximumCenterY)
    .sort((first, second) => (
      Math.abs(first - endpointsMidpointY) - Math.abs(second - endpointsMidpointY)
      || first - second
    ));

  const compactCandidates = compactGapYs.map(gapY => {
    const points = removeConsecutiveDuplicatePoints([
      { x: startX, y: sourceRect.centerY },
      { x: startX, y: gapY },
      { x: approachX, y: gapY },
      { x: approachX, y: targetRect.centerY },
      { x: endX, y: targetRect.centerY },
    ]);
    return { points, compact: true, length: routeLength(points) };
  });
  const validCompactCandidates = compactCandidates.filter(candidate => (
    !routeBlocked(candidate.points, obstacles, clearance)
  ));

  if (validCompactCandidates.length > 0) {
    validCompactCandidates.sort((first, second) => first.length - second.length);
    return { points: validCompactCandidates[0].points, compact: true, startX, endX };
  }

  const direction = Math.sign(targetRect.centerY - sourceRect.centerY) || 1;
  const sourceGapY = closestGapAfter(gapYs, sourceRect.centerY, direction)
    ?? sourceRect.centerY;
  const targetGapY = closestGapAfter(gapYs, targetRect.centerY, -direction)
    ?? targetRect.centerY;
  const channelXs = [...new Set([
    0,
    chartWidth,
    ...obstacles.flatMap(rect => [rect.left - clearance, rect.right + clearance]),
  ].map(clampX))];
  const detourCandidates = channelXs.map(channelX => {
    const points = makeDetourPoints({
      startX,
      endX,
      approachX,
      sourceCenterY: sourceRect.centerY,
      targetCenterY: targetRect.centerY,
      sourceGapY,
      targetGapY,
      channelX,
    });
    return { points, channelX, compact: false, length: routeLength(points) };
  }).sort((first, second) => first.length - second.length || first.channelX - second.channelX);
  const validDetour = detourCandidates.find(candidate => (
    !routeBlocked(candidate.points, obstacles, clearance)
  ));

  if (validDetour) return { points: validDetour.points, compact: false, startX, endX };

  const boundaryCandidates = detourCandidates.filter(candidate => (
    candidate.channelX === 0 || candidate.channelX === chartWidth
  ));
  const fallback = boundaryCandidates[0] ?? detourCandidates[0];
  return { points: fallback.points, compact: false, startX, endX, blocked: true };
}

export function dependencyPathData({ points }) {
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    if (point.x === previous.x) return `${path} V ${point.y}`;
    return `${path} H ${point.x}`;
  }, `M ${points[0].x} ${points[0].y}`);
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
