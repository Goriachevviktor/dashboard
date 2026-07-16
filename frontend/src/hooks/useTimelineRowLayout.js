import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearTimelineFrame,
  normalizeMeasuredTimelineLayout,
  pruneTimelineRowCallbacks,
  reconcileTimelineLayoutRows,
  timelineLayoutsEqual,
  updateObservedTimelineNode,
} from '../utils/timelineRowLayout.js';

export function useTimelineRowLayout(rows) {
  const bodyRef = useRef(null);
  const nodesRef = useRef(new Map());
  const callbacksRef = useRef(new Map());
  const frameRef = useRef(0);
  const observerRef = useRef(null);
  const scheduleRef = useRef(null);
  const [layoutState, setLayoutState] = useState(() => reconcileTimelineLayoutRows(rows));
  const currentState = reconcileTimelineLayoutRows(rows, layoutState);
  const layout = currentState.layout;

  const registerRow = useCallback(key => {
    if (!callbacksRef.current.has(key)) {
      callbacksRef.current.set(key, node => updateObservedTimelineNode({
        nodes: nodesRef.current,
        observer: observerRef.current,
        key,
        node,
        schedule: scheduleRef.current,
      }));
    }
    return callbacksRef.current.get(key);
  }, []);

  useEffect(() => {
    pruneTimelineRowCallbacks(callbacksRef.current, rows);
    const measure = () => {
      frameRef.current = 0;
      const bodyTop = bodyRef.current?.getBoundingClientRect().top || 0;
      const measurements = rows.map(row => {
        const rect = nodesRef.current.get(row.key)?.getBoundingClientRect();
        return { key: row.key, top: rect ? rect.top - bodyTop : 0, height: rect?.height || 0 };
      });
      const next = normalizeMeasuredTimelineLayout(rows, measurements);
      setLayoutState(current => {
        const reconciled = reconcileTimelineLayoutRows(rows, current);
        return timelineLayoutsEqual(reconciled.layout, next) ? reconciled : { ...reconciled, layout: next };
      });
    };
    const schedule = () => {
      if (typeof window.requestAnimationFrame !== 'function') {
        measure();
      } else if (!frameRef.current) {
        frameRef.current = window.requestAnimationFrame(measure);
      }
    };
    scheduleRef.current = schedule;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observerRef.current = observer;
    if (bodyRef.current) observer?.observe(bodyRef.current);
    nodesRef.current.forEach(node => observer?.observe(node));
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer?.disconnect();
      if (observerRef.current === observer) observerRef.current = null;
      if (scheduleRef.current === schedule) scheduleRef.current = null;
      window.removeEventListener('resize', schedule);
      clearTimelineFrame(frameRef, window.cancelAnimationFrame?.bind(window));
    };
  }, [rows]);

  const totalHeight = layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].height : 120;
  return { bodyRef, registerRow, layout, totalHeight };
}
