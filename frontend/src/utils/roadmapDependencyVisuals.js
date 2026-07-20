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

function segmentBlocked(first, second, {
  rects,
  clearance,
  sourceRect,
  targetRect,
  isFirst = false,
  isLast = false,
}) {
  return rects.some(rect => {
    const leavesSourceBoundary = rect === sourceRect
      && isFirst
      && first.x >= sourceRect.right
      && first.y === sourceRect.centerY
      && second.x === first.x;
    if (leavesSourceBoundary) return false;

    const reachesTargetFromLeft = rect === targetRect
      && isLast
      && first.x <= targetRect.left
      && second.x === targetRect.left
      && first.y === targetRect.centerY
      && second.y === targetRect.centerY;
    if (reachesTargetFromLeft) return false;

    const rectClearance = rect === sourceRect || rect === targetRect ? 0 : clearance;
    if (second.x === first.x) {
      return verticalSegmentBlocked(second.x, first.y, second.y, [rect], rectClearance);
    }
    return horizontalSegmentBlocked(second.y, first.x, second.x, [rect], rectClearance);
  });
}

function routeBlocked(points, options) {
  return points.slice(1).some((point, index) => {
    const previous = points[index];
    return segmentBlocked(previous, point, {
      ...options,
      isFirst: index === 0,
      isLast: index === points.length - 2,
    });
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

function normalizeOrthogonalPoints(points) {
  const normalized = [];
  for (const point of removeConsecutiveDuplicatePoints(points)) {
    const previous = normalized.at(-1);
    const beforePrevious = normalized.at(-2);
    if (
      beforePrevious
      && ((beforePrevious.x === previous.x && previous.x === point.x)
        || (beforePrevious.y === previous.y && previous.y === point.y))
    ) {
      normalized[normalized.length - 1] = point;
    } else {
      normalized.push(point);
    }
  }
  return normalized;
}

function comparePointTraces(first, second, points) {
  const sharedLength = Math.min(first.length, second.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const firstPoint = points[first[index]];
    const secondPoint = points[second[index]];
    const difference = firstPoint.x - secondPoint.x || firstPoint.y - secondPoint.y;
    if (difference !== 0) return difference;
  }
  return first.length - second.length;
}

function compareSearchStates(first, second, points) {
  return first.distance - second.distance
    || first.bends - second.bends
    || first.levelPenalty - second.levelPenalty
    || comparePointTraces(first.trace, second.trace, points);
}

function heapPush(heap, item, compare) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (compare(heap[parentIndex], item) <= 0) break;
    heap[index] = heap[parentIndex];
    index = parentIndex;
  }
  heap[index] = item;
}

function heapPop(heap, compare) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length === 0) return first;

  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let childIndex = index * 2 + 1;
    const rightIndex = childIndex + 1;
    if (rightIndex < heap.length && compare(heap[rightIndex], heap[childIndex]) < 0) {
      childIndex = rightIndex;
    }
    if (compare(last, heap[childIndex]) <= 0) break;
    heap[index] = heap[childIndex];
    index = childIndex;
  }
  heap[index] = last;
  return first;
}

