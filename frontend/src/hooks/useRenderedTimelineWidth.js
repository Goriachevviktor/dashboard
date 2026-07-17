import { useEffect, useRef, useState } from 'react';

export function resolveRenderedTimelineWidth(measuredWidth, minimumWidth) {
  const safeMinimum = Math.max(0, Number(minimumWidth) || 0);
  const safeMeasurement = Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : safeMinimum;
  return Math.max(safeMinimum, safeMeasurement);
}

export function updateObservedTimelineGrid({ nodeRef, observer, node, schedule }) {
  const previous = nodeRef.current;
  if (previous === node) return;
  if (previous) observer?.unobserve(previous);
  nodeRef.current = node;
  if (node) observer?.observe(node);
  schedule?.();
}

export function useRenderedTimelineWidth(gridRef, minimumWidth) {
  const [width, setWidth] = useState(() => resolveRenderedTimelineWidth(0, minimumWidth));
  const observedNodeRef = useRef(null);

  useEffect(() => {
    const node = gridRef.current;
    const measure = () => {
      const measuredWidth = node?.getBoundingClientRect().width;
      setWidth(current => {
        const next = resolveRenderedTimelineWidth(measuredWidth, minimumWidth);
        return current === next ? current : next;
      });
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;

    updateObservedTimelineGrid({ nodeRef: observedNodeRef, observer, node, schedule: measure });
    if (!observer) window.addEventListener('resize', measure);

    return () => {
      updateObservedTimelineGrid({ nodeRef: observedNodeRef, observer, node: null });
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', measure);
    };
  }, [gridRef, minimumWidth]);

  return width;
}
