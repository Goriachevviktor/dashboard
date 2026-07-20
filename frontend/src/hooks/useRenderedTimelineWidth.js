import { useCallback, useEffect, useState } from 'react';

export function resolveRenderedTimelineWidth(measuredWidth, minimumWidth) {
  const safeMinimum = Math.max(0, Number(minimumWidth) || 0);
  const safeMeasurement = Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : safeMinimum;
  return Math.max(safeMinimum, safeMeasurement);
}

export function createRenderedTimelineWidthController({
  minimumWidth,
  onWidth,
  ResizeObserverImpl = globalThis.ResizeObserver,
  windowTarget = globalThis.window,
}) {
  const nodeRef = { current: null };
  let currentMinimumWidth = minimumWidth;
  let observer = null;
  let listeningForWindowResize = false;

  const measure = () => {
    const measuredWidth = nodeRef.current?.getBoundingClientRect().width;
    onWidth(resolveRenderedTimelineWidth(measuredWidth, currentMinimumWidth));
  };

  const initialize = () => {
    if (typeof ResizeObserverImpl === 'function') {
      if (!observer) observer = new ResizeObserverImpl(measure);
    } else if (!listeningForWindowResize && windowTarget) {
      windowTarget.addEventListener('resize', measure);
      listeningForWindowResize = true;
    }
  };

  const timelineRef = node => {
    const previous = nodeRef.current;
    if (previous === node) return;
    initialize();
    if (previous) observer?.unobserve(previous);
    nodeRef.current = node;
    if (node) {
      observer?.observe(node);
      measure();
    }
  };

  const cleanup = () => {
    if (nodeRef.current) observer?.unobserve(nodeRef.current);
    nodeRef.current = null;
    observer?.disconnect();
    observer = null;
    if (listeningForWindowResize) {
      windowTarget?.removeEventListener('resize', measure);
      listeningForWindowResize = false;
    }
  };

  const setMinimumWidth = nextMinimumWidth => {
    currentMinimumWidth = nextMinimumWidth;
    measure();
  };

  return { cleanup, nodeRef, setMinimumWidth, timelineRef };
}

export function useRenderedTimelineWidth(minimumWidth) {
  const [renderedWidth, setRenderedWidth] = useState(() => resolveRenderedTimelineWidth(0, minimumWidth));
  const [controller] = useState(() => createRenderedTimelineWidthController({ minimumWidth, onWidth: setRenderedWidth }));
  const timelineRef = useCallback(node => controller.timelineRef(node), [controller]);

  useEffect(() => {
    controller.setMinimumWidth(minimumWidth);
  }, [controller, minimumWidth]);

  useEffect(() => () => controller.cleanup(), [controller]);

  return { renderedWidth, timelineNodeRef: controller.nodeRef, timelineRef };
}
