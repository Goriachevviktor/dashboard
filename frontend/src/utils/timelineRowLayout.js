export const TIMELINE_TASK_MIN_HEIGHT = 54;
export const TIMELINE_LANE_MIN_HEIGHT = 40;

export function timelineRowKey(row) {
  return row.type === 'lane' ? `lane:${row.lane.id}` : `task:${row.b.id}`;
}

function minimumHeight(row) {
  return row.type === 'lane' ? TIMELINE_LANE_MIN_HEIGHT : TIMELINE_TASK_MIN_HEIGHT;
}

export function buildFallbackTimelineLayout(rows) {
  let top = 0;
  return rows.map(row => {
    const height = minimumHeight(row);
    const item = { ...row, key: row.key || timelineRowKey(row), top, height };
    top += height;
    return item;
  });
}

export function normalizeMeasuredTimelineLayout(rows, measurements = []) {
  const byKey = new Map(measurements.map(item => [item.key, item]));
  let top = 0;
  return rows.map(row => {
    const key = row.key || timelineRowKey(row);
    const measured = byKey.get(key);
    const height = Math.max(minimumHeight(row), Number(measured?.height) || 0);
    const item = { ...row, key, top, height };
    top += height;
    return item;
  });
}

export function timelineLayoutsEqual(left = [], right = []) {
  return left.length === right.length && left.every((item, index) => (
    item.key === right[index]?.key && item.top === right[index]?.top && item.height === right[index]?.height
  ));
}

export function timelineRowCenter(row) {
  return row.top + row.height / 2;
}