function findShortestDetour({
  sourceRect,
  targetRect,
  obstacles,
  gapYs,
  startX,
  endX,
  approachX,
  chartWidth,
  clearance,
}) {
  const rects = [sourceRect, targetRect, ...obstacles];
  const collisionOptions = { rects, clearance, sourceRect, targetRect };
  const preferredGapYs = new Set(gapYs);
  const yPriorities = new Map();
  for (const gapY of gapYs) yPriorities.set(gapY, 0);
  for (const rect of rects) {
    for (const boundaryY of [rect.top - clearance, rect.bottom + clearance]) {
      if (!yPriorities.has(boundaryY)) yPriorities.set(boundaryY, 1);
    }
  }

  const yLevels = [...yPriorities.keys()]
    .filter(y => y !== sourceRect.centerY && y !== targetRect.centerY)
    .sort((first, second) => first - second);
  const xLevels = [...new Set([
    0,
    chartWidth,
    startX,
    approachX,
    ...obstacles.flatMap(rect => [
      Math.max(0, Math.min(chartWidth, rect.left - clearance)),
      Math.max(0, Math.min(chartWidth, rect.right + clearance)),
    ]),
  ])].sort((first, second) => first - second);
  const points = [];
  const nodesByY = new Map(yLevels.map(y => [y, []]));
  const nodesByX = new Map(xLevels.map(x => [x, []]));

  for (const y of yLevels) {
    for (const x of xLevels) {
      const point = { x, y };
      const pointIsBlocked = rects.some(rect => {
        const rectClearance = rect === sourceRect || rect === targetRect ? 0 : clearance;
        return x > rect.left - rectClearance
          && x < rect.right + rectClearance
          && y > rect.top - rectClearance
          && y < rect.bottom + rectClearance;
      });
      if (pointIsBlocked) continue;
      const nodeId = points.push(point) - 1;
      nodesByY.get(y).push(nodeId);
      nodesByX.get(x).push(nodeId);
    }
  }

  const startNode = points.push({ x: startX, y: sourceRect.centerY }) - 1;
  const goalNode = points.push({ x: approachX, y: targetRect.centerY }) - 1;
  const adjacency = Array.from({ length: points.length }, () => []);
  const addEdge = (from, to, edgeOptions = {}) => {
    const first = points[from];
    const second = points[to];
    if (segmentBlocked(first, second, { ...collisionOptions, ...edgeOptions })) return;
    const direction = first.x === second.x ? "V" : "H";
    const length = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    adjacency[from].push({ to, direction, length });
  };
  const addUndirectedEdge = (first, second) => {
    addEdge(first, second);
    addEdge(second, first);
  };

  for (const nodeIds of nodesByY.values()) {
    nodeIds.sort((first, second) => points[first].x - points[second].x);
    for (let index = 1; index < nodeIds.length; index += 1) {
      addUndirectedEdge(nodeIds[index - 1], nodeIds[index]);
    }
  }
  for (const nodeIds of nodesByX.values()) {
    nodeIds.sort((first, second) => points[first].y - points[second].y);
    for (let index = 1; index < nodeIds.length; index += 1) {
      addUndirectedEdge(nodeIds[index - 1], nodeIds[index]);
    }
  }

  const direction = Math.sign(targetRect.centerY - sourceRect.centerY) || 1;
  for (const nodeId of nodesByX.get(startX) || []) {
    const point = points[nodeId];
    if (direction * (point.y - sourceRect.centerY) <= 0) continue;
    addEdge(startNode, nodeId, { isFirst: true });
  }
  for (const nodeId of nodesByX.get(approachX) || []) addEdge(nodeId, goalNode);
  if (startX === approachX) addEdge(startNode, goalNode, { isFirst: true });

  const finalPoint = { x: endX, y: targetRect.centerY };
  if (segmentBlocked(points[goalNode], finalPoint, { ...collisionOptions, isLast: true })) return null;

  const compare = (first, second) => compareSearchStates(first, second, points);
  const initial = {
    node: startNode,
    direction: "",
    distance: 0,
    bends: 0,
    levelPenalty: 0,
    trace: [startNode],
  };
  const heap = [];
  const bestByState = new Map([[`${startNode}:`, initial]]);
  heapPush(heap, initial, compare);

  while (heap.length > 0) {
    const current = heapPop(heap, compare);
    const stateKey = `${current.node}:${current.direction}`;
    if (bestByState.get(stateKey) !== current) continue;
    if (current.node === goalNode) {
      return normalizeOrthogonalPoints([
        ...current.trace.map(nodeId => points[nodeId]),
        finalPoint,
      ]);
    }

    const edges = [...adjacency[current.node]].sort((first, second) => {
      const firstPoint = points[first.to];
      const secondPoint = points[second.to];
      return firstPoint.x - secondPoint.x || firstPoint.y - secondPoint.y;
    });
    for (const edge of edges) {
      const nextPoint = points[edge.to];
      const candidate = {
        node: edge.to,
        direction: edge.direction,
        distance: current.distance + edge.length,
        bends: current.bends + (current.direction && current.direction !== edge.direction ? 1 : 0),
        levelPenalty: current.levelPenalty + (
          edge.to !== goalNode && !preferredGapYs.has(nextPoint.y) ? 1 : 0
        ),
        trace: [...current.trace, edge.to],
      };
      const nextKey = `${edge.to}:${edge.direction}`;
      const existing = bestByState.get(nextKey);
      if (existing && compare(existing, candidate) <= 0) continue;
      bestByState.set(nextKey, candidate);
      heapPush(heap, candidate, compare);
    }
  }

  return null;
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
  const obstacles = [...new Set(obstacleRects)]
    .filter(rect => rect !== sourceRect && rect !== targetRect);
  const rects = [sourceRect, targetRect, ...obstacles];
  const collisionOptions = { rects, clearance, sourceRect, targetRect };
  const gapYs = buildGapYs(rects);
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
    const points = [
      { x: startX, y: sourceRect.centerY },
      { x: startX, y: gapY },
      { x: approachX, y: gapY },
      { x: approachX, y: targetRect.centerY },
      { x: endX, y: targetRect.centerY },
    ];
    return { points, compact: true, length: routeLength(points) };
  });
  const validCompactCandidates = compactCandidates.filter(candidate => (
    !routeBlocked(candidate.points, collisionOptions)
  ));

  if (validCompactCandidates.length > 0) {
    validCompactCandidates.sort((first, second) => first.length - second.length);
    return { points: validCompactCandidates[0].points, compact: true, startX, endX };
  }

  const shortestDetour = findShortestDetour({
    sourceRect,
    targetRect,
    obstacles,
    gapYs,
    startX,
    endX,
    approachX,
    chartWidth,
    clearance,
  });
  if (shortestDetour) return { points: shortestDetour, compact: false, startX, endX };

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

  const boundaryCandidates = detourCandidates.filter(candidate => (
    candidate.channelX === 0 || candidate.channelX === chartWidth
  ));
  const fallback = boundaryCandidates[0] ?? detourCandidates[0];
  return { points: fallback.points, compact: false, startX, endX, blocked: true };
}

export function dependencyPathData({ points }) {
  let previousCommand = "";
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    let command;
    if (point.x === previous.x && point.y === previous.y) {
      command = previousCommand === "V" ? "H" : "V";
    } else {
      command = point.x === previous.x ? "V" : "H";
    }
    previousCommand = command;
    return `${path} ${command} ${command === "V" ? point.y : point.x}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export function isDependencyRouteRenderable(route) {
  return Boolean(route) && route.blocked !== true;
}

export function dependencyRoutingRuntimeSource() {
  return [
    resolveRenderedBarRect,
    horizontalSegmentBlocked,
    verticalSegmentBlocked,
    removeConsecutiveDuplicatePoints,
    routeLength,
    segmentBlocked,
    routeBlocked,
    buildGapYs,
    closestGapAfter,
    makeDetourPoints,
    normalizeOrthogonalPoints,
    comparePointTraces,
    compareSearchStates,
    heapPush,
    heapPop,
    findShortestDetour,
    computeDependencyRoute,
    dependencyPathData,
    isDependencyRouteRenderable,
  ].map(fn => fn.toString()).join("\n");
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
