export const ROADMAP_DRAG_THRESHOLD_PX = 6;

export function resolveRoadmapDragIntent({ deltaX, deltaY, lockedIntent, forcedIntent }) {
  if (forcedIntent) return forcedIntent;
  if (lockedIntent) return lockedIntent;
  if (Math.hypot(deltaX, deltaY) < ROADMAP_DRAG_THRESHOLD_PX) return null;
  return Math.abs(deltaX) >= Math.abs(deltaY) ? 'horizontal' : 'vertical';
}

export function resolveRoadmapDropTarget({ coordinate, items, sourceId }) {
  const targets = items.filter(item => item.id !== sourceId);
  if (targets.length === 0) return { targetId: null, position: 'before' };

  for (const item of targets) {
    const midpoint = (item.start + item.end) / 2;
    if (coordinate <= midpoint) {
      return { targetId: item.id, position: coordinate < midpoint ? 'before' : 'after' };
    }
  }

  return { targetId: targets.at(-1).id, position: 'after' };
}

export function resolveRoadmapAutoScrollDelta({ pointer, start, end, edgeSize, maxStep }) {
  if (pointer < start + edgeSize) {
    const progress = (start + edgeSize - pointer) / edgeSize;
    return Math.max(-maxStep, Math.min(maxStep, -maxStep * progress));
  }
  if (pointer > end - edgeSize) {
    const progress = (pointer - (end - edgeSize)) / edgeSize;
    return Math.max(-maxStep, Math.min(maxStep, maxStep * progress));
  }
  return 0;
}
