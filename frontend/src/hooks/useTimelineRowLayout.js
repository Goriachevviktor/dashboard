import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFallbackTimelineLayout,
  normalizeMeasuredTimelineLayout,
  timelineLayoutsEqual,
} from '../utils/timelineRowLayout.js';

export function useTimelineRowLayout(rows) {
  const bodyRef = useRef(null);
  const nodesRef = useRef(new Map());
  const frameRef = useRef(0);
  const fallback = useMemo(() => buildFallbackTimelineLayout(rows), [rows]);
  const [layout, setLayout] = useState(fallback);

  const registerRow = useCallback(key => node => {
    if (node) nodesRef.current.set(key, node);
    else nodesRef.current.delete(key);
  }, []);

  useEffect(() => {
    const measure = () => {
      frameRef.current = 0;
      const bodyTop = bodyRef.current?.getBoundingClientRect().top || 0;
      const measurements = rows.map(row => {
        const rect = nodesRef.current.get(row.key)?.getBoundingClientRect();
        return { key: row.key, top: rect ? rect.top - bodyTop : 0, height: rect?.height || 0 };
      });
      const next = normalizeMeasuredTimelineLayout(rows, measurements);
      setLayout(current => timelineLayoutsEqual(current, next) ? current : next);
    };
    const schedule = () => {
      if (typeof window.requestAnimationFrame !== 'function') {
        measure();
      } else if (!frameRef.current) {
        frameRef.current = window.requestAnimationFrame(measure);
      }
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (bodyRef.current) observer?.observe(bodyRef.current);
    nodesRef.current.forEach(node => observer?.observe(node));
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      if (frameRef.current && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameRef.current);
    };
  }, [rows]);

  const totalHeight = layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].height : 120;
  return { bodyRef, registerRow, layout, totalHeight };
}
