import ExcelJS from "exceljs";
import { resolveRoadmapPlanningGroups } from "./roadmapOrdering.js";

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const STATUS_META = {
  active: { label: "Активна", color: "#22b07d", bg: "#e6f7f0" },
  draft: { label: "Черновик", color: "#f3a236", bg: "#fdf1df" },
  archived: { label: "Архив", color: "#8a96ad", bg: "#eef1f6" },
};

const STATUS_LABELS = {
  done: "Завершено",
  progress: "В работе",
  planned: "Запланировано",
};

const BAR_COL = {
  done: { bar: "#22b07d", soft: "#cdeede" },
  progress: { bar: "#3b6fe0", soft: "#cfddf8" },
  planned: { bar: "#aeb9d0", soft: "#dde3ee" },
};

function memberKey(value) {
  return value == null ? "" : String(value);
}

function sanitizeMemberIds(memberIds, ownerId) {
  const ownerKey = memberKey(ownerId);
  return Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map(memberKey).filter(Boolean))).filter(id => id !== ownerKey);
}

function getMemberById(members, id) {
  const key = memberKey(id);
  return (Array.isArray(members) ? members : []).find(member => member.key === key || member.id === key) || null;
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthRange(startDateValue, endDateValue) {
  const startDate = parseIsoDate(startDateValue);
  const endDate = parseIsoDate(endDateValue);
  if (!startDate || !endDate) return "—";
  const startLabel = `${MONTHS[startDate.getMonth()]} ${startDate.getFullYear()}`;
  const endLabel = `${MONTHS[endDate.getMonth()]} ${endDate.getFullYear()}`;
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function monthIndexFromTimeline(dateValue, timeline) {
  const date = parseIsoDate(dateValue);
  if (!date || !timeline?.months?.length) return 0;
  const exactIndex = timeline.months.findIndex(month => month.year === date.getFullYear() && month.month === date.getMonth());
  if (exactIndex >= 0) return exactIndex;
  const first = timeline.months[0];
  const offset = (date.getFullYear() - first.year) * 12 + (date.getMonth() - first.month);
  return Math.max(0, Math.min(timeline.months.length - 1, offset));
}

function toArgb(hex, fallback = "FFFFFFFF") {
  const clean = String(hex || "").replace("#", "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `FF${clean.toUpperCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(clean)) return clean.toUpperCase();
  return fallback;
}

function ownerText(members, ownerId) {
  return getMemberById(members, ownerId)?.name || "Не назначен";
}

function coExecutorText(members, memberIds, ownerId) {
  const names = sanitizeMemberIds(memberIds, ownerId)
    .map(id => getMemberById(members, id)?.name || "")
    .filter(Boolean);
  return names.join(", ") || "—";
}

function taskCaption(task, members) {
  const owner = getMemberById(members, task.owner);
  const extra = sanitizeMemberIds(task.memberIds, task.owner).length;
  const ownerLabel = owner?.initials || owner?.name || "";
  return ownerLabel ? `${task.title}${extra > 0 ? ` · ${ownerLabel}+${extra}` : ` · ${ownerLabel}`}` : task.title;
}

function applyBaseSheetView(worksheet) {
  worksheet.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
  worksheet.properties.defaultRowHeight = 20;
}

function setCell(cell, value, style = {}) {
  cell.value = value;
  Object.assign(cell, { style: { ...cell.style, ...style } });
}

function baseStyles() {
  return {
    title: {
      font: { name: "Arial", size: 16, bold: true, color: { argb: "FF1E3A6E" } },
      alignment: { vertical: "middle" },
    },
    subtitle: {
      font: { name: "Arial", size: 10, color: { argb: "FF64748B" } },
      alignment: { vertical: "middle" },
    },
    metaLabel: {
      font: { name: "Arial", size: 9, bold: true, color: { argb: "FF94A3B8" } },
    },
    metaValue: {
      font: { name: "Arial", size: 10, bold: true, color: { argb: "FF1E3A6E" } },
    },
    header: {
      font: { name: "Arial", size: 11, bold: true, color: { argb: "FF1E3A6E" } },
      alignment: { horizontal: "center", vertical: "middle" },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FBFF" } },
      border: {
        top: { style: "thin", color: { argb: "FFDCE6F4" } },
        left: { style: "thin", color: { argb: "FFDCE6F4" } },
        bottom: { style: "thin", color: { argb: "FFDCE6F4" } },
        right: { style: "thin", color: { argb: "FFDCE6F4" } },
      },
    },
    month: {
      font: { name: "Arial", size: 9, color: { argb: "FF94A3B8" } },
      alignment: { horizontal: "center", vertical: "middle" },
      border: {
        left: { style: "thin", color: { argb: "FFEEF3FA" } },
        right: { style: "thin", color: { argb: "FFEEF3FA" } },
      },
    },
    lane: {
      font: { name: "Arial", size: 10, bold: true, color: { argb: "FF1E3A6E" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FD" } },
      alignment: { vertical: "middle" },
    },
    taskLabel: {
      font: { name: "Arial", size: 10, color: { argb: "FF475569" } },
      alignment: { vertical: "middle", wrapText: true },
    },
    info: {
      font: { name: "Arial", size: 9, color: { argb: "FF64748B" } },
      alignment: { vertical: "middle", wrapText: true },
    },
    cardTitle: {
      font: { name: "Arial", size: 11, bold: true, color: { argb: "FF1E3A6E" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FD" } },
      alignment: { vertical: "middle", wrapText: true },
    },
    cardBody: {
      font: { name: "Arial", size: 10, color: { argb: "FF1E3A6E" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } },
      alignment: { vertical: "middle", wrapText: true },
      border: {
        top: { style: "thin", color: { argb: "FFE2EDF8" } },
        left: { style: "thin", color: { argb: "FFE2EDF8" } },
        bottom: { style: "thin", color: { argb: "FFE2EDF8" } },
        right: { style: "thin", color: { argb: "FFE2EDF8" } },
      },
    },
    empty: {
      font: { name: "Arial", size: 10, italic: true, color: { argb: "FF94A3B8" } },
      alignment: { horizontal: "center", vertical: "middle" },
    },
    milestone: {
      font: { name: "Arial", size: 9, bold: true, color: { argb: "FF6D5BD0" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F1FF" } },
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    },
    legend: {
      font: { name: "Arial", size: 9, color: { argb: "FF475569" } },
    },
  };
}

function statusBarStyle(status) {
  const color = toArgb(BAR_COL[status]?.bar, "FFAEB9D0");
  return {
    font: { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: color } },
    alignment: { vertical: "middle", wrapText: true },
    border: {
      top: { style: "thin", color: { argb: "FFFFFFFF" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    },
  };
}

function buildTimelineSheet(workbook, roadmap, members) {
  const styles = baseStyles();
  const ws = workbook.addWorksheet("Timeline");
  applyBaseSheetView(ws);

  const timeline = roadmap.timeline || { months: [], quarters: [] };
  const totalCols = Math.max(13, timeline.months.length + 1);
  ws.columns = [{ width: 32 }, ...Array.from({ length: totalCols - 1 }, () => ({ width: 12 }))];

  ws.mergeCells(1, 1, 1, totalCols);
  setCell(ws.getCell(1, 1), roadmap.title, styles.title);
  ws.mergeCells(2, 1, 2, totalCols);
  setCell(ws.getCell(2, 1), roadmap.desc || "", styles.subtitle);

  setCell(ws.getCell(3, 1), "Статус", styles.metaLabel);
  ws.mergeCells(3, 2, 3, 3);
  setCell(ws.getCell(3, 2), STATUS_META[roadmap.status]?.label || roadmap.status || "", styles.metaValue);
  setCell(ws.getCell(3, 4), "Владелец", styles.metaLabel);
  ws.mergeCells(3, 5, 3, 6);
  setCell(ws.getCell(3, 5), ownerText(members, roadmap.owner), styles.metaValue);
  setCell(ws.getCell(3, 7), "Соисполнители", styles.metaLabel);
  ws.mergeCells(3, 8, 3, 10);
  setCell(ws.getCell(3, 8), coExecutorText(members, roadmap.memberIds, roadmap.owner), styles.metaValue);
  setCell(ws.getCell(3, 11), "Период", styles.metaLabel);
  ws.mergeCells(3, 12, 3, totalCols);
  setCell(ws.getCell(3, 12), roadmap.period || "", styles.metaValue);

  let row = 5;
  setCell(ws.getCell(row, 1), "Направление / задача", styles.header);
  let col = 2;
  for (const quarter of timeline.quarters || []) {
    const span = Math.max(1, quarter.months?.length || 1);
    ws.mergeCells(row, col, row, col + span - 1);
    setCell(ws.getCell(row, col), quarter.label, styles.header);
    col += span;
  }

  row += 1;
  setCell(ws.getCell(row, 1), "", styles.header);
  (timeline.months || []).forEach((month, index) => setCell(ws.getCell(row, index + 2), month.label, styles.month));

  if ((roadmap.milestones || []).length) {
    row += 1;
    setCell(ws.getCell(row, 1), "Вехи", styles.lane);
    const milestonesByMonth = new Map();
    for (const milestone of roadmap.milestones) {
      const idx = monthIndexFromTimeline(milestone.date, timeline);
      if (!milestonesByMonth.has(idx)) milestonesByMonth.set(idx, []);
      milestonesByMonth.get(idx).push(milestone.name);
    }
    (timeline.months || []).forEach((_, idx) => {
      const text = milestonesByMonth.get(idx)?.join(" | ") || "";
      setCell(ws.getCell(row, idx + 2), text, text ? styles.milestone : styles.taskLabel);
    });
  }

  for (const lane of roadmap.lanes || []) {
    row += 1;
    ws.mergeCells(row, 1, row, totalCols);
    const laneStyle = {
      ...styles.lane,
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(lane.color, "FFF7F9FD") } },
    };
    setCell(ws.getCell(row, 1), lane.name, laneStyle);
    const laneBars = (roadmap.bars || []).filter(bar => bar.lane === lane.id);
    if (!laneBars.length) {
      row += 1;
      ws.mergeCells(row, 1, row, totalCols);
      setCell(ws.getCell(row, 1), "Нет задач", styles.empty);
      continue;
    }
    for (const bar of laneBars) {
      row += 1;
      setCell(ws.getCell(row, 1), bar.title, styles.taskLabel);
      const startCol = monthIndexFromTimeline(bar.startDate, timeline) + 2;
      const endCol = monthIndexFromTimeline(bar.endDate, timeline) + 2;
      ws.mergeCells(row, startCol, row, endCol);
      setCell(ws.getCell(row, startCol), taskCaption(bar, members), statusBarStyle(bar.status));
      row += 1;
      setCell(ws.getCell(row, 1), "", styles.info);
      ws.mergeCells(row, startCol, row, endCol);
      setCell(ws.getCell(row, startCol), `${STATUS_LABELS[bar.status] || ""} · ${formatMonthRange(bar.startDate, bar.endDate)}`, styles.info);
    }
  }

  row += 2;
  setCell(ws.getCell(row, 1), "Завершено", styles.legend);
  setCell(ws.getCell(row, 2), "В работе", styles.legend);
  setCell(ws.getCell(row, 3), "Запланировано", styles.legend);
  setCell(ws.getCell(row, 4), "Веха", styles.legend);
}

function buildSwimlanesSheet(workbook, roadmap, members) {
  const styles = baseStyles();
  const ws = workbook.addWorksheet("Дорожки");
  applyBaseSheetView(ws);

  const lanes = roadmap.lanes || [];
  ws.columns = Array.from({ length: Math.max(1, lanes.length) * 3 }, (_, idx) => ({ width: idx % 3 === 0 ? 22 : 18 }));

  ws.mergeCells(1, 1, 1, ws.columns.length);
  setCell(ws.getCell(1, 1), `${roadmap.title} · Дорожки`, styles.title);
  ws.mergeCells(2, 1, 2, ws.columns.length);
  setCell(ws.getCell(2, 1), roadmap.desc || "", styles.subtitle);

  let row = 4;
  lanes.forEach((lane, index) => {
    const startCol = index * 3 + 1;
    const endCol = startCol + 2;
    ws.mergeCells(row, startCol, row, endCol);
    const laneBars = (roadmap.bars || []).filter(bar => bar.lane === lane.id);
    setCell(ws.getCell(row, startCol), `${lane.name} · ${laneBars.length}`, {
      ...styles.lane,
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(lane.color, "FFF7F9FD") } },
    });
  });

  const maxTasks = Math.max(1, ...lanes.map(lane => (roadmap.bars || []).filter(bar => bar.lane === lane.id).length));
  for (let taskRow = 0; taskRow < maxTasks; taskRow += 1) {
    row += 1;
    lanes.forEach((lane, laneIndex) => {
      const tasks = (roadmap.bars || []).filter(bar => bar.lane === lane.id);
      const task = tasks[taskRow];
      const startCol = laneIndex * 3 + 1;
      const endCol = startCol + 2;
      ws.mergeCells(row, startCol, row, endCol);
      if (!task) {
        setCell(ws.getCell(row, startCol), "Пусто", styles.empty);
        return;
      }
      setCell(ws.getCell(row, startCol), taskCaption(task, members), statusBarStyle(task.status));
      row += 1;
      setCell(ws.getCell(row, startCol), STATUS_LABELS[task.status] || "", styles.cardBody);
      setCell(ws.getCell(row, startCol + 1), `${task.progress || 0}%`, styles.cardBody);
      setCell(ws.getCell(row, startCol + 2), formatMonthRange(task.startDate, task.endDate), styles.cardBody);
    });
    row += 1;
  }
}

function buildNowNextLaterSheet(workbook, roadmap, members, today) {
  const styles = baseStyles();
  const ws = workbook.addWorksheet("Now-Next-Later");
  applyBaseSheetView(ws);
  ws.columns = [{ width: 22 }, { width: 14 }, { width: 20 }, { width: 4 }, { width: 22 }, { width: 14 }, { width: 20 }, { width: 4 }, { width: 22 }, { width: 14 }, { width: 20 }];

  ws.mergeCells(1, 1, 1, ws.columns.length);
  setCell(ws.getCell(1, 1), `${roadmap.title} · Now-Next-Later`, styles.title);
  ws.mergeCells(2, 1, 2, ws.columns.length);
  setCell(ws.getCell(2, 1), roadmap.desc || "", styles.subtitle);

  const grouped = resolveRoadmapPlanningGroups(roadmap.bars || [], { today });
  const groups = [
    { key: "now", label: "Now · Сейчас в работе" },
    { key: "next", label: "Next · Следующий шаг" },
    { key: "later", label: "Later · В перспективе" },
  ];

  let row = 4;
  groups.forEach((group, index) => {
    const startCol = index * 4 + 1;
    const endCol = startCol + 2;
    ws.mergeCells(row, startCol, row, endCol);
    setCell(ws.getCell(row, startCol), `${group.label} · ${grouped[group.key].length}`, styles.cardTitle);
  });

  const maxTasks = Math.max(1, ...groups.map(group => grouped[group.key].length));
  for (let taskIndex = 0; taskIndex < maxTasks; taskIndex += 1) {
    row += 1;
    groups.forEach((group, groupIndex) => {
      const task = grouped[group.key][taskIndex];
      const startCol = groupIndex * 4 + 1;
      const endCol = startCol + 2;
      ws.mergeCells(row, startCol, row, endCol);
      if (!task) {
        setCell(ws.getCell(row, startCol), "Пусто", styles.empty);
        return;
      }
      setCell(ws.getCell(row, startCol), taskCaption(task, members), statusBarStyle(task.status));
      row += 1;
      setCell(ws.getCell(row, startCol), STATUS_LABELS[task.status] || "", styles.cardBody);
      setCell(ws.getCell(row, startCol + 1), `${task.progress || 0}%`, styles.cardBody);
      setCell(ws.getCell(row, startCol + 2), formatMonthRange(task.startDate, task.endDate), styles.cardBody);
    });
    row += 1;
  }
}

export async function buildRoadmapWorkbookXlsxBuffer(roadmap, members = [], { today = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();
  workbook.modified = new Date();

  buildTimelineSheet(workbook, roadmap, members);
  buildSwimlanesSheet(workbook, roadmap, members);
  buildNowNextLaterSheet(workbook, roadmap, members, today);

  return workbook.xlsx.writeBuffer();
}
