import { useState, useEffect, useMemo, useRef } from 'react';
import { ROADMAP_YEAR } from '../utils.js';
import StatCard from '../components/common/StatCard.jsx';
import Avatar from '../components/common/Avatar.jsx';
import { useConfirmDialog } from '../components/common/useConfirmDialog.jsx';
import { buildRoadmapWorkbookXlsxBuffer } from '../utils/roadmapWorkbook.js';
import {
  applyDependencySchedule,
  buildDependencyState,
  buildDependencyDebugEdges,
  computeDependencyLineLayout,
  ensureRoadmapTaskIds,
  sanitizePredecessorIds,
  wouldCreateDependencyCycle,
} from '../utils/roadmapDependencies.js';
import { legacyRoadmapRaw, legacyUserRoadmaps, migrateLegacyRoadmaps, normalizeRoadmaps } from './roadmapState.js';
import {
  availableTasksForLink,
  buildRoadmapLinkIndex,
  canLinkTaskToRoadmaps,
  createSingleFlight,
  normalizeTaskRoadmapLinksWithChanges,
  persistLinkedBarChange,
  persistRoadmapRepairs,
  resolveLinkedBar,
  snapshotLinkedTask,
  unlinkTaskBar,
} from '../utils/taskRoadmapLinks.js';
import { COLORS, FONT_STACK, ROADMAP_BAR_COL, ROADMAP_MILESTONE_COLORS, ROADMAP_STATUS_COLOR, segmentedWrapStyle, segmentedItemStyle } from '../theme.js';

const OWNERS = {
  viktor: { name: "Виктор",  initials: "ВИ", color: "#5856d6" },
  anna:   { name: "Анна",    initials: "АК", color: "#34c759" },
  dmitry: { name: "Дмитрий", initials: "ДМ", color: "#007aff" },
  elena:  { name: "Елена",   initials: "ЕС", color: "#ff9500" },
  pavel:  { name: "Павел",   initials: "ПР", color: "#30b0c7" },
};

const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const QUARTERS = ["Q1","Q2","Q3","Q4"];
const DEFAULT_DATE_MIN = "2024-01-01";
const DEFAULT_DATE_MAX = "2030-12-31";

const STATUS_META = {
  active:   { label: "Активна",   color: ROADMAP_STATUS_COLOR.active,   bg: "transparent" },
  draft:    { label: "Черновик",  color: ROADMAP_STATUS_COLOR.draft,    bg: "transparent" },
  archived: { label: "Архив",     color: ROADMAP_STATUS_COLOR.archived, bg: "transparent" },
};

const ROADMAP_STATUS_OPTIONS = [
  { value: "active", label: "Активна" },
  { value: "draft", label: "Черновик" },
  { value: "archived", label: "Архив" },
];

const BAR_COL = ROADMAP_BAR_COL;

const MILESTONE_COLORS = ROADMAP_MILESTONE_COLORS;
const DEFAULT_MILESTONE_COLOR = MILESTONE_COLORS[0];

function memberKey(value) {
  return value == null ? "" : String(value);
}

function normalizeMember(member, index = 0) {
  if (!member) return null;
  const id = member.id ?? member.key ?? member.slug ?? `member-${index}`;
  const name = member.name || member.displayName || member.email || "Пользователь";
  const initials = member.initials || name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "П";
  return {
    id,
    key: memberKey(id),
    name,
    initials,
    color: member.color || OWNERS[memberKey(id)]?.color || ["#007aff", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ff3b30", "#6366f1", "#14b8a6"][index % 8],
    email: member.email || "",
  };
}

function buildMemberRegistry(team = [], currentUser = null) {
  const registry = new Map();
  const source = Array.isArray(team) ? team : [];
  source.forEach((member, index) => {
    const normalized = normalizeMember(member, index);
    if (normalized) {
      registry.set(normalized.key, normalized);
    }
  });
  if (currentUser) {
    const normalizedCurrentUser = normalizeMember(currentUser, registry.size);
    if (normalizedCurrentUser && !registry.has(normalizedCurrentUser.key)) {
      registry.set(normalizedCurrentUser.key, normalizedCurrentUser);
    }
  }
  return Array.from(registry.values());
}

function getMemberById(members, id) {
  const key = memberKey(id);
  return members.find(member => member.key === key) || null;
}

function sanitizeMemberIds(memberIds, ownerId) {
  const ownerKey = memberKey(ownerId);
  return Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map(memberKey).filter(Boolean))).filter(id => id !== ownerKey);
}

function normalizeLookupValue(value) {
  return String(value || "").trim().toLowerCase();
}

function buildLegacyOwnerLookup(members) {
  const lookup = new Map();
  members.forEach(member => {
    lookup.set(member.key, member.key);
    lookup.set(normalizeLookupValue(member.name), member.key);
    if (member.email) lookup.set(normalizeLookupValue(member.email), member.key);
  });
  Object.entries(OWNERS).forEach(([legacyId, owner]) => {
    const mappedKey = lookup.get(normalizeLookupValue(owner.name)) || lookup.get(normalizeLookupValue(owner.email));
    if (mappedKey) {
      lookup.set(legacyId, mappedKey);
      lookup.set(normalizeLookupValue(owner.name), mappedKey);
    }
  });
  return lookup;
}

function resolveMemberReference(value, lookup) {
  const key = memberKey(value);
  if (!key) return "";
  return lookup.get(key) || lookup.get(normalizeLookupValue(key)) || "";
}

function migrateBarAssignments(barItem, lookup) {
  const migratedOwner = resolveMemberReference(barItem?.owner, lookup);
  const migratedMemberIds = Array.from(new Set((Array.isArray(barItem?.memberIds) ? barItem.memberIds : [])
    .map(id => resolveMemberReference(id, lookup))
    .filter(Boolean)))
    .filter(id => id !== migratedOwner);
  const changed = memberKey(barItem?.owner) !== migratedOwner
    || JSON.stringify(sanitizeMemberIds(barItem?.memberIds, barItem?.owner)) !== JSON.stringify(migratedMemberIds);
  return changed ? { ...barItem, owner: migratedOwner, memberIds: migratedMemberIds } : barItem;
}

function migrateRoadmapAssignments(roadmap, lookup) {
  const migratedOwner = resolveMemberReference(roadmap?.owner, lookup);
  const migratedMemberIds = Array.from(new Set((Array.isArray(roadmap?.memberIds) ? roadmap.memberIds : [])
    .map(id => resolveMemberReference(id, lookup))
    .filter(Boolean)))
    .filter(id => id !== migratedOwner);
  const migratedBars = (roadmap?.bars || []).map(barItem => migrateBarAssignments(barItem, lookup));
  const changedOwner = memberKey(roadmap?.owner) !== migratedOwner;
  const changedMembers = JSON.stringify(sanitizeMemberIds(roadmap?.memberIds, roadmap?.owner)) !== JSON.stringify(migratedMemberIds);
  const changedBars = migratedBars.some((barItem, index) => barItem !== (roadmap?.bars || [])[index]);
  if (!changedOwner && !changedMembers && !changedBars) return roadmap;
  return {
    ...roadmap,
    owner: migratedOwner,
    memberIds: migratedMemberIds,
    bars: migratedBars,
  };
}

function AvatarStack({ members = [], size = 22, max = 3 }) {
  const visible = members.filter(Boolean).slice(0, max);
  const extra = Math.max(0, members.filter(Boolean).length - visible.length);
  if (visible.length === 0) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", paddingLeft: 6 }}>
      {visible.map((member, index) => (
        <div key={member.key || member.id || index} style={{ marginLeft: index === 0 ? 0 : -6, border: "2px solid #fff", borderRadius: "50%" }}>
          <Avatar member={member} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <span style={{
          marginLeft: -6,
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid #fff",
          background: "rgba(15,23,42,.08)",
          color: "#86868b",
          fontSize: Math.max(10, size * 0.38),
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}>+{extra}</span>
      )}
    </div>
  );
}

function daysInRoadmapMonth(monthIndex) {
  return new Date(ROADMAP_YEAR, monthIndex + 1, 0).getDate();
}

function monthValueToDate(value, fallbackMonth = 0, endOfSpan = false, year = ROADMAP_YEAR) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return `${year}-${String(fallbackMonth + 1).padStart(2, "0")}-01`;
  }
  if (numeric >= 12) return `${year}-12-31`;
  const month = Math.max(0, Math.min(11, Math.floor(numeric)));
  const days = daysInRoadmapMonth(month);
  const fraction = Math.max(0, numeric - month);
  const day = endOfSpan
    ? Math.max(1, Math.min(days, Math.ceil(fraction * days) || 1))
    : Math.max(1, Math.min(days, Math.floor(fraction * days) + 1));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function inferRoadmapBaseYear(rm) {
  const periodMatch = String(rm?.period || "").match(/(20\d{2})/);
  if (periodMatch) return Number(periodMatch[1]);
  return ROADMAP_YEAR;
}

function buildRoadmapPeriodLabel(startDate, endDate) {
  if (!startDate || !endDate) return `Q1 – Q4 ${ROADMAP_YEAR}`;
  const startQuarter = QUARTERS[Math.floor(startDate.getMonth() / 3)];
  const endQuarter = QUARTERS[Math.floor(endDate.getMonth() / 3)];
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startQuarter} – ${endQuarter} ${startDate.getFullYear()}`;
  }
  return `${startQuarter} ${startDate.getFullYear()} – ${endQuarter} ${endDate.getFullYear()}`;
}

function normalizeBarDates(barItem, baseYear = ROADMAP_YEAR) {
  const legacyStart = monthValueToDate(barItem?.start ?? 0, 0, false, baseYear);
  const legacyEnd = monthValueToDate(barItem?.end ?? Math.min((barItem?.start ?? 0) + 1, 11.9), Math.min(Math.floor(barItem?.start ?? 0), 11), true, baseYear);
  const startDate = parseIsoDate(barItem?.startDate) || parseIsoDate(legacyStart) || parseIsoDate(`${baseYear}-01-01`);
  const endDate = parseIsoDate(barItem?.endDate) || parseIsoDate(legacyEnd) || startDate;
  const safeEndDate = endDate < startDate ? startDate : endDate;
  const owner = memberKey(barItem?.owner);
  return {
    ...barItem,
    id: String(barItem?.id || ""),
    owner,
    memberIds: sanitizeMemberIds(barItem?.memberIds, owner),
    predecessors: sanitizePredecessorIds(barItem?.predecessors, barItem?.id),
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(safeEndDate),
  };
}

function createRoadmapTaskId() {
  return `bar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function removeTaskDependencies(bars, deletedTaskId) {
  const deletedId = String(deletedTaskId || "");
  return (Array.isArray(bars) ? bars : []).map(barItem => ({
    ...barItem,
    predecessors: sanitizePredecessorIds(barItem?.predecessors, barItem?.id).filter(id => id !== deletedId),
  }));
}

function normalizeMilestoneDate(milestone, baseYear = ROADMAP_YEAR) {
  const legacyDate = monthValueToDate(milestone?.month ?? 0, 0, false, baseYear);
  const date = parseIsoDate(milestone?.date) || parseIsoDate(legacyDate) || parseIsoDate(`${baseYear}-01-01`);
  return {
    ...milestone,
    date: toIsoDate(date),
  };
}

function buildTimelineMeta(rm) {
  const barDates = rm.bars.flatMap(barItem => {
    const startDate = parseIsoDate(barItem.startDate);
    const endDate = parseIsoDate(barItem.endDate);
    return [startDate, endDate].filter(Boolean);
  });
  const milestoneDates = rm.milestones.map(milestone => parseIsoDate(milestone.date)).filter(Boolean);
  const allDates = [...barDates, ...milestoneDates];
  const minDate = allDates.length ? new Date(Math.min(...allDates.map(date => date.getTime()))) : new Date(ROADMAP_YEAR, 0, 1);
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map(date => date.getTime()))) : new Date(ROADMAP_YEAR, 11, 31);
  const rangeStart = startOfMonth(minDate);
  const rangeEnd = endOfMonth(maxDate);
  const rangeEndExclusive = addDays(rangeEnd, 1);
  const totalMs = Math.max(24 * 60 * 60 * 1000, rangeEndExclusive.getTime() - rangeStart.getTime());
  const months = [];
  for (let cursor = new Date(rangeStart.getTime()); cursor < rangeEndExclusive; cursor = addMonths(cursor, 1)) {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    months.push({
      key: `${monthStart.getFullYear()}-${monthStart.getMonth()}`,
      year: monthStart.getFullYear(),
      month: monthStart.getMonth(),
      label: MONTHS[monthStart.getMonth()],
      startDate: toIsoDate(monthStart),
      endDate: toIsoDate(monthEnd),
      leftPct: ((monthStart.getTime() - rangeStart.getTime()) / totalMs) * 100,
      widthPct: ((addDays(monthEnd, 1).getTime() - monthStart.getTime()) / totalMs) * 100,
    });
  }
  const quarterMap = new Map();
  months.forEach(month => {
    const quarterIndex = Math.floor(month.month / 3);
    const key = `${month.year}-q${quarterIndex}`;
    if (!quarterMap.has(key)) {
      quarterMap.set(key, {
        key,
        label: `${QUARTERS[quarterIndex]} ${month.year}`,
        leftPct: month.leftPct,
        widthPct: 0,
        months: [],
      });
    }
    const quarter = quarterMap.get(key);
    quarter.months.push(month);
    quarter.widthPct += month.widthPct;
  });
  return {
    startDate: toIsoDate(rangeStart),
    endDate: toIsoDate(rangeEnd),
    totalMs,
    months,
    quarters: Array.from(quarterMap.values()),
  };
}

function percentFromTimelineDate(dateValue, timeline, endExclusive = false) {
  const date = parseIsoDate(dateValue);
  const timelineStart = parseIsoDate(timeline?.startDate);
  const timelineEnd = parseIsoDate(timeline?.endDate);
  if (!date || !timelineStart || !timelineEnd) return 0;
  const effectiveDate = endExclusive ? addDays(date, 1) : date;
  const rangeStartMs = timelineStart.getTime();
  const rangeEndMs = addDays(timelineEnd, 1).getTime();
  const clampedMs = Math.max(rangeStartMs, Math.min(rangeEndMs, effectiveDate.getTime()));
  return ((clampedMs - rangeStartMs) / Math.max(1, rangeEndMs - rangeStartMs)) * 100;
}

function timelineDateFromPercent(percentValue, timeline, endExclusive = false) {
  const timelineStart = parseIsoDate(timeline?.startDate);
  const timelineEnd = parseIsoDate(timeline?.endDate);
  if (!timelineStart || !timelineEnd) return "";
  const clampedPct = Math.max(0, Math.min(100, Number(percentValue) || 0));
  const totalDays = Math.max(1, Math.round((addDays(timelineEnd, 1).getTime() - timelineStart.getTime()) / (24 * 60 * 60 * 1000)));
  const rawOffset = Math.max(0, Math.min(totalDays - 1, Math.round((clampedPct / 100) * (totalDays - 1))));
  const dayOffset = endExclusive ? Math.max(0, rawOffset - 1) : rawOffset;
  return toIsoDate(addDays(timelineStart, dayOffset));
}

function formatRoadmapMonthRange(startDateValue, endDateValue) {
  const startDate = parseIsoDate(startDateValue);
  const endDate = parseIsoDate(endDateValue);
  if (!startDate || !endDate) return "—";
  const startLabel = `${MONTHS[startDate.getMonth()]} ${startDate.getFullYear()}`;
  const endLabel = `${MONTHS[endDate.getMonth()]} ${endDate.getFullYear()}`;
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function bar(lane, title, start, end, status, progress, owner, memberIds = []) {
  return { lane, title, start, end, status, progress, owner, memberIds };
}

const SAMPLE_ROADMAPS = (() => {
  const roadmaps = [
    {
      id: "rm-it-2025-2026",
      title: "Верхнеуровневая ИТ-дорожная карта 2025-2026",
      desc: "Ключевые вехи ИТ-проекта: требования, разработка, проектные работы и мониторинг",
      owner: "dmitry",
      tag: "ИТ-проект",
      tagColor: "#ff9500",
      status: "active",
      period: "Q1 – Q4 2026",
      milestones: [
        { name: "БТ на релиз 2 согласованы", month: 0.8 },
        { name: "Релиз 1 DEV", month: 1.1 },
        { name: "Релиз 1 PROD", month: 5.9 },
        { name: "Готовность для пилота в УЦД", month: 10.7 },
      ],
      lanes: [
        { id: "it1", name: "Требования", color: "#007aff" },
        { id: "it2", name: "Разработка", color: "#5856d6" },
        { id: "it3", name: "Проектные работы", color: "#34c759" },
        { id: "it4", name: "Мониторинг", color: "#30b0c7" },
      ],
      bars: [
        bar("it1", "БТ на релиз 2: описание и согласование", 0.0, 1.2, "progress", 85, "elena"),
        bar("it1", "Разработка ЕДТ (актуализация требований)", 0.0, 5.0, "progress", 72, "anna"),

        bar("it2", "Актуализация и доработка веб-интерфейса", 0.0, 7.8, "progress", 58, "dmitry"),
        bar("it2", "Подготовка технической документации", 0.0, 10.8, "progress", 63, "pavel"),
        bar("it2", "Проектирование и разработка", 0.0, 4.9, "progress", 70, "dmitry"),
        bar("it2", "ПСИ ИБ релиза 1", 5.4, 5.9, "planned", 0, "elena"),
        bar("it2", "Постановка на сервис", 9.6, 10.8, "planned", 0, "pavel"),

        bar("it3", "Переход на этап «Реализация»", 2.2, 6.0, "progress", 48, "viktor"),
        bar("it3", "Сопровождение экспертизы и проектных решений", 1.6, 4.5, "progress", 42, "anna"),
        bar("it3", "Регистрация РИД", 9.8, 10.8, "planned", 0, "anna"),

        bar("it4", "Реализация сетевой схемы (предпрод)", 1.2, 5.0, "progress", 60, "pavel"),
        bar("it4", "Реализация сетевой схемы (прод)", 6.8, 11.0, "planned", 0, "pavel"),
        bar("it4", "Подключение полигона", 10.0, 11.3, "planned", 0, "dmitry"),
      ],
      nnl: {
        now: [
          { t: "БТ на релиз 2: описание и согласование", o: "elena" },
          { t: "Разработка ЕДТ (актуализация требований)", o: "anna" },
          { t: "Актуализация и доработка веб-интерфейса", o: "dmitry" },
        ],
        next: [
          { t: "Переход на этап «Реализация»", o: "viktor" },
          { t: "Реализация сетевой схемы (предпрод)", o: "pavel" },
        ],
        later: [
          { t: "Релиз 1 PROD", o: "dmitry" },
          { t: "Постановка на сервис", o: "pavel" },
          { t: "Подключение полигона", o: "dmitry" },
        ],
      },
    },
    {
      id: "rm-product",
      title: "Продуктовый роадмап 2026",
      desc: "Ключевые продуктовые инициативы и релизы на год",
      owner: "viktor",
      tag: "Продукт",
      tagColor: "#007aff",
      status: "active",
      period: "Q1 – Q4 2026",
      milestones: [
        { name: "Релиз 2.0", month: 2.0 },
        { name: "Beta мобайл", month: 5.2 },
        { name: "Публичный запуск", month: 8.4 },
        { name: "Итоги года", month: 11.4 },
      ],
      lanes: [
        { id: "l1", name: "Платформа", color: "#007aff" },
        { id: "l2", name: "Мобильное приложение", color: "#5856d6" },
        { id: "l3", name: "Аналитика", color: "#34c759" },
      ],
      bars: [
        bar("l1", "Новая система ролей", 0, 2.4, "done", 100, "dmitry"),
        bar("l1", "Редизайн дашборда", 1.5, 4.2, "progress", 64, "elena"),
        bar("l1", "API v3", 4.0, 7.5, "progress", 30, "dmitry"),
        bar("l1", "Биллинг", 7.0, 10.0, "planned", 0, "pavel"),
        bar("l2", "MVP мобильного приложения", 2.0, 6.0, "progress", 45, "viktor"),
        bar("l2", "Push-уведомления", 5.5, 7.4, "planned", 0, "anna"),
        bar("l2", "Офлайн-режим", 8.0, 11.0, "planned", 0, "viktor"),
        bar("l3", "Сводные отчёты", 1.0, 3.6, "done", 100, "anna"),
        bar("l3", "Прогнозная аналитика", 6.0, 9.5, "planned", 0, "anna"),
      ],
      nnl: {
        now:   [{ t: "Редизайн дашборда", o: "elena" }, { t: "MVP мобильного приложения", o: "viktor" }, { t: "API v3", o: "dmitry" }],
        next:  [{ t: "Push-уведомления", o: "anna" }, { t: "Биллинг", o: "pavel" }],
        later: [{ t: "Офлайн-режим", o: "viktor" }, { t: "Прогнозная аналитика", o: "anna" }],
      },
    },
    {
      id: "rm-platform",
      title: "Технический роадмап",
      desc: "Инфраструктура, рефакторинг и технический долг",
      owner: "dmitry",
      tag: "Инженерия",
      tagColor: "#5856d6",
      status: "active",
      period: "Q1 – Q3 2026",
      milestones: [
        { name: "Миграция БД", month: 3.0 },
        { name: "Zero-downtime", month: 7.0 },
      ],
      lanes: [
        { id: "p1", name: "Инфраструктура", color: "#5856d6" },
        { id: "p2", name: "Безопасность", color: "#ff3b30" },
        { id: "p3", name: "DevOps", color: "#30b0c7" },
      ],
      bars: [
        bar("p1", "Миграция на Kubernetes", 0, 3.0, "progress", 70, "dmitry"),
        bar("p1", "Шардирование БД", 2.5, 6.0, "planned", 0, "pavel"),
        bar("p2", "Аудит безопасности", 1.0, 2.8, "done", 100, "elena"),
        bar("p2", "SSO / SAML", 4.0, 7.0, "progress", 20, "elena"),
        bar("p3", "CI/CD pipeline", 0.5, 4.0, "progress", 55, "dmitry"),
        bar("p3", "Мониторинг", 5.0, 8.0, "planned", 0, "pavel"),
      ],
      nnl: {
        now:   [{ t: "Миграция на Kubernetes", o: "dmitry" }, { t: "CI/CD pipeline", o: "dmitry" }],
        next:  [{ t: "SSO / SAML", o: "elena" }, { t: "Шардирование БД", o: "pavel" }],
        later: [{ t: "Мониторинг", o: "pavel" }],
      },
    },
    {
      id: "rm-marketing",
      title: "Маркетинг и рост",
      desc: "Кампании, контент и привлечение пользователей",
      owner: "elena",
      tag: "Маркетинг",
      tagColor: "#ff9500",
      status: "active",
      period: "Q2 – Q4 2026",
      milestones: [
        { name: "Запуск кампании", month: 4.0 },
        { name: "Конференция", month: 9.0 },
      ],
      lanes: [
        { id: "m1", name: "Контент", color: "#ff9500" },
        { id: "m2", name: "Performance", color: "#007aff" },
        { id: "m3", name: "PR / Бренд", color: "#34c759" },
      ],
      bars: [
        bar("m1", "Контент-стратегия", 3.0, 5.5, "progress", 40, "elena"),
        bar("m1", "Серия вебинаров", 5.0, 9.0, "planned", 0, "anna"),
        bar("m2", "SEO-оптимизация", 3.5, 7.0, "progress", 25, "pavel"),
        bar("m2", "Реклама в соцсетях", 4.0, 11.0, "planned", 0, "elena"),
        bar("m3", "Ребрендинг", 6.0, 9.0, "planned", 0, "viktor"),
      ],
      nnl: {
        now:   [{ t: "Контент-стратегия", o: "elena" }, { t: "SEO-оптимизация", o: "pavel" }],
        next:  [{ t: "Серия вебинаров", o: "anna" }, { t: "Реклама в соцсетях", o: "elena" }],
        later: [{ t: "Ребрендинг", o: "viktor" }],
      },
    },
    {
      id: "rm-onboarding",
      title: "Онбординг клиентов",
      desc: "Улучшение первого опыта и удержания",
      owner: "anna",
      tag: "CX",
      tagColor: "#34c759",
      status: "draft",
      period: "Q3 – Q4 2026",
      milestones: [{ name: "Пилот", month: 8.0 }],
      lanes: [
        { id: "o1", name: "Активация", color: "#34c759" },
        { id: "o2", name: "Поддержка", color: "#007aff" },
      ],
      bars: [
        bar("o1", "Интерактивный тур", 6.5, 9.0, "planned", 0, "anna"),
        bar("o1", "Чек-листы внедрения", 7.0, 10.0, "planned", 0, "viktor"),
        bar("o2", "База знаний", 7.5, 11.0, "planned", 0, "pavel"),
      ],
      nnl: {
        now:   [],
        next:  [{ t: "Интерактивный тур", o: "anna" }],
        later: [{ t: "Чек-листы внедрения", o: "viktor" }, { t: "База знаний", o: "pavel" }],
      },
    },
    {
      id: "rm-research",
      title: "Исследования и Discovery",
      desc: "User research, интервью и гипотезы",
      owner: "pavel",
      tag: "Research",
      tagColor: "#30b0c7",
      status: "active",
      period: "Q1 – Q2 2026",
      milestones: [{ name: "Отчёт по сегментам", month: 2.5 }, { name: "Гипотезы Q3", month: 5.5 }],
      lanes: [
        { id: "r1", name: "Качественные", color: "#30b0c7" },
        { id: "r2", name: "Количественные", color: "#5856d6" },
      ],
      bars: [
        bar("r1", "Глубинные интервью", 0, 2.5, "done", 100, "pavel"),
        bar("r1", "Юзабилити-тесты", 2.0, 5.0, "progress", 60, "anna"),
        bar("r2", "Анализ воронок", 1.0, 4.0, "progress", 50, "dmitry"),
        bar("r2", "A/B эксперименты", 3.5, 6.0, "planned", 0, "pavel"),
      ],
      nnl: {
        now:   [{ t: "Юзабилити-тесты", o: "anna" }, { t: "Анализ воронок", o: "dmitry" }],
        next:  [{ t: "A/B эксперименты", o: "pavel" }],
        later: [],
      },
    },
    {
      id: "rm-ai-initiatives-2026",
      title: "Внедрение AI-инициатив",
      desc: "Сводная дорожная карта AI-ассистентов и аналитических инициатив по направлениям поддержки, АЗС, ДЦО, CRM и смежным системам",
      owner: "viktor",
      tag: "AI",
      tagColor: "#6d5bd0",
      status: "active",
      period: "Q1 – Q4 2026",
      milestones: [
        { name: "MVP 1С / АСИБ УХ", month: 5.5 },
        { name: "MVP СУ МК", month: 7.3 },
        { name: "MVP Связной", month: 7.3 },
        { name: "MVP Аналитик КЕ", month: 6.3 },
        { name: "MVP ЕЦПК", month: 6.3 },
        { name: "MVP ЕСФМ", month: 7.3 },
        { name: "MVP Siebel CRM", month: 5.5 },
        { name: "MVP TIBVOAGGREGATE", month: 5.5 },
      ],
      lanes: [
        { id: "ai-1c", name: "1С / АСИБ УХ", color: "#3b6fe0" },
        { id: "ai-sumk", name: "АЗС / СУ МК", color: "#22b07d" },
        { id: "ai-cashier", name: "АЗС / Ассистент кассира", color: "#f3a236" },
        { id: "ai-svyaznoy", name: "АЗС / Ассистент Связной", color: "#6d5bd0" },
        { id: "ai-ke", name: "АЗС / Аналитик КЕ", color: "#2bb6c4" },
        { id: "ai-ecpk", name: "ДЦО / Аналитик обращений ЕЦПК", color: "#8a96ad" },
        { id: "ai-stell", name: "ДЦО / Аналитик СТЕЛЛ АЗС", color: "#3b6fe0" },
        { id: "ai-esfm", name: "ЕСФМ / Аналитик СФМ", color: "#22b07d" },
        { id: "ai-crm", name: "CRM / Siebel CRM", color: "#f3a236" },
        { id: "ai-tibvo", name: "TIBVOAGGREGATE", color: "#2bb6c4" },
      ],
      bars: [
        bar("ai-1c", "Улучшение качества ответов по АСИБ УХ", 3.0, 4.9, "progress", 70, "dmitry"),
        bar("ai-1c", "Согласование с ИБ: LLM, формат, порядок предоставления API", 3.0, 5.9, "progress", 60, "elena"),
        bar("ai-1c", "Проработка требований к интерфейсу взаимодействия из 1С", 4.0, 5.9, "progress", 45, "anna"),
        bar("ai-1c", "Разработка интерфейса взаимодействия с сервисом поддержки ИТ решений из АСИБ УХ", 6.0, 11.9, "planned", 0, "pavel"),

        bar("ai-sumk", "Подготовка инструкций и вопрос-ответных пар", 3.0, 3.9, "progress", 90, "anna"),
        bar("ai-sumk", "Загрузка в RAG", 4.0, 5.9, "done", 100, "dmitry"),
        bar("ai-sumk", "Тестирование ответов LLM, Fine Tuning", 6.0, 6.9, "progress", 65, "elena"),
        bar("ai-sumk", "Вход в прод GPN AI", 7.0, 8.9, "planned", 0, "viktor"),

        bar("ai-cashier", "Подготовка инструкций и вопрос-ответных пар", 3.0, 3.9, "progress", 90, "anna"),
        bar("ai-cashier", "Загрузка в RAG", 4.0, 5.9, "done", 100, "dmitry"),
        bar("ai-cashier", "Тестирование ответов LLM, Fine Tuning", 6.0, 6.9, "progress", 55, "elena"),
        bar("ai-cashier", "Интеграция агента в СУ МК", 5.0, 11.9, "planned", 0, "pavel"),

        bar("ai-svyaznoy", "Получение доступа к среде разработки и LLM", 3.0, 3.9, "done", 100, "viktor"),
        bar("ai-svyaznoy", "Разработка модели", 3.0, 5.9, "progress", 70, "dmitry"),
        bar("ai-svyaznoy", "Тестирование работы модели", 5.0, 6.9, "progress", 55, "elena"),
        bar("ai-svyaznoy", "Проработка переноса MVP в продуктив", 5.0, 8.9, "planned", 0, "pavel"),

        bar("ai-ke", "Подготовка платформы, получение доступов", 1.0, 1.9, "done", 100, "viktor"),
        bar("ai-ke", "Разработка модели", 2.0, 4.9, "progress", 78, "dmitry"),
        bar("ai-ke", "Тестирование, проверка предиктивного анализа, Fine Tuning", 4.0, 5.9, "progress", 60, "elena"),
        bar("ai-ke", "Проработка переноса MVP в продуктив", 5.0, 7.9, "planned", 0, "pavel"),

        bar("ai-ecpk", "Локальная разработка", 3.0, 4.9, "progress", 70, "dmitry"),
        bar("ai-ecpk", "Выкатка в Мечту", 3.0, 5.9, "planned", 0, "viktor"),
        bar("ai-ecpk", "Эксплуатация сервиса в Мечте", 6.0, 11.9, "planned", 0, "anna"),
        bar("ai-ecpk", "Анализ возможности использования КСПД", 9.0, 11.9, "done", 100, "pavel"),

        bar("ai-stell", "Разработка решения локально", 3.0, 6.9, "progress", 72, "dmitry"),
        bar("ai-stell", "Разработка в Мечте или N1", 6.0, 11.9, "progress", 40, "anna"),
        bar("ai-stell", "Использование сервиса в Мечте или локально", 9.0, 11.9, "planned", 0, "viktor"),

        bar("ai-esfm", "Выбор и оценка пилотного кейса", 3.0, 3.9, "progress", 100, "viktor"),
        bar("ai-esfm", "Выбор модели для реализации (catboost)", 3.0, 4.9, "progress", 85, "dmitry"),
        bar("ai-esfm", "Детализация алгоритма, данные, разметка, прототипирование модели", 4.0, 6.9, "done", 100, "elena"),
        bar("ai-esfm", "Разворачивание на MAPM и обучение модели", 8.0, 11.9, "planned", 0, "pavel"),

        bar("ai-crm", "Подготовка инструкций и вопрос-ответных пар", 4.0, 4.9, "progress", 80, "anna"),
        bar("ai-crm", "Тестирование ответов LLM, Fine Tuning (gpn ai fileAssist)", 4.0, 4.9, "progress", 70, "elena"),
        bar("ai-crm", "Загрузка в RAG", 4.0, 4.9, "done", 100, "dmitry"),
        bar("ai-crm", "Интеграция с сервером web3 Siebel CRM", 5.0, 7.9, "planned", 0, "pavel"),

        bar("ai-tibvo", "Подготовка данных", 3.0, 4.9, "done", 100, "anna"),
        bar("ai-tibvo", "Тестирование в GPN AI", 4.0, 4.9, "progress", 70, "dmitry"),
        bar("ai-tibvo", "Исследование технической возможности", 4.0, 5.9, "done", 100, "pavel"),
      ],
      nnl: {
        now: [
          { t: "Согласование с ИБ: LLM, формат, порядок предоставления API", o: "elena" },
          { t: "Разработка модели", o: "dmitry" },
          { t: "Тестирование в GPN AI", o: "dmitry" },
        ],
        next: [
          { t: "MVP Siebel CRM", o: "anna" },
          { t: "MVP TIBVOAGGREGATE", o: "pavel" },
          { t: "Интеграция агента в СУ МК", o: "pavel" },
        ],
        later: [
          { t: "Эксплуатация сервиса в Мечте", o: "anna" },
          { t: "Разворачивание на MAPM и обучение модели", o: "pavel" },
          { t: "Разработка интерфейса взаимодействия с сервисом поддержки ИТ решений из АСИБ УХ", o: "pavel" },
        ],
      },
    },
    {
      id: "rm-qr-fueling-2026",
      title: "Интеграция (реализация заправки по QR)",
      desc: "Дорожная карта по интеграции сервиса \"Моя заправка\": организационный трек, архитектура, разработка СУ МК, ESB и тиражирование.",
      owner: "viktor",
      tag: "QR",
      tagColor: "#0a84ff",
      status: "active",
      period: "Июль - Сентябрь 2026",
      milestones: [
        { name: "Старт проекта", date: "2026-07-01" },
        { name: "Релиз ESB", date: "2026-08-02" },
        { name: "Релиз СУ МК", date: "2026-08-19" },
        { name: "Тираж на АЗС МСК", date: "2026-09-07" },
      ],
      lanes: [
        { id: "qr-1", name: "Трек 1. Организационный", color: "#3b6fe0" },
        { id: "qr-2", name: "Трек 2. Архитектура", color: "#22b07d" },
        { id: "qr-3", name: "Трек 3. Разработка СУ \"Мобильная карта\"", color: "#f3a236" },
        { id: "qr-4", name: "Трек 4. Разработка ESB", color: "#6d5bd0" },
        { id: "qr-5", name: "Трек 4. Тираж", color: "#2bb6c4" },
      ],
      bars: [
        {
          lane: "qr-1",
          title: "Подписание СОК с ДИТ Москвы (Курицын А.А.)",
          startDate: "2026-07-10",
          endDate: "2026-08-10",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-1",
          title: "Подключения к сервису \"Моя заправка\" (заявка, анкеты) (Курицын А.А.)",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-1",
          title: "Определение лица/организации уполномоченного представителя для подписания юридических докуменитов с ДИТ (Курицын А.А.)",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-1",
          title: "Сценарные условия поведения клиентов на АЗС (клиентский путь) (ДИТ)",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-1",
          title: "АнтиФРОД (Семенов А.А.)",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-2",
          title: "Архитектруная схема взаимодействия (инфопотоки) (Иванов В.В.)",
          startDate: "2026-07-09",
          endDate: "2026-07-10",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-2",
          title: "Сетевая схема взаимодействия (сети, МСЭ, протоколы) (Соколов М.А)",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-2",
          title: "Подготовка, согласование и реализация АЗ и ЗНИ (Соколов М.А)",
          startDate: "2026-07-23",
          endDate: "2026-08-13",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-2",
          title: "Организация доступа к тестовому и продуктивному контуру ДИТа (Пристромов Д.Ю.)",
          startDate: "2026-07-20",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-3",
          title: "Получение и анализ документации (api) (Асатрян Г.Г.)",
          startDate: "2026-07-09",
          endDate: "2026-07-19",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-3",
          title: "Разработка интеграции (Асатрян Г.Г.)",
          startDate: "2026-07-19",
          endDate: "2026-08-09",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-3",
          title: "Актуализация документации, выход на АК, получение протокола (Асатрян Г.Г.)",
          startDate: "2026-07-19",
          endDate: "2026-07-29",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-3",
          title: "Выпуск релиза СУ МК (Асатрян Г.Г.)",
          startDate: "2026-08-09",
          endDate: "2026-08-19",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-4",
          title: "Получение и анализ документации (api) (Гриненко И.А.)",
          startDate: "2026-07-09",
          endDate: "2026-07-10",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-4",
          title: "Разработка интеграции (Гриненко И.А.)",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-4",
          title: "Актуализация документации, выход на АК, получение протокола (Гриненко И.А.)",
          startDate: "2026-07-23",
          endDate: "2026-08-13",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-4",
          title: "Выпуск релиза (Гриненко И.А.)",
          startDate: "2026-07-23",
          endDate: "2026-08-02",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-5",
          title: "Тестирование на продуктовом полигоне по сценарным условиям (строка 16) (Абаньшин А.С.)",
          startDate: "2026-08-23",
          endDate: "2026-08-28",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
        {
          lane: "qr-5",
          title: "Тиражирование СУ МК на АЗС МСК (Абаньшин А.С.)",
          startDate: "2026-08-28",
          endDate: "2026-09-07",
          status: "planned",
          progress: 0,
          owner: "viktor",
          memberIds: [],
        },
      ],
      nnl: {
        now: [
          { t: "Подписание СОК с ДИТ Москвы", o: "viktor" },
          { t: "Архитектруная схема взаимодействия (инфопотоки)", o: "viktor" },
        ],
        next: [
          { t: "Разработка интеграции", o: "viktor" },
          { t: "Подготовка, согласование и реализация АЗ и ЗНИ", o: "viktor" },
        ],
        later: [
          { t: "Выпуск релиза СУ МК", o: "viktor" },
          { t: "Тиражирование СУ МК на АЗС МСК", o: "viktor" },
        ],
      },
    },
    {
      id: "rm-2025",
      title: "Роадмап 2025 (архив)",
      desc: "Завершённые инициативы прошлого года",
      owner: "viktor",
      tag: "Архив",
      tagColor: "#8e8e93",
      status: "archived",
      period: "Q1 – Q4 2025",
      milestones: [{ name: "Запуск v1", month: 6.0 }],
      lanes: [{ id: "a1", name: "Продукт", color: "#8e8e93" }],
      bars: [
        bar("a1", "Первый релиз", 0, 6.0, "done", 100, "viktor"),
        bar("a1", "Стабилизация", 6.0, 11.0, "done", 100, "dmitry"),
      ],
      nnl: { now: [], next: [], later: [] },
    },
  ];

  roadmaps.forEach(rm => {
    const total = rm.bars.length || 1;
    rm.progress = Math.round(rm.bars.reduce((a, b) => a + b.progress, 0) / total);
    rm.tasksDone = rm.bars.filter(b => b.status === "done").length;
    rm.tasksTotal = rm.bars.length;
  });

  return roadmaps;
})();

// ── Вспомогательные компоненты ─────────────────────────────────────────────

function ProgressRing({ value, size = 46 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const col = value === 100 ? "#34c759" : value >= 50 ? "#007aff" : "#ff9500";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} stroke="rgba(118,118,128,.08)" strokeWidth="5" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={col} strokeWidth="5" fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
        style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" transform={`rotate(90 ${size/2} ${size/2})`}
        textAnchor="middle" dominantBaseline="central"
        fontSize="12" fontWeight="700" fill="#1f2d4d">{value}%</text>
    </svg>
  );
}

function MiniTimeline({ rm }) {
  const col = { done: "#34c759", progress: "#007aff", planned: "#c7d2e6" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 0" }}>
      {rm.bars.slice(0, 5).map((b, i) => (
        <div key={i} style={{ position: "relative", height: 7, background: "#f1f4fa", borderRadius: 999 }}>
          <span style={{
            position: "absolute", top: 0, height: 7, borderRadius: 999,
            left: `${percentFromTimelineDate(b.startDate, rm.timeline)}%`,
            width: `${Math.max(1.2, percentFromTimelineDate(b.endDate, rm.timeline, true) - percentFromTimelineDate(b.startDate, rm.timeline))}%`,
            background: col[b.status],
            minWidth: 4,
          }} />
        </div>
      ))}
    </div>
  );
}

// ── Иконки ────────────────────────────────────────────────────────────────

function DiamondIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 9-8 9-8-9z"/>
    </svg>
  );
}

// ── Карточки каталога ──────────────────────────────────────────────────────

function RoadmapCard({ rm, onOpen, members }) {
  const sm = STATUS_META[rm.status] || STATUS_META.archived;
  const ownerMember = getMemberById(members, rm.owner);
  const coExecutors = sanitizeMemberIds(rm.memberIds, rm.owner).map(id => getMemberById(members, id)).filter(Boolean);
  return (
    <button onClick={() => onOpen(rm.id)} style={{
      textAlign: "left", background: "#fff", border: "1px solid rgba(15,23,42,.08)",
      borderRadius: 16, padding: 22, boxShadow: "0 1px 4px rgba(37,99,235,.05)",
      display: "flex", flexDirection: "column", gap: 14, cursor: "pointer",
      transition: "transform .15s, box-shadow .18s", fontFamily: FONT_STACK, width: "100%",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(37,99,235,.12)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 4px rgba(37,99,235,.05)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999, color: rm.tagColor, background: rm.tagColor + "1f" }}>{rm.tag}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 999, color: sm.color, background: sm.bg }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: sm.color }} />{sm.label}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1d1d1f", letterSpacing: -.4, marginBottom: 4 }}>{rm.title}</div>
        <div style={{ fontSize: 13, color: "#a1a1a6", lineHeight: 1.5 }}>{rm.desc}</div>
      </div>
      <MiniTimeline rm={rm} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(118,118,128,.06)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ProgressRing value={rm.progress} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f" }}>{rm.tasksDone}/{rm.tasksTotal} задач</div>
            <div style={{ fontSize: 12, color: "#a1a1a6", marginTop: 2 }}>{rm.period}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#5856d6" }}>
            <DiamondIcon size={13} />{rm.milestones.length}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <Avatar member={ownerMember} size={30} />
            <AvatarStack members={coExecutors} size={24} max={2} />
          </span>
        </div>
      </div>
    </button>
  );
}

function RoadmapRow({ rm, onOpen, members }) {
  const sm = STATUS_META[rm.status] || STATUS_META.archived;
  const ownerMember = getMemberById(members, rm.owner);
  const coExecutors = sanitizeMemberIds(rm.memberIds, rm.owner).map(id => getMemberById(members, id)).filter(Boolean);
  return (
    <button onClick={() => onOpen(rm.id)} style={{
      display: "flex", alignItems: "center", gap: 18, textAlign: "left",
      background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 12,
      padding: "14px 20px", boxShadow: "0 1px 3px rgba(37,99,235,.05)",
      cursor: "pointer", fontFamily: FONT_STACK, width: "100%",
      transition: "border-color .15s, box-shadow .15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,122,255,.3)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(15,23,42,.08)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(37,99,235,.05)"; }}
    >
      <span style={{ width: 5, alignSelf: "stretch", borderRadius: 999, background: rm.tagColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f" }}>{rm.title}</div>
        <div style={{ fontSize: 13, color: "#a1a1a6", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rm.desc}</div>
      </div>
      <div style={{ fontSize: 13, color: "#3a3a3c", fontWeight: 500, width: 120, flexShrink: 0 }}>{rm.period}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#5856d6", width: 80, flexShrink: 0 }}>
        <DiamondIcon size={13} />{rm.milestones.length} вех
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 160, flexShrink: 0 }}>
        <div style={{ flex: 1, height: 7, background: "rgba(118,118,128,.08)", borderRadius: 999, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", background: "#007aff", borderRadius: 999, width: rm.progress + "%" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1d1d1f", width: 36 }}>{rm.progress}%</span>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 999, color: sm.color, background: sm.bg }}>{sm.label}</span>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <Avatar member={ownerMember} size={28} />
        <AvatarStack members={coExecutors} size={22} max={2} />
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
    </button>
  );
}

// ── Каталог ────────────────────────────────────────────────────────────────

// ── Модалка создания/редактирования задачи (bar) ──────────────────────────

const STATUS_OPTIONS = [
  { value: "planned",  label: "Запланировано" },
  { value: "progress", label: "В работе" },
  { value: "done",     label: "Завершено" },
];

function BarFormModal({ bar: initBar, bars = [], lanes, members, defaultOwnerId, linkedTask, onUnlink, onClose, onSave, onDelete }) {
  const isEdit = Boolean(initBar);
  const taskId = initBar?.id || "";
  const [title,    setTitle]    = useState(initBar?.title    || "");
  const [lane,     setLane]     = useState(initBar?.lane     || lanes[0]?.id || "");
  const [status,   setStatus]   = useState(initBar?.status   || "planned");
  const [progress, setProgress] = useState(initBar?.progress ?? 0);
  const [startDate, setStartDate] = useState(initBar?.startDate || monthValueToDate(initBar?.start ?? 0, 0));
  const [endDate,   setEndDate]   = useState(initBar?.endDate || monthValueToDate(initBar?.end ?? 3, 2, true));
  const [owner,    setOwner]    = useState(memberKey(initBar?.owner || defaultOwnerId || members[0]?.id || "viktor"));
  const [memberIds, setMemberIds] = useState(sanitizeMemberIds(initBar?.memberIds, initBar?.owner || defaultOwnerId));
  const [predecessors, setPredecessors] = useState(sanitizePredecessorIds(initBar?.predecessors, initBar?.id));
  const [candidatePredecessorId, setCandidatePredecessorId] = useState("");
  const [error,    setError]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mutationFlight = useRef(createSingleFlight());

  const predecessorOptions = useMemo(() => (
    (Array.isArray(bars) ? bars : [])
      .filter(item => item?.id && item.id !== taskId)
      .map(item => ({
        id: item.id,
        title: item.title || "Без названия",
        laneName: lanes.find(laneItem => laneItem.id === item.lane)?.name || "",
        disabled: isEdit ? wouldCreateDependencyCycle(bars, item.id, taskId) : false,
      }))
  ), [bars, isEdit, lanes, taskId]);

  function addPredecessor() {
    if (!candidatePredecessorId) return;
    if (predecessors.includes(candidatePredecessorId)) {
      setError("Такая зависимость уже добавлена");
      return;
    }
    const option = predecessorOptions.find(item => item.id === candidatePredecessorId);
    if (!option || option.disabled) {
      setError("Эта связь создаст цикл и не может быть сохранена");
      return;
    }
    setPredecessors(list => [...list, candidatePredecessorId]);
    setCandidatePredecessorId("");
    setError("");
  }

  function removePredecessor(predecessorId) {
    setPredecessors(list => list.filter(id => id !== predecessorId));
    setError("");
  }

  function toggleMember(id) {
    const key = memberKey(id);
    setMemberIds(list => list.includes(key) ? list.filter(item => item !== key) : [...list, key]);
  }

  async function runMutation(operation) {
    return mutationFlight.current.run(async () => {
      setSubmitting(true);
      try {
        const saved = await operation();
        if (saved) onClose();
        return saved;
      } catch (mutationError) {
        setError(mutationError?.message || "Не удалось сохранить изменения");
        return null;
      } finally {
        setSubmitting(false);
      }
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    if (!start || !end) {
      setError("Укажите корректные даты начала и окончания");
      return;
    }
    if (end < start) {
      setError("Дата окончания должна быть позже даты начала");
      return;
    }
    await runMutation(() => onSave({
        id: initBar?.id,
        title,
        lane,
        status,
        progress: Number(progress),
        startDate,
        endDate,
        owner,
        memberIds: sanitizeMemberIds(memberIds, owner),
        predecessors: sanitizePredecessorIds(predecessors, initBar?.id),
      }));
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1px solid rgba(15,23,42,.08)", borderRadius: 11,
    padding: "0 12px", fontFamily: FONT_STACK, fontSize: 14, outline: "none",
    color: "#1d1d1f", boxSizing: "border-box", background: "#fff",
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#3a3a3c", marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 480, background: "rgba(255,255,255,.85)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", border: "1px solid rgba(255,255,255,.9)", borderRadius: 22,
        padding: 28, boxShadow: "0 32px 80px rgba(15,23,42,.18)",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1d1d1f", letterSpacing: -.4, marginBottom: 4 }}>
          {isEdit ? "Редактировать задачу" : "Новая задача"}
        </div>

        <fieldset disabled={submitting} style={{ display: "contents" }}>

        {linkedTask && <div style={{ fontSize: 12, fontWeight: 700, color: "#007aff" }}>Связана с обычной задачей</div>}

        <div>
          <label style={labelStyle}>Название *</label>
          <input value={title} onChange={e => { setTitle(e.target.value); setError(""); }} required autoFocus disabled={Boolean(linkedTask)} style={inputStyle} placeholder="Название задачи" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Дорожка</label>
            <select value={lane} onChange={e => setLane(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Статус</label>
            <div style={{ ...segmentedWrapStyle, display: "flex", width: "100%" }}>
              {STATUS_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => setStatus(o.value)}
                  style={{ ...segmentedItemStyle(status === o.value, o.value === "done" ? COLORS.greenText : o.value === "progress" ? COLORS.accent : COLORS.gray), flex: 1, padding: "8px 4px", whiteSpace: "nowrap" }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Начало периода</label>
            <input
              type="date"
              min={DEFAULT_DATE_MIN}
              max={DEFAULT_DATE_MAX}
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setError(""); }}
              style={{ ...inputStyle, cursor: "pointer" }}
            />
          </div>
          <div>
            <label style={labelStyle}>Конец периода</label>
            <input
              type="date"
              min={DEFAULT_DATE_MIN}
              max={DEFAULT_DATE_MAX}
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setError(""); }}
              style={{ ...inputStyle, cursor: "pointer" }}
            />
          </div>
          <div>
            <label style={labelStyle}>Прогресс %</label>
            <input type="number" min="0" max="100" value={progress} onChange={e => setProgress(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: "#ff3b30", marginTop: -6 }}>{error}</div>}

        <div>
          <label style={labelStyle}>Владелец</label>
          <select value={owner} disabled={Boolean(linkedTask)} onChange={e => { const nextOwner = e.target.value; setOwner(nextOwner); setMemberIds(list => sanitizeMemberIds(list, nextOwner)); }} style={{ ...inputStyle, cursor: "pointer" }}>
            {members.map(member => (
              <option key={member.key} value={member.key}>{member.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Соисполнители</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {members.filter(member => member.key !== owner).map(member => {
              const active = memberIds.includes(member.key);
              return (
                <button
                  key={member.key}
                  type="button"
                  onClick={() => toggleMember(member.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 999,
                    border: "1.5px solid " + (active ? member.color : "#e8f2ff"),
                    background: active ? member.color + "18" : "rgba(118,118,128,.03)",
                    color: active ? member.color : "#86868b",
                    cursor: "pointer",
                    fontFamily: FONT_STACK,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Avatar member={member} size={22} />
                  <span>{member.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Предшественники</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {predecessors.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {predecessors.map(predecessorId => {
                  const predecessor = bars.find(item => item.id === predecessorId);
                  return (
                    <span
                      key={predecessorId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: "1px solid #e8f2ff",
                        background: "rgba(118,118,128,.03)",
                        color: "#1d1d1f",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <span>{predecessor?.title || predecessorId}</span>
                      <button
                        type="button"
                        onClick={() => removePredecessor(predecessorId)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#a1a1a6",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#a1a1a6" }}>Нет зависимостей по FS</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <select
                value={candidatePredecessorId}
                onChange={e => { setCandidatePredecessorId(e.target.value); setError(""); }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Выберите задачу-предшественника</option>
                {predecessorOptions.map(option => (
                  <option
                    key={option.id}
                    value={option.id}
                    disabled={option.disabled || predecessors.includes(option.id)}
                  >
                    {option.title}{option.laneName ? ` · ${option.laneName}` : ""}{option.disabled ? " · цикл" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addPredecessor}
                style={{
                  padding: "0 16px",
                  borderRadius: 999,
                  border: "none",
                  background: "#007aff",
                  color: "#fff",
                  fontFamily: FONT_STACK,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 4 }}>
          <div>
            {linkedTask && (
              <button type="button" onClick={() => runMutation(() => onUnlink?.())} style={{
                padding: "8px 18px", borderRadius: 999, border: "none", marginRight: 8,
                background: "rgba(0,122,255,.08)", color: "#007aff", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Отвязать</button>
            )}
            {isEdit && (
              <button type="button" onClick={() => runMutation(onDelete)} style={{
                padding: "8px 18px", borderRadius: 999, border: "none",
                background: "rgba(118,118,128,.08)", color: "#e03131", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Удалить</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              padding: "8px 20px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.12)", color: "#1d1d1f", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Отмена</button>
            <button type="submit" disabled={submitting} style={{
              padding: "8px 22px", borderRadius: 999, border: "none",
              background: "#007aff", color: "#fff", boxShadow: "0 2px 8px rgba(0,122,255,.28)",
              fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{submitting ? "Сохраняем…" : "Сохранить"}</button>
          </div>
        </div>
        </fieldset>
      </form>
    </div>
  );
}

function TaskLinkModal({ tasks, members, onClose, onLink }) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const singleFlight = useRef(createSingleFlight());
  const filtered = tasks.filter(task => String(task.title || "").toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.30)", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "75vh", overflow: "auto", background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 32px 80px rgba(15,23,42,.18)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Связать обычную задачу</div>
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по названию" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #dbeafe", borderRadius: 10, marginBottom: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(task => {
            const assignee = getMemberById(members, task.assigneeId ?? task.ownerId);
            return <button key={task.id} type="button" disabled={submitting} onClick={() => singleFlight.current.run(async () => {
              setSubmitting(true);
              try {
                const linked = await onLink(task);
                if (linked) onClose();
              } finally {
                setSubmitting(false);
              }
            })} style={{ textAlign: "left", border: "1px solid #e8f2ff", borderRadius: 12, padding: 12, background: "#fff", cursor: "pointer" }}>
              <div style={{ fontWeight: 700 }}>{task.title || "Без названия"}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{task.column || "Беклог"} · {task.due || "—"} · {assignee?.name || "Не назначен"}</div>
            </button>;
          })}
          {!filtered.length && <div style={{ color: "#64748b", padding: 12 }}>Доступных задач нет</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button type="button" onClick={onClose} style={{ border: "none", borderRadius: 999, padding: "8px 18px", cursor: "pointer" }}>Отмена</button></div>
      </div>
    </div>
  );
}

// ── Модалка добавления/редактирования вехи ───────────────────────────────

function MilestoneFormModal({ milestone, onClose, onSave, onDelete }) {
  const isEdit = Boolean(milestone);
  const [name, setName] = useState(milestone?.name || "");
  const [date, setDate] = useState(milestone?.date || monthValueToDate(milestone?.month ?? 0));
  const [color, setColor] = useState(milestone?.color || DEFAULT_MILESTONE_COLOR);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ name, date, color });
    onClose();
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1px solid rgba(15,23,42,.08)", borderRadius: 11,
    padding: "0 12px", fontFamily: FONT_STACK, fontSize: 14, outline: "none",
    color: "#1d1d1f", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#3a3a3c", marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 380, background: "rgba(255,255,255,.85)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", border: "1px solid rgba(255,255,255,.9)", borderRadius: 22,
        padding: 28, boxShadow: "0 32px 80px rgba(15,23,42,.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1d1d1f", letterSpacing: -.4, marginBottom: 4 }}>
          {isEdit ? "Редактировать веху" : "Новая веха"}
        </div>

        <div>
          <label style={labelStyle}>Название *</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus style={inputStyle} placeholder="Релиз 2.0" />
        </div>

        <div>
          <label style={labelStyle}>Дата вехи</label>
          <input
            type="date"
            min={DEFAULT_DATE_MIN}
            max={DEFAULT_DATE_MAX}
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Цвет вехи</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MILESTONE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: c,
                  border: "none",
                  outline: color === c ? `3px solid ${c}` : "3px solid transparent",
                  outlineOffset: 2,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 4 }}>
          <div>
            {isEdit && (
              <button type="button" onClick={() => { onDelete(); onClose(); }} style={{
                padding: "8px 18px", borderRadius: 999, border: "none",
                background: "rgba(118,118,128,.08)", color: "#e03131", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Удалить</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              padding: "8px 20px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.12)", color: "#1d1d1f", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Отмена</button>
            <button type="submit" style={{
              padding: "8px 22px", borderRadius: 999, border: "none",
              background: "#007aff", color: "#fff", boxShadow: "0 2px 8px rgba(0,122,255,.28)",
              fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{isEdit ? "Сохранить" : "Добавить"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Модалка создания/редактирования карты ─────────────────────────────────

const TAG_COLORS = ["#007aff","#5856d6","#34c759","#ff9500","#ff3b30","#30b0c7","#8e8e93"];

const LANE_COLORS = ["#007aff","#5856d6","#34c759","#ff9500","#ff3b30","#30b0c7","#8e8e93","#ff2d55"];

function RoadmapFormModal({ roadmap, members, defaultOwnerId, onClose, onSave, onDelete }) {
  const isEdit = Boolean(roadmap);
  const [title, setTitle]       = useState(roadmap?.title       || "");
  const [desc, setDesc]         = useState(roadmap?.desc        || "");
  const [tag, setTag]           = useState(roadmap?.tag         || "");
  const [tagColor, setTagColor] = useState(roadmap?.tagColor    || TAG_COLORS[0]);
  const [owner, setOwner]       = useState(memberKey(roadmap?.owner || defaultOwnerId || members[0]?.id || "viktor"));
  const [memberIds, setMemberIds] = useState(sanitizeMemberIds(roadmap?.memberIds, roadmap?.owner || defaultOwnerId));
  const [status, setStatus]     = useState(roadmap?.status      || "active");
  const [lanes, setLanes]       = useState(roadmap?.lanes       || []);
  const [newLaneName, setNewLaneName] = useState("");
  const [newLaneColor, setNewLaneColor] = useState(LANE_COLORS[0]);

  function toggleMember(id) {
    const key = memberKey(id);
    setMemberIds(list => list.includes(key) ? list.filter(item => item !== key) : [...list, key]);
  }

  function addLane() {
    if (!newLaneName.trim()) return;
    setLanes(ls => [...ls, { id: "lane-" + Date.now(), name: newLaneName.trim(), color: newLaneColor }]);
    setNewLaneName("");
  }

  function removeLane(id) {
    setLanes(ls => ls.filter(l => l.id !== id));
  }

  function updateLane(id, patch) {
    setLanes(ls => ls.map(lane => lane.id === id ? { ...lane, ...patch } : lane));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const normalizedLanes = lanes
      .map(lane => ({ ...lane, name: String(lane.name || "").trim() }))
      .filter(lane => lane.name);
    onSave({ ...(roadmap || {}), title, desc, tag, tagColor, owner, memberIds: sanitizeMemberIds(memberIds, owner), status, lanes: normalizedLanes });
    onClose();
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1px solid rgba(15,23,42,.08)", borderRadius: 11,
    padding: "0 12px", fontFamily: FONT_STACK, fontSize: 14, outline: "none",
    color: "#1d1d1f", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#3a3a3c", marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 500, background: "rgba(255,255,255,.85)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", border: "1px solid rgba(255,255,255,.9)", borderRadius: 22,
        padding: 28, boxShadow: "0 32px 80px rgba(15,23,42,.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1d1d1f", letterSpacing: -.4, marginBottom: 4 }}>
          {isEdit ? "Редактировать карту" : "Новая дорожная карта"}
        </div>

        <div>
          <label style={labelStyle}>Название *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required autoFocus style={inputStyle} placeholder="Название карты" />
        </div>

        <div>
          <label style={labelStyle}>Описание</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} placeholder="Краткое описание" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Тег</label>
            <input value={tag} onChange={e => setTag(e.target.value)} style={inputStyle} placeholder="Продукт" />
          </div>
          <div>
            <label style={labelStyle}>Период</label>
            <input value={roadmap?.period || "Автоматически по срокам задач"} readOnly style={{ ...inputStyle, background: "rgba(118,118,128,.03)", color: "#a1a1a6" }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Цвет тега</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TAG_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setTagColor(c)} style={{
                width: 28, height: 28, borderRadius: "50%", background: c, border: "none",
                outline: tagColor === c ? `3px solid ${c}` : "3px solid transparent",
                outlineOffset: 2, cursor: "pointer",
              }} />
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Владелец</label>
          <select value={owner} onChange={e => { const nextOwner = e.target.value; setOwner(nextOwner); setMemberIds(list => sanitizeMemberIds(list, nextOwner)); }} style={{ ...inputStyle, cursor: "pointer" }}>
            {members.map(member => (
              <option key={member.key} value={member.key}>{member.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Соисполнители карты</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {members.filter(member => member.key !== owner).map(member => {
              const active = memberIds.includes(member.key);
              return (
                <button
                  key={member.key}
                  type="button"
                  onClick={() => toggleMember(member.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 999,
                    border: "1.5px solid " + (active ? member.color : "#e8f2ff"),
                    background: active ? member.color + "18" : "rgba(118,118,128,.03)",
                    color: active ? member.color : "#86868b",
                    cursor: "pointer",
                    fontFamily: FONT_STACK,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Avatar member={member} size={22} />
                  <span>{member.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Статус карты</label>
          <div style={{ ...segmentedWrapStyle, gap: 0 }}>
            {ROADMAP_STATUS_OPTIONS.map(option => {
              const active = status === option.value;
              const meta = STATUS_META[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  style={{ ...segmentedItemStyle(active, meta.color), display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 13 }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lanes */}
        <div>
          <label style={labelStyle}>Дорожки (направления)</label>
          {lanes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {lanes.map(l => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(118,118,128,.03)", borderRadius: 8, border: "1px solid rgba(15,23,42,.08)" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                  <input
                    value={l.name}
                    onChange={e => updateLane(l.id, { name: e.target.value })}
                    placeholder="Название дорожки"
                    style={{ ...inputStyle, flex: 1, height: 32, background: "#fff" }}
                  />
                  <button type="button" onClick={() => removeLane(l.id)} style={{ border: "none", background: "none", color: "#a1a1a6", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {LANE_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewLaneColor(c)} style={{
                  width: 20, height: 20, borderRadius: "50%", background: c, border: "none",
                  outline: newLaneColor === c ? `2px solid ${c}` : "2px solid transparent",
                  outlineOffset: 2, cursor: "pointer", flexShrink: 0,
                }} />
              ))}
            </div>
            <input value={newLaneName} onChange={e => setNewLaneName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addLane())}
              placeholder="Название дорожки" style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={addLane} style={{
              padding: "0 14px", borderRadius: 8, border: "none", background: "#007aff",
              color: "#fff", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}>+</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
          {isEdit ? (
            <button type="button" onClick={() => onDelete?.(roadmap)} style={{
              padding: "8px 18px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.08)", color: "#e03131", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Удалить карту</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{
              padding: "8px 20px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.12)", color: "#1d1d1f", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Отмена</button>
            <button type="submit" style={{
              padding: "8px 22px", borderRadius: 999, border: "none",
              background: "#007aff", color: "#fff", boxShadow: "0 2px 8px rgba(0,122,255,.28)",
              fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Сохранить</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function CatalogView({ roadmaps, members, onOpen, onNew }) {
  const [view, setView] = useState("grid");
  const [filter, setFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [query, setQuery] = useState("");

  const counts = {
    all: roadmaps.length,
    active: roadmaps.filter(r => r.status === "active").length,
    draft: roadmaps.filter(r => r.status === "draft").length,
    archived: roadmaps.filter(r => r.status === "archived").length,
  };

  const tags = Array.from(
    new Map(
      roadmaps
        .filter(r => (r.tag || "").trim())
        .map(r => {
          const tag = r.tag.trim();
          return [tag.toLowerCase(), { label: tag, color: r.tagColor || "#8e8e93", count: 0 }];
        })
    ).values()
  ).map(tag => ({
    ...tag,
    count: roadmaps.filter(r => (r.tag || "").trim().toLowerCase() === tag.label.toLowerCase()).length,
  }));

  const normalizedQuery = query.trim().toLowerCase();
  const list = roadmaps.filter(r => {
    const tag = (r.tag || "").trim();
    return (
      (filter === "all" || r.status === filter) &&
      (tagFilter === "all" || tag.toLowerCase() === tagFilter) &&
      (
        !normalizedQuery ||
        r.title.toLowerCase().includes(normalizedQuery) ||
        r.desc.toLowerCase().includes(normalizedQuery) ||
        tag.toLowerCase().includes(normalizedQuery)
      )
    );
  });

  const totalMiles = roadmaps.reduce((a, r) => a + r.milestones.length, 0);
  const avgProgress = Math.round(roadmaps.reduce((a, r) => a + r.progress, 0) / roadmaps.length);

  const FCHIP = [
    { id: "all", label: "Все карты" },
    { id: "active", label: "Активные" },
    { id: "draft", label: "Черновики" },
    { id: "archived", label: "Архив" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Статы */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatCard label="ВСЕГО КАРТ" value={roadmaps.length} sub="в портфеле" color="#1d1d1f" />
        <StatCard label="АКТИВНЫХ" value={counts.active} sub="в работе" color="#007aff" />
        <StatCard label="ВЕХ" value={totalMiles} sub="ключевых событий" color="#5856d6" />
        <StatCard label="СРЕДНИЙ ПРОГРЕСС" value={avgProgress + "%"} sub="по портфелю" color="#34c759" />
      </div>

      {/* Тулбар */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {FCHIP.map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: filter === c.id ? "#e8f2ff" : "#fff",
              border: filter === c.id ? "1px solid rgba(0,122,255,.3)" : "1px solid rgba(15,23,42,.08)",
              color: filter === c.id ? "#007aff" : "#3a3a3c",
              fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              {c.label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                background: filter === c.id ? "#fff" : "rgba(118,118,128,.08)",
                color: filter === c.id ? "#007aff" : "#a1a1a6",
              }}>{counts[c.id]}</span>
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setTagFilter("all")} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: tagFilter === "all" ? "rgba(118,118,128,.03)" : "#fff",
              border: tagFilter === "all" ? "1px solid rgba(0,122,255,.3)" : "1px solid rgba(15,23,42,.08)",
              color: tagFilter === "all" ? "#007aff" : "#86868b",
              fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 999,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              Все теги
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                background: tagFilter === "all" ? "#fff" : "rgba(118,118,128,.08)",
                color: tagFilter === "all" ? "#007aff" : "#a1a1a6",
              }}>{roadmaps.length}</span>
            </button>
            {tags.map(tag => {
              const active = tagFilter === tag.label.toLowerCase();
              return (
                <button key={tag.label} onClick={() => setTagFilter(tag.label.toLowerCase())} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: active ? tag.color + "18" : "#fff",
                  border: active ? `1px solid ${tag.color}55` : "1px solid rgba(15,23,42,.08)",
                  color: active ? tag.color : "#86868b",
                  fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 999,
                  cursor: "pointer", fontFamily: FONT_STACK,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: tag.color }} />
                  {tag.label}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                    background: active ? "#fff" : "rgba(118,118,128,.08)",
                    color: active ? tag.color : "#a1a1a6",
                  }}>{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {/* Поиск */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 999, padding: "7px 14px", width: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск карт…"
            style={{ border: "none", outline: "none", fontSize: 13, color: "#1d1d1f", background: "none", width: "100%", fontFamily: FONT_STACK }} />
        </div>
        {/* Grid/List */}
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 999, padding: 4, gap: 2 }}>
          {[["grid", "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"], ["list", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]].map(([id, d]) => (
            <button key={id} onClick={() => setView(id)} style={{
              width: 30, height: 30, borderRadius: 999, border: "none", cursor: "pointer",
              background: view === id ? "#007aff" : "none",
              color: view === id ? "#fff" : "#a1a1a6", display: "grid", placeItems: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={d}/></svg>
            </button>
          ))}
        </div>
        {/* Новая карта */}
        <button onClick={onNew} style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "8px 16px", borderRadius: 10, border: "none",
          background: "#007aff", color: "#fff",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK,
          boxShadow: "0 2px 8px rgba(37,99,235,.25)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Новая карта
        </button>
      </div>

      {/* Контент */}
      {list.length === 0 ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "#a1a1a6", fontSize: 15 }}>Карты не найдены</div>
      ) : view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {list.map(rm => <RoadmapCard key={rm.id} rm={rm} members={members} onOpen={onOpen} />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(rm => <RoadmapRow key={rm.id} rm={rm} members={members} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

// ── Timeline (Gantt) ───────────────────────────────────────────────────────

const TIMELINE_TASK_ROW_HEIGHT = 54;
const TIMELINE_LANE_ROW_HEIGHT = 40;

function GanttBar({
  b,
  hover,
  setHover,
  idx,
  onBarClick,
  onBarPointerStart,
  onBarLinkClick,
  members,
  previewLeft = null,
  previewWidth = null,
  isDragging = false,
  linkMode = false,
  isLinked = false,
  hasIncomingLink = false,
  hasOutgoingLink = false,
  isHighlighted = false,
}) {
  const c = BAR_COL[b.status] || BAR_COL.planned;
  const left = previewLeft ?? percentFromTimelineDate(b.startDate, b.timeline);
  const width = previewWidth ?? Math.max(0.9, percentFromTimelineDate(b.endDate, b.timeline, true) - left);
  const isHov = hover === idx || isHighlighted;
  const ownerMember = getMemberById(members, b.owner);
  const coExecutors = sanitizeMemberIds(b.memberIds, b.owner).map(id => getMemberById(members, id)).filter(Boolean);
  return (
    <div style={{ height: TIMELINE_TASK_ROW_HEIGHT, display: "flex", alignItems: "center", position: "relative" }}>
      <div
        onDoubleClick={() => !linkMode && !isDragging && onBarClick && onBarClick(b, idx)}
        onClick={() => linkMode && onBarLinkClick && onBarLinkClick(b, idx)}
        onPointerDown={event => !linkMode && onBarPointerStart && onBarPointerStart(event, b, idx, "move")}
        onMouseEnter={() => setHover(idx)}
        onMouseLeave={() => setHover(null)}
        style={{
          position: "absolute", height: 30, borderRadius: 9,
          left: left + "%", width: width + "%",
          background: c.bar, display: "flex", alignItems: "center",
          padding: "0 10px", gap: 8, overflow: "visible", cursor: linkMode ? "crosshair" : isDragging ? "grabbing" : "grab",
          boxShadow: isHov ? "0 8px 20px rgba(31,45,77,.24)" : "0 2px 6px rgba(31,45,77,.14)",
          transform: isHov ? "translateY(-1px)" : "none",
          transition: "transform .12s, box-shadow .15s", zIndex: isHov ? 3 : 2,
          minWidth: 8,
          userSelect: "none",
          touchAction: "none",
          outline: linkMode && isLinked ? "2px solid rgba(255,255,255,.72)" : "none",
        }}
      >
        {!linkMode && isHov && width > 2.5 && (
          <>
            <span
              onPointerDown={event => onBarPointerStart && onBarPointerStart(event, b, idx, "resize-start")}
              style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 10,
                cursor: "ew-resize", zIndex: 2, background: "rgba(255,255,255,.08)",
              }}
            />
            <span
              onPointerDown={event => onBarPointerStart && onBarPointerStart(event, b, idx, "resize-end")}
              style={{
                position: "absolute", right: 0, top: 0, bottom: 0, width: 10,
                cursor: "ew-resize", zIndex: 2, background: "rgba(255,255,255,.08)",
              }}
            />
          </>
        )}
        {b.status === "progress" && (
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: b.progress + "%", background: "rgba(255,255,255,.22)", zIndex: 0 }} />
        )}
        {hasIncomingLink && (
          <span style={{
            position: "absolute",
            left: -4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 0 0 2px rgba(37,99,235,.24)",
            zIndex: 1,
          }} />
        )}
        {hasOutgoingLink && (
          <span style={{
            position: "absolute",
            right: -8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 0 0 2px rgba(37,99,235,.24)",
            zIndex: 1,
          }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", zIndex: 1, paddingLeft: hasIncomingLink ? 8 : 0 }}>{b.title}</span>
        <span style={{ marginLeft: "auto", zIndex: 1, flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
          <Avatar member={ownerMember} size={20} />
          <AvatarStack members={coExecutors} size={18} max={2} />
        </span>
      </div>
    </div>
  );
}

function TimelineView({ rm, members, onBarClick, onBarDrag, onMilestoneClick, onMilestoneDrag, linkMode = false, linkSourceId = "", onLinkTaskSelect }) {
  const [hover, setHover] = useState(null);
  const [milestoneDrag, setMilestoneDrag] = useState(null);
  const [barDrag, setBarDrag] = useState(null);
  const gridRef = useRef(null);
  const timeline = rm.timeline;
  const today = new Date();
  const todayIso = toIsoDate(today);
  const todayPct = percentFromTimelineDate(todayIso, timeline);
  const showToday = todayPct >= 0 && todayPct <= 100
    && today >= parseIsoDate(timeline.startDate)
    && today <= addDays(parseIsoDate(timeline.endDate), 1);

  const rows = [];
  rm.lanes.forEach(lane => {
    const laneBars = rm.bars.filter(b => b.lane === lane.id);
    rows.push({ type: "lane", lane });
    laneBars.forEach(b => rows.push({ type: "bar", b: { ...b, timeline }, idx: rm.bars.indexOf(b) }));
  });

  let offsetTop = 0;
  const positionedRows = rows.map(row => {
    const top = offsetTop;
    offsetTop += row.type === "lane" ? TIMELINE_LANE_ROW_HEIGHT : TIMELINE_TASK_ROW_HEIGHT;
    return { ...row, top };
  });
  const gridHeight = positionedRows.length ? offsetTop : 120;
  const chartWidth = Math.max(720, timeline.months.length * 110);
  const dependencyState = useMemo(() => buildDependencyState(rm.bars), [rm.bars]);
  const hoveredBar = hover == null ? null : positionedRows.find(row => row.type === "bar" && row.idx === hover)?.b || null;
  const focusTaskId = hoveredBar?.id || linkSourceId || "";
  const highlightedTaskIds = useMemo(() => {
    if (!focusTaskId) return new Set();
    return new Set([
      focusTaskId,
      ...(dependencyState.predecessorsById.get(focusTaskId) || []),
      ...(dependencyState.successorsById.get(focusTaskId) || []),
    ]);
  }, [dependencyState.predecessorsById, dependencyState.successorsById, focusTaskId]);
  const rowByTaskId = useMemo(() => {
    const map = new Map();
    positionedRows.forEach(row => {
      if (row.type === "bar" && row.b?.id) map.set(row.b.id, row);
    });
    return map;
  }, [positionedRows]);
  const dependencyDebugEdges = useMemo(() => buildDependencyDebugEdges(rm.bars), [rm.bars]);
  const dependencyLines = useMemo(() => (
    positionedRows
      .filter(row => row.type === "bar")
      .flatMap(row => {
        const predecessors = dependencyState.predecessorsById.get(row.b.id) || [];
        return predecessors.map(predecessorId => {
          const predecessorRow = rowByTaskId.get(predecessorId);
          if (!predecessorRow) return null;
          const geometry = computeDependencyLineLayout({
            predecessorEndPct: percentFromTimelineDate(predecessorRow.b.endDate, timeline, true),
            targetStartPct: percentFromTimelineDate(row.b.startDate, timeline),
            chartWidth,
            predecessorTop: predecessorRow.top,
            targetTop: row.top,
            rowHeight: TIMELINE_TASK_ROW_HEIGHT,
          });
          return {
            id: `${predecessorId}->${row.b.id}`,
            predecessorId,
            taskId: row.b.id,
            ...geometry,
            active: highlightedTaskIds.has(predecessorId) || highlightedTaskIds.has(row.b.id),
          };
        }).filter(Boolean);
      })
  ), [chartWidth, dependencyState.predecessorsById, highlightedTaskIds, positionedRows, rowByTaskId, timeline]);

  const sideW = 340;
  const stickyTop = 0;

  useEffect(() => {
    if (!milestoneDrag) return undefined;

    function updateDrag(clientX) {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const nextPct = ((clientX - rect.left) / rect.width) * 100;
      const deltaX = clientX - milestoneDrag.startClientX;
      setMilestoneDrag(current => current ? {
        ...current,
        pct: Math.max(0, Math.min(100, nextPct)),
        moved: current.moved || Math.abs(deltaX) >= 5,
      } : current);
    }

    function handlePointerMove(event) {
      updateDrag(event.clientX);
    }

    function finishDrag(clientX) {
      const current = milestoneDrag;
      if (!current) return;
      updateDrag(clientX);
      const finalPct = Math.max(0, Math.min(100, ((clientX - (gridRef.current?.getBoundingClientRect().left || 0)) / Math.max(1, gridRef.current?.getBoundingClientRect().width || 1)) * 100));
      const finalDate = timelineDateFromPercent(finalPct, timeline);
      setMilestoneDrag(null);
      if (current.moved) {
        onMilestoneDrag && onMilestoneDrag(current.idx, { ...current.milestone, date: finalDate });
      } else {
        onMilestoneClick && onMilestoneClick(current.milestone, current.idx);
      }
    }

    function handlePointerUp(event) {
      finishDrag(event.clientX);
    }

    function handlePointerCancel() {
      setMilestoneDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [milestoneDrag, onMilestoneClick, onMilestoneDrag, timeline]);

  useEffect(() => {
    if (!barDrag || linkMode) return undefined;

    function computePct(clientX) {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return barDrag.left;
      return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    }

    function handlePointerMove(event) {
      const currentPct = computePct(event.clientX);
      const deltaPct = currentPct - barDrag.startPct;
      setBarDrag(current => {
        if (!current) return current;
        const moved = current.moved || Math.abs(event.clientX - current.startClientX) >= 5;
        if (current.mode === "move") {
          const nextLeft = Math.max(0, Math.min(100 - current.width, current.left + deltaPct));
          return { ...current, previewLeft: nextLeft, previewWidth: current.width, moved };
        }
        if (current.mode === "resize-start") {
          const rightEdge = current.left + current.width;
          const nextLeft = Math.max(0, Math.min(rightEdge - 0.9, current.left + deltaPct));
          return { ...current, previewLeft: nextLeft, previewWidth: Math.max(0.9, rightEdge - nextLeft), moved };
        }
        const nextWidth = Math.max(0.9, Math.min(100 - current.left, current.width + deltaPct));
        return { ...current, previewLeft: current.left, previewWidth: nextWidth, moved };
      });
    }

    function handlePointerUp() {
      const current = barDrag;
      setBarDrag(null);
      if (!current) return;
      if (!current.moved) return;
      const nextStartDate = timelineDateFromPercent(current.previewLeft, timeline);
      const endPct = current.previewLeft + current.previewWidth;
      const nextEndDate = timelineDateFromPercent(endPct, timeline, true);
      onBarDrag && onBarDrag(current.idx, { ...current.bar, startDate: nextStartDate, endDate: nextEndDate });
    }

    function handlePointerCancel() {
      setBarDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [barDrag, linkMode, onBarClick, onBarDrag, timeline]);

  function startMilestoneDrag(event, milestone, idx, milestonePct) {
    event.preventDefault();
    event.stopPropagation();
    setMilestoneDrag({
      idx,
      milestone,
      pct: milestonePct,
      startPct: milestonePct,
      startClientX: event.clientX,
      moved: false,
    });
  }

  function startBarPointerAction(event, bar, idx, mode) {
    if (linkMode) return;
    event.preventDefault();
    event.stopPropagation();
    const left = percentFromTimelineDate(bar.startDate, timeline);
    const width = Math.max(0.9, percentFromTimelineDate(bar.endDate, timeline, true) - left);
    const rect = gridRef.current?.getBoundingClientRect();
    const startPct = rect && rect.width > 0 ? Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)) : left;
    setBarDrag({
      idx,
      mode,
      bar,
      left,
      width,
      previewLeft: left,
      previewWidth: width,
      startPct,
      startClientX: event.clientX,
      moved: false,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ overflow: "auto", maxHeight: "min(70vh, 960px)" }}>
        {/* Шапка */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(15,23,42,.06)", position: "sticky", top: stickyTop, background: "#fff", zIndex: 8 }}>
          <div style={{
            width: sideW,
            flexShrink: 0,
            padding: "14px 20px",
            fontSize: 12,
            fontWeight: 700,
            color: "#a1a1a6",
            borderRight: "1px solid rgba(15,23,42,.06)",
            position: "sticky",
            top: stickyTop,
            left: 0,
            zIndex: 10,
            background: "#fff",
            boxShadow: "8px 0 16px rgba(15,23,42,.04)",
          }}>
            Направление / задача
          </div>
          <div style={{ flex: 1, minWidth: Math.max(720, timeline.months.length * 110), display: "flex" }}>
            {timeline.quarters.map((quarter, qi) => (
              <div key={quarter.key} style={{ width: `${quarter.widthPct}%`, borderRight: qi < timeline.quarters.length - 1 ? "1px solid rgba(15,23,42,.06)" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 700, padding: "10px 0 6px", textAlign: "center", color: "#1d1d1f" }}>
                  {quarter.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${quarter.months.length}, 1fr)` }}>
                  {quarter.months.map(month => (
                    <div key={month.key} style={{ fontSize: 11, color: "#a1a1a6", textAlign: "center", paddingBottom: 8 }}>
                      {month.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Тело */}
        <div style={{ display: "flex" }}>
          {/* Левый сайдбар */}
          <div style={{
            width: sideW,
            flexShrink: 0,
            borderRight: "1px solid rgba(15,23,42,.06)",
            position: "sticky",
            left: 0,
            zIndex: 6,
            background: "#fff",
            boxShadow: "8px 0 16px rgba(15,23,42,.04)",
          }}>
            {positionedRows.map((r, i) => r.type === "lane" ? (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: TIMELINE_LANE_ROW_HEIGHT, padding: "0 20px", background: "rgba(118,118,128,.04)", fontSize: 12, fontWeight: 700, color: "#1d1d1f" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.lane.color, flexShrink: 0 }} />
                {r.lane.name}
              </div>
            ) : (
              <div key={i} style={{ minHeight: TIMELINE_TASK_ROW_HEIGHT, padding: "7px 20px 7px 28px", display: "flex", alignItems: "center", fontSize: 13, lineHeight: 1.25, color: highlightedTaskIds.has(r.b.id) ? "#1d1d1f" : "#3a3a3c", fontWeight: highlightedTaskIds.has(r.b.id) ? 600 : 400, whiteSpace: "normal", overflow: "visible", overflowWrap: "anywhere" }} title={r.b.title}>
                {r.b.title}
              </div>
            ))}
          </div>

          {/* Сетка Gantt */}
          <div ref={gridRef} style={{ flex: 1, minWidth: Math.max(720, timeline.months.length * 110), position: "relative", minHeight: gridHeight, userSelect: milestoneDrag ? "none" : undefined, cursor: milestoneDrag ? "grabbing" : linkMode ? "crosshair" : undefined }}>
            {/* Вертикальные линии */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
              {timeline.months.map((month, i) => (
                <span key={i} style={{
                  position: "absolute", top: 0, bottom: 0, width: 1,
                  background: month.month % 3 === 0 ? "rgba(15,23,42,.08)" : "rgba(118,118,128,.06)",
                  left: `${month.leftPct}%`,
                }} />
              ))}
              <span style={{ position: "absolute", top: 0, bottom: 0, width: 1, background: "rgba(15,23,42,.08)", left: "100%" }} />
            </div>
            {/* Линия сегодня */}
            {showToday && (
              <div style={{ position: "absolute", top: 0, bottom: 0, width: 1.5, background: "#ff3b30", left: todayPct + "%", zIndex: 3 }}>
                <span style={{
                  position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)",
                  background: "#ff3b30", color: "#fff", fontSize: 10, fontWeight: 700,
                  padding: "2px 7px", borderRadius: "0 0 6px 6px", whiteSpace: "nowrap",
                }}>сегодня</span>
              </div>
            )}
            {dependencyLines.length > 0 && (
              <svg
                viewBox={`0 0 ${chartWidth} ${gridHeight}`}
                preserveAspectRatio="none"
                style={{ position: "absolute", inset: 0, width: "100%", height: gridHeight, pointerEvents: "none", zIndex: 2 }}
              >
                {dependencyLines.map(line => (
                  <path
                    key={line.id}
                    d={`M ${line.startX} ${line.startY} H ${line.middleX} V ${line.endY} H ${line.endX}`}
                    fill="none"
                    stroke={line.active ? "#007aff" : "#a1a1a6"}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}
            {/* Вехи */}
            {rm.milestones.map((m, i) => {
              const milestoneColor = m.color || DEFAULT_MILESTONE_COLOR;
              const milestonePct = milestoneDrag?.idx === i ? milestoneDrag.pct : percentFromTimelineDate(m.date, timeline);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute", top: 0, bottom: 0, zIndex: 3,
                    left: `${milestonePct}%`, transform: "translateX(-50%)",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    pointerEvents: "none",
                  }}>
                  <span
                    onPointerDown={event => startMilestoneDrag(event, m, i, milestonePct)}
                    title="Редактировать веху"
                    style={{ color: milestoneColor, marginTop: 4, cursor: milestoneDrag?.idx === i ? "grabbing" : "grab", pointerEvents: "auto", touchAction: "none" }}
                  ><DiamondIcon size={14} /></span>
                  <span
                    onPointerDown={event => startMilestoneDrag(event, m, i, milestonePct)}
                    title="Редактировать веху"
                    style={{ position: "absolute", top: 22, fontSize: 10, fontWeight: 700, color: milestoneColor, background: milestoneColor + "1f", padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap", cursor: milestoneDrag?.idx === i ? "grabbing" : "grab", pointerEvents: "auto", touchAction: "none" }}
                  >{m.name}</span>
                  <span style={{ position: "absolute", top: 20, bottom: 0, width: 1, background: `repeating-linear-gradient(180deg, ${milestoneColor}66 0 4px, transparent 4px 8px)`, pointerEvents: "none" }} />
                </div>
              );
            })}
            {/* Строки */}
            {positionedRows.map((r, i) => r.type === "lane" ? (
              <div key={i} style={{ height: TIMELINE_LANE_ROW_HEIGHT, background: "rgba(118,118,128,.04)" }} />
            ) : (
              <GanttBar
                key={i}
                b={r.b}
                idx={r.idx}
                hover={hover}
                setHover={setHover}
                onBarClick={onBarClick}
                onBarPointerStart={startBarPointerAction}
                onBarLinkClick={onLinkTaskSelect}
                members={members}
                previewLeft={barDrag?.idx === r.idx ? barDrag.previewLeft : null}
                previewWidth={barDrag?.idx === r.idx ? barDrag.previewWidth : null}
                isDragging={barDrag?.idx === r.idx}
                linkMode={linkMode}
                isLinked={(dependencyState.predecessorsById.get(r.b.id) || []).length > 0 || (dependencyState.successorsById.get(r.b.id) || []).length > 0}
                hasIncomingLink={(dependencyState.predecessorsById.get(r.b.id) || []).length > 0}
                hasOutgoingLink={(dependencyState.successorsById.get(r.b.id) || []).length > 0}
                isHighlighted={highlightedTaskIds.has(r.b.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Empty state — нет дорожек */}
      {positionedRows.length === 0 && (
        <div style={{ padding: "32px 24px", textAlign: "center", color: "#a1a1a6", fontSize: 13 }}>
          Нет дорожек. Нажмите «Редактировать» карту и добавьте направления.
        </div>
      )}

      {/* Легенда */}
      <div style={{ display: "flex", gap: 20, padding: "12px 20px", borderTop: "1px solid rgba(15,23,42,.06)" }}>
        {[["#34c759","Завершено"],["#007aff","В работе"],["#c7c7cc","Запланировано"]].map(([col, label]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a3a3c" }}>
            <span style={{ width: 14, height: 10, borderRadius: 3, background: col, display: "inline-block" }} />{label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#5856d6", fontWeight: 600 }}>
          <DiamondIcon size={12} />Веха
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a3a3c" }}>
          <svg width="24" height="8" viewBox="0 0 24 8"><path d="M0 4 H17" stroke="#a1a1a6" strokeWidth="1" strokeDasharray="2 2" fill="none"/><path d="M21 4 l-4 -2.5 M21 4 l-4 2.5" stroke="#a1a1a6" strokeWidth="1" fill="none"/></svg>
          Зависимость
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a3a3c" }}>
          <span style={{ width: 2, height: 12, background: "#ff3b30", borderRadius: 1, display: "inline-block" }} />
          Сегодня
        </span>
      </div>

      {dependencyDebugEdges.length > 0 && (
        <div style={{ padding: "0 20px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8e8e93", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Debug связей
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {dependencyDebugEdges.map(edge => (
              <div key={`${edge.sourceId}->${edge.targetId}`} style={{ fontSize: 12, color: "#3a3a3c", fontFamily: FONT_STACK }}>
                <span style={{ color: "#1d1d1f", fontWeight: 600 }}>{edge.sourceTitle}</span>
                <span style={{ color: "#8e8e93", padding: "0 6px" }}>→</span>
                <span style={{ color: "#1d1d1f", fontWeight: 600 }}>{edge.targetTitle}</span>
                <span style={{ color: "#a1a1a6", paddingLeft: 8, fontSize: 11 }}>{edge.sourceId} → {edge.targetId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Swimlanes ──────────────────────────────────────────────────────────────

function SwimlanesView({ rm, members, onBarClick }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, overflowX: "auto" }}>
      {rm.lanes.map(lane => {
        const bars = rm.bars.filter(b => b.lane === lane.id);
        return (
          <div key={lane.id} style={{ flexShrink: 0, width: 300, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(118,118,128,.04)", borderRadius: 10, borderLeft: `4px solid ${lane.color}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: lane.color }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", flex: 1 }}>{lane.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#a1a1a6", background: "#fff", padding: "2px 8px", borderRadius: 999 }}>{bars.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {bars.map((b, i) => {
                const c = BAR_COL[b.status] || BAR_COL.planned;
                const label = b.status === "done" ? "Завершено" : b.status === "progress" ? b.progress + "%" : "Запланировано";
                const ownerMember = getMemberById(members, b.owner);
                const coExecutors = sanitizeMemberIds(b.memberIds, b.owner).map(id => getMemberById(members, id)).filter(Boolean);
                return (
                  <div key={i} onClick={() => onBarClick && onBarClick(b, rm.bars.indexOf(b))} style={{ background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 10, padding: "13px 14px", boxShadow: "0 1px 3px rgba(37,99,235,.05)", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{b.title}</span>
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        <Avatar member={ownerMember} size={22} />
                        <AvatarStack members={coExecutors} size={20} max={3} />
                      </span>
                    </div>
                    <div style={{ height: 6, background: "rgba(118,118,128,.08)", borderRadius: 999, overflow: "hidden", margin: "10px 0 7px" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 999, background: c.bar, width: b.progress + "%" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: c.bar, fontWeight: 600 }}>{label}</span>
                      <span style={{ color: "#a1a1a6" }}>{formatRoadmapMonthRange(b.startDate, b.endDate)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Now / Next / Later ─────────────────────────────────────────────────────

function buildNowNextLater(rm) {
  const today = startOfDay(new Date());
  const active = [];
  const upcoming = [];

  (rm.bars || []).forEach((barItem, idx) => {
    if (barItem.status === "done") return;
    const item = { ...barItem, idx };
    const startDate = parseIsoDate(barItem.startDate);
    const endDate = parseIsoDate(barItem.endDate);
    const startsNowOrPast = startDate && startDate <= today;
    const endsFuture = endDate && endDate >= today;
    if (barItem.status === "progress" || (startsNowOrPast && endsFuture)) {
      active.push(item);
      return;
    }
    upcoming.push(item);
  });

  active.sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)) || String(a.startDate).localeCompare(String(b.startDate)));
  upcoming.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.endDate).localeCompare(String(b.endDate)));

  return {
    now: active,
    next: upcoming.slice(0, 4),
    later: upcoming.slice(4),
  };
}

function NNLView({ rm, members, onBarClick }) {
  const grouped = buildNowNextLater(rm);
  const cols = [
    { key: "now",   label: "Now",   sub: "Сейчас в работе", color: "#007aff" },
    { key: "next",  label: "Next",  sub: "Следующий шаг",   color: "#5856d6" },
    { key: "later", label: "Later", sub: "В перспективе",   color: "#8e8e93" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, padding: 20 }}>
      {cols.map(col => (
        <div key={col.key} style={{ background: "rgba(118,118,128,.04)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 12px", color: col.color }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>{col.label}</span>
            <span style={{ fontSize: 12, color: "#a1a1a6", fontWeight: 500 }}>{col.sub}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#a1a1a6", background: "#fff", padding: "1px 8px", borderRadius: 999 }}>{grouped[col.key].length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grouped[col.key].length === 0 && (
              <div style={{ textAlign: "center", color: "#a1a1a6", fontSize: 12, padding: 20, border: "1.5px dashed #d6deeb", borderRadius: 8 }}>Пусто</div>
            )}
            {grouped[col.key].map((item, i) => {
              const statusColor = (BAR_COL[item.status] || BAR_COL.planned).bar;
              const label = item.status === "progress" ? `${item.progress}%` : "Запланировано";
              const ownerMember = getMemberById(members, item.owner);
              const coExecutors = sanitizeMemberIds(item.memberIds, item.owner).map(id => getMemberById(members, id)).filter(Boolean);
              return (
              <div key={i} onClick={() => onBarClick && onBarClick(item, item.idx)} style={{
                display: "flex", flexDirection: "column", gap: 9,
                background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderTop: `3px solid ${col.color}`,
                borderRadius: 8, padding: "12px 13px", fontSize: 13, fontWeight: 600, color: "#1d1d1f",
                boxShadow: "0 1px 3px rgba(37,99,235,.04)", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span>{item.title}</span>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    <Avatar member={ownerMember} size={22} />
                    <AvatarStack members={coExecutors} size={20} max={3} />
                  </span>
                </div>
                <div style={{ height: 6, background: "rgba(118,118,128,.08)", borderRadius: 999, overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${item.progress || 0}%`, height: "100%", background: statusColor, borderRadius: 999 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: statusColor }}>{label}</span>
                  <span style={{ color: "#a1a1a6", whiteSpace: "nowrap" }}>{formatRoadmapMonthRange(item.startDate, item.endDate)}</span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
// ── Детальный вид ──────────────────────────────────────────────────────────

function LaneFormModal({ onClose, onSave }) {
  const [name, setName]   = useState("");
  const [color, setColor] = useState(LANE_COLORS[0]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ id: "lane-" + Date.now(), name: name.trim(), color });
    onClose();
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1px solid rgba(15,23,42,.08)", borderRadius: 11,
    padding: "0 12px", fontFamily: FONT_STACK, fontSize: 14, outline: "none",
    color: "#1d1d1f", boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 380, background: "rgba(255,255,255,.85)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", border: "1px solid rgba(255,255,255,.9)", borderRadius: 22,
        padding: 28, boxShadow: "0 32px 80px rgba(15,23,42,.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f" }}>Новая дорожка</div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3a3c", marginBottom: 5 }}>Название *</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus style={inputStyle} placeholder="Платформа" />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3a3c", marginBottom: 8 }}>Цвет</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {LANE_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{
                width: 26, height: 26, borderRadius: "50%", background: c, border: "none",
                outline: color === c ? `3px solid ${c}` : "3px solid transparent",
                outlineOffset: 2, cursor: "pointer",
              }} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{
            padding: "8px 20px", borderRadius: 999, border: "none",
            background: "rgba(118,118,128,.12)", color: "#1d1d1f", fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Отмена</button>
          <button type="submit" style={{
            padding: "8px 22px", borderRadius: 999, border: "none",
            background: "#007aff", color: "#fff", boxShadow: "0 2px 8px rgba(0,122,255,.28)",
            fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Добавить</button>
        </div>
      </form>
    </div>
  );
}

function RoadmapDetail({ rm, members, defaultOwnerId, availableTasks, taskById, onBack, onEdit, onExportJson, onExportCsv, onExportXls, onExportPdf, onSaveBar, onDeleteBar, onUnlinkBar, onLinkOrdinaryTask, onSaveMilestone, onDeleteMilestone, onSaveLane, onLinkTasks }) {
  const [tab, setTab]               = useState("timeline");
  const [barModal, setBarModal]     = useState(null); // null | "new" | { bar, idx }
  const [mileModal, setMileModal]   = useState(null); // null | "new" | { milestone, idx }
  const [laneModal, setLaneModal]   = useState(false);
  const [taskLinkModal, setTaskLinkModal] = useState(false);
  const [linkMode, setLinkMode]     = useState(false);
  const [linkSourceId, setLinkSourceId] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const printRootRef = useRef(null);
  const sm = STATUS_META[rm.status] || STATUS_META.archived;
  const ownerMember = getMemberById(members, rm.owner);
  const roadmapCoExecutors = sanitizeMemberIds(rm.memberIds, rm.owner).map(id => getMemberById(members, id)).filter(Boolean);
  const TABS = [
    { id: "timeline", label: "Timeline" },
    { id: "swim",     label: "Дорожки" },
    { id: "nnl",      label: "Now · Next · Later" },
  ];

  useEffect(() => {
    if (!linkMode) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setLinkMode(false);
        setLinkSourceId("");
        setLinkMessage("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [linkMode]);

  function toggleLinkMode() {
    setLinkMode(current => {
      const next = !current;
      if (!next) {
        setLinkSourceId("");
        setLinkMessage("");
      } else {
        setLinkMessage("Выберите задачу-источник, затем зависимую задачу");
      }
      return next;
    });
  }

  async function handleLinkTaskSelect(bar) {
    if (!bar?.id) return;
    if (!linkMode) return;
    if (!linkSourceId) {
      setLinkSourceId(bar.id);
      setLinkMessage(`Источник: ${bar.title}. Теперь выберите зависимую задачу`);
      return;
    }
    if (linkSourceId === bar.id) {
      setLinkMessage("Нельзя связать задачу саму с собой");
      return;
    }
    const result = onLinkTasks ? await onLinkTasks(linkSourceId, bar.id) : { ok: false };
    if (result?.ok) {
      setLinkMode(false);
      setLinkSourceId("");
      setLinkMessage("");
      return;
    }
    setLinkMessage(result?.message || "Связь не удалось создать");
  }

  return (
    <div ref={printRootRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Шапка */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(37,99,235,.05)" }}>
        <button data-print-hidden="true" onClick={onBack} style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "rgba(118,118,128,.06)",
          border: "none", cursor: "pointer", display: "grid", placeItems: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round"><polyline points="15 6 9 12 15 18"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a1a1a6", fontWeight: 600, marginBottom: 6 }}>
            <span style={{ cursor: "pointer", color: "#007aff" }} onClick={onBack}>Дорожные карты</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
            <span>{rm.tag}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1d1d1f" }}>{rm.title}</h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, color: sm.color, background: sm.bg, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sm.color }} />{sm.label}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#a1a1a6" }}>{rm.desc}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
          <div data-print-hidden="true" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => onExportPdf(printRootRef.current, tab)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.08)", color: "#3a3a3c", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/></svg>
              PDF
            </button>
            <button onClick={onExportCsv} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.08)", color: "#3a3a3c", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
              CSV
            </button>
            <button onClick={onExportXls} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.08)", color: "#3a3a3c", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M9 4v16"/><path d="M15 4v16"/><path d="M4 9h16"/><path d="M4 15h16"/></svg>
              XLSX
            </button>
            <button onClick={onExportJson} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.08)", color: "#3a3a3c", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
              Экспорт JSON
            </button>
            <button onClick={onEdit} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 999, border: "none",
              background: "rgba(118,118,128,.08)", color: "#007aff", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Редактировать
            </button>
          </div>
          <div style={{ display: "flex", gap: 20, paddingLeft: 20, borderLeft: "1px solid rgba(15,23,42,.06)" }}>
            {[
              ["Владелец", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar member={ownerMember} size={22} />{ownerMember?.name || "Не назначен"}</div>],
              ["Соисполнители", roadmapCoExecutors.length > 0 ? <AvatarStack members={roadmapCoExecutors} size={22} max={4} /> : "—"],
              ["Период", rm.period],
              ["Прогресс", <span style={{ color: "#007aff", fontWeight: 700 }}>{rm.progress}%</span>],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#a1a1a6", letterSpacing: ".05em" }}>{k.toUpperCase()}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", display: "flex", alignItems: "center", gap: 6 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div data-print-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 999, padding: 4, gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: FONT_STACK,
              background: tab === t.id ? "#007aff" : "none",
              color: tab === t.id ? "#fff" : "#a1a1a6",
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {tab === "timeline" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 4 }}>
            {linkMessage && (
              <span style={{ fontSize: 12, color: linkSourceId ? "#007aff" : "#86868b", maxWidth: 320, textAlign: "right" }}>
                {linkMessage}
              </span>
            )}
            <button onClick={toggleLinkMode} style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 999,
              border: "none",
              background: linkMode ? "#e8f2ff" : "rgba(118,118,128,.08)",
              color: linkMode ? "#007aff" : "#3a3a3c", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              {linkMode ? "Отменить связь" : "Связать"}
            </button>
          </div>
        )}
        <button onClick={() => setLaneModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 999, border: "none", background: "rgba(118,118,128,.08)", color: "#3a3a3c", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/></svg>
          Дорожка
        </button>
        <button onClick={() => setMileModal("new")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 999, border: "none", background: "rgba(118,118,128,.08)", color: "#1d1d1f", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK }}>
          <DiamondIcon size={14} />Добавить веху
        </button>
        <button onClick={() => setBarModal("new")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 999, border: "none", background: "#007aff", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK, boxShadow: "0 2px 8px rgba(0,122,255,.28)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Добавить задачу
        </button>
        <button onClick={() => setTaskLinkModal(true)} style={{ display: "inline-flex", alignItems: "center", padding: "8px 16px", borderRadius: 999, border: "none", color: "#007aff", cursor: "pointer", fontFamily: FONT_STACK, fontWeight: 600 }}>Связать обычную задачу</button>
      </div>

      {taskLinkModal && <TaskLinkModal tasks={availableTasks} members={members} onClose={() => setTaskLinkModal(false)} onLink={onLinkOrdinaryTask} />}

      {/* Модалка дорожки */}
      {laneModal && (
        <LaneFormModal
          onClose={() => setLaneModal(false)}
          onSave={onSaveLane}
        />
      )}

      {/* Модалка вехи */}
      {mileModal && (
        <MilestoneFormModal
          milestone={mileModal === "new" ? null : mileModal.milestone}
          onClose={() => setMileModal(null)}
          onSave={data => onSaveMilestone(mileModal === "new" ? null : mileModal.idx, data)}
          onDelete={mileModal !== "new" ? () => onDeleteMilestone(mileModal.idx) : undefined}
        />
      )}

      {/* Модалка задачи */}
      {barModal && (
        <BarFormModal
          bar={barModal === "new" ? null : barModal.bar}
          bars={rm.bars}
          lanes={rm.lanes}
          members={members}
          defaultOwnerId={defaultOwnerId}
          linkedTask={barModal !== "new" && barModal.bar.linkedTaskId != null ? taskById.get(String(barModal.bar.linkedTaskId)) : null}
          onUnlink={barModal !== "new" ? () => onUnlinkBar(barModal.idx) : undefined}
          onClose={() => setBarModal(null)}
          onSave={data => onSaveBar(barModal === "new" ? null : barModal.idx, data)}
          onDelete={barModal !== "new" ? () => onDeleteBar(barModal.idx) : undefined}
        />
      )}

      {/* Контент вкладки */}
      <div style={{ background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 16, overflow: "visible", boxShadow: "0 1px 4px rgba(37,99,235,.05)" }}>
        {tab === "timeline" && <TimelineView rm={rm} members={members} onBarClick={(b, idx) => setBarModal({ bar: b, idx })} onBarDrag={(idx, data) => onSaveBar(idx, data)} onMilestoneClick={(milestone, idx) => setMileModal({ milestone, idx })} onMilestoneDrag={(idx, data) => onSaveMilestone(idx, data)} linkMode={linkMode} linkSourceId={linkSourceId} onLinkTaskSelect={handleLinkTaskSelect} />}
        {tab === "swim"     && <SwimlanesView rm={rm} members={members} onBarClick={(b, idx) => setBarModal({ bar: b, idx })} />}
        {tab === "nnl"      && <NNLView rm={rm} members={members} onBarClick={(b, idx) => setBarModal({ bar: b, idx })} />}
      </div>
    </div>
  );
}

// ── Главный экспорт ────────────────────────────────────────────────────────

function recalc(rm) {
  const baseYear = inferRoadmapBaseYear(rm);
  const barsWithIds = ensureRoadmapTaskIds(rm?.id || "roadmap", rm.bars || []);
  const bars = applyDependencySchedule(barsWithIds.map(barItem => normalizeBarDates(barItem, baseYear)));
  const milestones = (rm.milestones || []).map(milestone => normalizeMilestoneDate(milestone, baseYear));
  const timeline = buildTimelineMeta({ ...rm, bars, milestones });
  const total = bars.length || 1;
  const owner = memberKey(rm?.owner);
  return {
    ...rm,
    owner,
    memberIds: sanitizeMemberIds(rm?.memberIds, owner),
    bars,
    milestones,
    timeline,
    period: buildRoadmapPeriodLabel(parseIsoDate(timeline.startDate), parseIsoDate(timeline.endDate)),
    progress: Math.round(bars.reduce((a, b) => a + b.progress, 0) / total),
    tasksDone: bars.filter(b => b.status === "done").length,
    tasksTotal: bars.length,
  };
}

const LEGACY_ROADMAPS_KEY = "dashboard_roadmaps_v1";
const SAMPLE_ROADMAP_IDS = new Set(SAMPLE_ROADMAPS.map(roadmap => roadmap.id));

function buildSafeRoadmapFilename(title) {
  return String(title || "roadmap")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "roadmap";
}

function downloadRoadmapExport(roadmap) {
  if (!roadmap) return;
  const payload = JSON.stringify({
    type: "dashboard-roadmap",
    version: 1,
    exportedAt: new Date().toISOString(),
    roadmap,
  }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${buildSafeRoadmapFilename(roadmap.title)}.json`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function downloadTextFile(content, filename, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roadmapOwnerName(members, ownerId) {
  return getMemberById(members, ownerId)?.name || "";
}

function roadmapCoExecutorNames(members, memberIds = [], ownerId = null) {
  return sanitizeMemberIds(memberIds, ownerId)
    .map(id => getMemberById(members, id)?.name || "")
    .filter(Boolean)
    .join(", ");
}

function laneNameById(roadmap, laneId) {
  return roadmap?.lanes?.find(lane => lane.id === laneId)?.name || laneId || "";
}

function buildRoadmapCsv(roadmap, members) {
  const rows = [[
    "section",
    "roadmap_id",
    "roadmap_title",
    "roadmap_status",
    "roadmap_tag",
    "roadmap_period",
    "lane_id",
    "lane_name",
    "item_type",
    "item_id",
    "item_title",
    "item_status",
    "progress",
    "start_date",
    "end_date",
    "milestone_date",
    "predecessors",
    "owner",
    "coexecutors",
    "description",
  ]];

  rows.push([
    "roadmap",
    roadmap.id,
    roadmap.title,
    STATUS_META[roadmap.status]?.label || roadmap.status || "",
    roadmap.tag || "",
    roadmap.period || "",
    "",
    "",
    "roadmap",
    roadmap.id,
    roadmap.title,
    STATUS_META[roadmap.status]?.label || roadmap.status || "",
    roadmap.progress ?? "",
    roadmap.timeline?.startDate || "",
    roadmap.timeline?.endDate || "",
    "",
    roadmapOwnerName(members, roadmap.owner),
    roadmapCoExecutorNames(members, roadmap.memberIds, roadmap.owner),
    roadmap.desc || "",
  ]);

  (roadmap.lanes || []).forEach(lane => {
    rows.push([
      "lane",
      roadmap.id,
      roadmap.title,
      STATUS_META[roadmap.status]?.label || roadmap.status || "",
      roadmap.tag || "",
      roadmap.period || "",
      lane.id || "",
      lane.name || "",
      "lane",
      lane.id || "",
      lane.name || "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  (roadmap.bars || []).forEach(bar => {
    rows.push([
      "task",
      roadmap.id,
      roadmap.title,
      STATUS_META[roadmap.status]?.label || roadmap.status || "",
      roadmap.tag || "",
      roadmap.period || "",
      bar.lane || "",
      laneNameById(roadmap, bar.lane),
      "task",
      bar.id || "",
      bar.title || "",
      STATUS_OPTIONS.find(option => option.value === bar.status)?.label || bar.status || "",
      bar.progress ?? "",
      bar.startDate || roadmap.timeline?.startDate || "",
      bar.endDate || roadmap.timeline?.endDate || "",
      "",
      sanitizePredecessorIds(bar.predecessors, bar.id).map(id => {
        const predecessor = roadmap.bars.find(item => item.id === id);
        return predecessor?.title || id;
      }).join(", "),
      roadmapOwnerName(members, bar.owner),
      roadmapCoExecutorNames(members, bar.memberIds, bar.owner),
      "",
    ]);
  });

  (roadmap.milestones || []).forEach(milestone => {
    rows.push([
      "milestone",
      roadmap.id,
      roadmap.title,
      STATUS_META[roadmap.status]?.label || roadmap.status || "",
      roadmap.tag || "",
      roadmap.period || "",
      "",
      "",
      "milestone",
      "",
      milestone.name || "",
      "",
      "",
      "",
      "",
      milestone.date || "",
      "",
      "",
      "",
      "",
    ]);
  });

  return "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\n");
}

async function downloadRoadmapXls(roadmap, members) {
  if (!roadmap) return;
  const buffer = await buildRoadmapWorkbookXlsxBuffer(roadmap, members);
  downloadTextFile(buffer, `${buildSafeRoadmapFilename(roadmap.title)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function buildRoadmapVisualPrintHtml(node, title) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('[data-print-hidden="true"]').forEach(item => item.remove());
  clone.querySelectorAll('button').forEach(button => {
    button.style.pointerEvents = "none";
  });
  const headMarkup = Array.from(window.document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(element => element.outerHTML)
    .join("\n");
  return `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} - PDF</title>
        ${headMarkup}
        <style>
          html, body { margin: 0; background: #f0f6ff; }
          body { padding: 24px; font-family: Inter, Arial, sans-serif; color: #1d1d1f; }
          #print-root { width: 100%; }
          .visual-print {
            width: 1280px;
            transform: scale(0.82);
            transform-origin: top left;
          }
          @media print {
            @page { size: landscape; margin: 12mm; }
            html, body { background: #fff; }
            body { padding: 0; }
            #print-root { width: 100%; }
            .visual-print {
              width: 1280px !important;
              transform: scale(0.82) !important;
              transform-origin: top left !important;
            }
            #print-root * {
              animation: none !important;
              transition: none !important;
            }
            #print-root [style*="overflow: auto"],
            #print-root [style*="overflow:auto"],
            #print-root [style*="overflow-x: auto"],
            #print-root [style*='overflowX: "auto"'],
            #print-root [style*="overflowX: 'auto'"] {
              overflow: visible !important;
              max-height: none !important;
              height: auto !important;
            }
            #print-root [style*="position: sticky"],
            #print-root [style*='position: "sticky"'],
            #print-root [style*="position: 'sticky'"] {
              position: static !important;
              top: auto !important;
              left: auto !important;
              box-shadow: none !important;
            }
            #print-root [style*="minWidth"] {
              min-width: 0 !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        </style>
      </head>
      <body>
        <div id="print-root"><div class="visual-print">${clone.outerHTML}</div></div>
      </body>
    </html>
  `;
}

function buildTimelinePrintHtml(roadmap, members) {
  const timeline = roadmap.timeline;
  const today = new Date();
  const todayIso = toIsoDate(today);
  const todayPct = percentFromTimelineDate(todayIso, timeline);
  const showToday = todayPct >= 0 && todayPct <= 100
    && today >= parseIsoDate(timeline.startDate)
    && today <= addDays(parseIsoDate(timeline.endDate), 1);
  const rows = [];
  roadmap.lanes.forEach(lane => {
    const laneBars = roadmap.bars.filter(b => b.lane === lane.id);
    rows.push({ type: "lane", lane });
    laneBars.forEach(b => rows.push({ type: "bar", b }));
  });
  const sideW = 320;
  const chartW = Math.max(900, timeline.months.length * 110);
  const totalW = sideW + chartW;
  const gridHeight = rows.reduce((sum, row) => sum + (row.type === "lane" ? TIMELINE_LANE_ROW_HEIGHT : TIMELINE_TASK_ROW_HEIGHT), 0);
  let offsetTop = 0;
  const positionedRows = rows.map(row => {
    const top = offsetTop;
    offsetTop += row.type === "lane" ? TIMELINE_LANE_ROW_HEIGHT : TIMELINE_TASK_ROW_HEIGHT;
    return { ...row, top };
  });
  const sm = STATUS_META[roadmap.status] || STATUS_META.archived;
  const ownerMember = getMemberById(members, roadmap.owner);
  const roadmapCoExecutors = sanitizeMemberIds(roadmap.memberIds, roadmap.owner).map(id => getMemberById(members, id)).filter(Boolean);
  return `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(roadmap.title)} - PDF</title>
        <style>
          html, body { margin: 0; background: #fff; }
          body { padding: 18px; font-family: Inter, Arial, sans-serif; color: #1d1d1f; }
          .page { width: ${totalW}px; }
          .card { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; box-shadow: 0 1px 4px rgba(37,99,235,.05); }
          .header { display: flex; align-items: flex-start; gap: 16px; padding: 20px 24px; margin-bottom: 16px; }
          .header-main { flex: 1; min-width: 0; }
          .crumbs { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1a6; font-weight: 600; margin-bottom: 6px; }
          .title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
          .title-row h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1d1d1f; }
          .status { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; color: ${sm.color}; background: ${sm.bg}; }
          .status-dot { width: 6px; height: 6px; border-radius: 50%; background: ${sm.color}; }
          .desc { margin: 0; font-size: 13px; color: #a1a1a6; }
          .meta { display: flex; gap: 20px; padding-left: 20px; border-left: 1px solid rgba(15,23,42,.06); }
          .meta-col { display: flex; flex-direction: column; gap: 6px; min-width: 120px; }
          .meta-label { font-size: 11px; font-weight: 600; color: #a1a1a6; letter-spacing: .05em; }
          .meta-value { font-size: 14px; font-weight: 600; color: #1d1d1f; display: flex; align-items: center; gap: 6px; }
          .avatar { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 700; }
          .timeline-card { overflow: hidden; }
          .timeline-head { display: flex; border-bottom: 1px solid rgba(15,23,42,.06); }
          .side-head { width: ${sideW}px; flex-shrink: 0; padding: 14px 20px; font-size: 12px; font-weight: 700; color: #a1a1a6; border-right: 1px solid rgba(15,23,42,.06); background: #fff; }
          .months-head { width: ${chartW}px; display: flex; }
          .quarter { border-right: 1px solid rgba(15,23,42,.06); }
          .quarter:last-child { border-right: none; }
          .quarter-title { font-size: 13px; font-weight: 700; padding: 10px 0 6px; text-align: center; color: #1d1d1f; }
          .quarter-months { display: grid; }
          .quarter-month { font-size: 11px; color: #a1a1a6; text-align: center; padding-bottom: 8px; }
          .timeline-body { display: flex; position: relative; }
          .side-body { width: ${sideW}px; flex-shrink: 0; border-right: 1px solid rgba(15,23,42,.06); background: #fff; position: relative; z-index: 2; }
          .lane-row { display: flex; align-items: center; gap: 8px; height: ${TIMELINE_LANE_ROW_HEIGHT}px; padding: 0 20px; background: rgba(118,118,128,.04); font-size: 12px; font-weight: 700; color: #1d1d1f; }
          .lane-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
          .task-label { min-height: ${TIMELINE_TASK_ROW_HEIGHT}px; padding: 7px 20px 7px 28px; display: flex; align-items: center; font-size: 13px; line-height: 1.25; color: #3a3a3c; overflow-wrap: anywhere; }
          .chart { width: ${chartW}px; position: relative; height: ${Math.max(120, gridHeight)}px; }
          .month-line { position: absolute; top: 0; bottom: 0; width: 1px; }
          .today-line { position: absolute; top: 0; bottom: 0; width: 2px; background: #ff3b30; z-index: 3; }
          .today-badge { position: absolute; top: -2px; left: 50%; transform: translateX(-50%); background: #ff3b30; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 0 0 6px 6px; white-space: nowrap; }
          .milestone { position: absolute; top: 0; bottom: 0; transform: translateX(-50%); z-index: 3; display: flex; flex-direction: column; align-items: center; }
          .milestone-diamond { margin-top: 4px; width: 14px; height: 14px; transform: rotate(45deg); border: 2px solid currentColor; background: #fff; box-sizing: border-box; }
          .milestone-label { position: absolute; top: 22px; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 5px; white-space: nowrap; }
          .milestone-line { position: absolute; top: 20px; bottom: 0; width: 1px; }
          .gantt-row { position: absolute; left: 0; right: 0; }
          .gantt-bar { position: absolute; height: 30px; border-radius: 9px; display: flex; align-items: center; padding: 0 10px; gap: 8px; overflow: hidden; box-shadow: none; border: 1px solid rgba(255,255,255,.18); min-width: 8px; }
          .gantt-progress { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255,255,255,.22); }
          .gantt-title { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; z-index: 1; }
          .gantt-owner { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; position: relative; z-index: 1; }
          .legend { display: flex; gap: 20px; padding: 12px 20px; border-top: 1px solid rgba(15,23,42,.06); }
          .legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #3a3a3c; }
          .legend-box { width: 14px; height: 10px; border-radius: 3px; display: inline-block; }
          @media print {
            @page { size: landscape; margin: 10mm; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="card header">
            <div class="header-main">
              <div class="crumbs">Дорожные карты &gt; ${escapeHtml(roadmap.tag || "")}</div>
              <div class="title-row">
                <h1>${escapeHtml(roadmap.title)}</h1>
                <span class="status"><span class="status-dot"></span>${escapeHtml(sm.label)}</span>
              </div>
              <p class="desc">${escapeHtml(roadmap.desc || "")}</p>
            </div>
            <div class="meta">
              <div class="meta-col">
                <span class="meta-label">ВЛАДЕЛЕЦ</span>
                <span class="meta-value">${ownerMember ? `<span class="avatar" style="background:${escapeHtml(ownerMember.color)}">${escapeHtml(ownerMember.initials)}</span>` : ""}${escapeHtml(ownerMember?.name || "Не назначен")}</span>
              </div>
              <div class="meta-col">
                <span class="meta-label">СОИСПОЛНИТЕЛИ</span>
                <span class="meta-value">${escapeHtml(roadmapCoExecutors.map(item => item?.name).filter(Boolean).join(", ") || "—")}</span>
              </div>
              <div class="meta-col">
                <span class="meta-label">ПЕРИОД</span>
                <span class="meta-value">${escapeHtml(roadmap.period || "")}</span>
              </div>
              <div class="meta-col">
                <span class="meta-label">ПРОГРЕСС</span>
                <span class="meta-value">${escapeHtml(String(roadmap.progress ?? 0))}%</span>
              </div>
            </div>
          </div>
          <div class="card timeline-card">
            <div class="timeline-head">
              <div class="side-head">Направление / задача</div>
              <div class="months-head">
                ${timeline.quarters.map((quarter, qi) => `
                  <div class="quarter" style="width:${quarter.widthPct}%;${qi === timeline.quarters.length - 1 ? 'border-right:none;' : ''}">
                    <div class="quarter-title">${escapeHtml(quarter.label)}</div>
                    <div class="quarter-months" style="grid-template-columns:repeat(${quarter.months.length},1fr)">
                      ${quarter.months.map(month => `<div class="quarter-month">${escapeHtml(month.label)}</div>`).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
            <div class="timeline-body">
              <div class="side-body">
                ${positionedRows.map(row => row.type === "lane"
                  ? `<div class="lane-row"><span class="lane-dot" style="background:${escapeHtml(row.lane.color)}"></span>${escapeHtml(row.lane.name)}</div>`
                  : `<div class="task-label">${escapeHtml(row.b.title)}</div>`
                ).join("")}
              </div>
              <div class="chart">
                ${timeline.months.map(month => `<span class="month-line" style="left:${month.leftPct}%;background:${month.month % 3 === 0 ? "rgba(15,23,42,.08)" : "rgba(118,118,128,.06)"}"></span>`).join("")}
                <span class="month-line" style="left:100%;background:rgba(15,23,42,.08)"></span>
                ${showToday ? `<div class="today-line" style="left:${todayPct}%"><span class="today-badge">сегодня</span></div>` : ""}
                ${(roadmap.milestones || []).map(item => {
                  const color = item.color || DEFAULT_MILESTONE_COLOR;
                  const pct = percentFromTimelineDate(item.date, timeline);
                  return `<div class="milestone" style="left:${pct}%;color:${escapeHtml(color)}">
                    <span class="milestone-diamond"></span>
                    <span class="milestone-label" style="color:${escapeHtml(color)};background:${escapeHtml(color)}1f">${escapeHtml(item.name || "")}</span>
                    <span class="milestone-line" style="background:repeating-linear-gradient(180deg, ${escapeHtml(color)}66 0 4px, transparent 4px 8px)"></span>
                  </div>`;
                }).join("")}
                ${positionedRows.map(row => {
                  if (row.type !== "bar") return `<div class="gantt-row" style="top:${row.top}px;height:${TIMELINE_LANE_ROW_HEIGHT}px;background:rgba(118,118,128,.04)"></div>`;
                  const c = BAR_COL[row.b.status] || BAR_COL.planned;
                  const left = percentFromTimelineDate(row.b.startDate, timeline);
                  const width = Math.max(0.9, percentFromTimelineDate(row.b.endDate, timeline, true) - left);
                  const owner = getMemberById(members, row.b.owner);
                  const coExecutors = sanitizeMemberIds(row.b.memberIds, row.b.owner).map(id => getMemberById(members, id)).filter(Boolean);
                  return `<div class="gantt-row" style="top:${row.top}px;height:${TIMELINE_TASK_ROW_HEIGHT}px">
                    <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${escapeHtml(c.bar)}">
                      ${row.b.status === "progress" ? `<span class="gantt-progress" style="width:${escapeHtml(String(row.b.progress || 0))}%"></span>` : ""}
                      <span class="gantt-title">${escapeHtml(row.b.title)}</span>
                      <span class="gantt-owner">
                        ${owner ? `<span class="avatar" style="width:20px;height:20px;background:${escapeHtml(owner.color)};font-size:9px">${escapeHtml(owner.initials)}</span>` : ""}
                        ${coExecutors.slice(0, 2).map(item => item ? `<span class="avatar" style="width:18px;height:18px;background:${escapeHtml(item.color)};font-size:8px">${escapeHtml(item.initials)}</span>` : "").join("")}
                      </span>
                    </div>
                  </div>`;
                }).join("")}
              </div>
            </div>
            <div class="legend">
              <span class="legend-item"><span class="legend-box" style="background:#34c759"></span>Завершено</span>
              <span class="legend-item"><span class="legend-box" style="background:#007aff"></span>В работе</span>
              <span class="legend-item"><span class="legend-box" style="background:#c7c7cc"></span>Запланировано</span>
              <span class="legend-item" style="color:#5856d6;font-weight:600"><span class="milestone-diamond" style="width:12px;height:12px;position:static;transform:rotate(45deg);margin:0 2px 0 0"></span>Веха</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function openRoadmapPrintView(node, title, roadmap = null, members = [], tab = "timeline") {
  if (!node) return;
  const iframe = window.document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 300);
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    window.setTimeout(() => {
      try {
        frameWindow.print();
      } finally {
        cleanup();
      }
    }, 250);
  };

  window.document.body.appendChild(iframe);
  iframe.srcdoc = tab === "timeline" && roadmap
    ? buildTimelinePrintHtml(roadmap, members)
    : buildRoadmapVisualPrintHtml(node, title);
}

export default function RoadmapsSection({ tasks = [], team = [], api, currentUser = null, onError, onLinkIndexChange }) {
  const [confirmAction, confirmDialog] = useConfirmDialog();
  const [roadmaps, setRoadmaps] = useState([]);
  const [openId, setOpenId]     = useState(null);
  const [rmModal, setRmModal]   = useState(null); // null | "new" | roadmap obj
  const [userDirectory, setUserDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const members = useMemo(() => buildMemberRegistry(userDirectory.length ? userDirectory : team, currentUser), [userDirectory, team, currentUser]);
  const defaultOwnerId = memberKey(currentUser?.id || members[0]?.id || "viktor");
  const taskById = useMemo(() => new Map(tasks.map(task => [String(task.id), task])), [tasks]);

  useEffect(() => {
    onLinkIndexChange?.(buildRoadmapLinkIndex(roadmaps));
  }, [roadmaps, onLinkIndexChange]);

  useEffect(() => {
    let cancelled = false;
    async function loadUserDirectory() {
      if (!api?.listUsers) return;
      try {
        const users = await api.listUsers();
        if (!cancelled && Array.isArray(users) && users.length) {
          setUserDirectory(users);
        }
      } catch {
        if (!cancelled) setUserDirectory([]);
      }
    }
    loadUserDirectory();
    return () => { cancelled = true; };
  }, [api, team, currentUser]);

  useEffect(() => {
    let cancelled = false;
    async function loadRoadmapsFromApi() {
      if (!api?.listRoadmaps) {
        if (!cancelled) {
          setLoading(false);
          setLoadError("Сервис дорожных карт недоступен");
        }
        return;
      }
      setLoading(true);
      setLoadError("");
      try {
        const lookup = buildLegacyOwnerLookup(buildMemberRegistry(team, currentUser));
        const resolvedRoadmaps = await migrateLegacyRoadmaps({
          readLegacy: () => legacyRoadmapRaw(() => window.localStorage.getItem(LEGACY_ROADMAPS_KEY)),
          parseLegacy: stored => legacyUserRoadmaps(stored, SAMPLE_ROADMAP_IDS, roadmap => recalc(migrateRoadmapAssignments(roadmap, lookup))),
          importRoadmaps: legacy => api.importRoadmaps(legacy),
          listRoadmaps: () => api.listRoadmaps(),
          clearLegacy: () => window.localStorage.removeItem(LEGACY_ROADMAPS_KEY),
        });
        const normalizedLinks = normalizeTaskRoadmapLinksWithChanges(resolvedRoadmaps, tasks);
        const normalizedRoadmaps = normalizeRoadmaps(normalizedLinks.roadmaps, recalc);
        if (!cancelled) setRoadmaps(normalizedRoadmaps);
        await persistRoadmapRepairs({
          roadmaps: normalizedRoadmaps,
          changedRoadmapIds: normalizedLinks.changedRoadmapIds,
          patchRoadmap: (id, roadmap) => api.patchRoadmap(id, roadmap),
          onError: error => { if (!cancelled) onError?.(error); },
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || "Не удалось загрузить дорожные карты");
          onError?.(error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRoadmapsFromApi();
    return () => { cancelled = true; };
  }, [api, currentUser, onError, tasks, team]);

  const rm = openId ? roadmaps.find(r => r.id === openId) : null;

  function replaceRoadmap(savedRoadmap) {
    setRoadmaps(current => current.map(roadmap => roadmap.id === savedRoadmap.id ? savedRoadmap : roadmap));
  }

  async function persistRoadmap(roadmap) {
    try {
      const saved = recalc(await api.patchRoadmap(roadmap.id, roadmap));
      replaceRoadmap(saved);
      return saved;
    } catch (error) {
      onError?.(error);
      return null;
    }
  }

  async function updateOpenRoadmap(buildNext) {
    const current = roadmaps.find(roadmap => roadmap.id === openId);
    if (!current) return null;
    return persistRoadmap(recalc(buildNext(current)));
  }

  async function handleSaveRoadmap(data) {
    if (data.id) {
      const current = roadmaps.find(roadmap => roadmap.id === data.id);
      if (current) await persistRoadmap(recalc({ ...current, ...data }));
    } else {
      const newRm = recalc({
        ...data,
        id: "rm-" + Date.now(),
        milestones: data.milestones || [],
        lanes: data.lanes || [],
        bars: data.bars || [],
        nnl: data.nnl || { now: [], next: [], later: [] },
      });
      try {
        const created = recalc(await api.createRoadmap(newRm));
        setRoadmaps(current => [...current, created]);
      } catch (error) {
        onError?.(error);
      }
    }
  }

  async function handleDeleteRoadmap(roadmap) {
    if (!roadmap?.id) return;
    setRmModal(null);
    const approved = await confirmAction({
      title: "Удалить дорожную карту?",
      message: "Карта будет удалена из локального списка вместе с задачами, вехами и дорожками.",
      itemTitle: roadmap.title,
      confirmText: "Удалить",
      cancelText: "Отмена",
      tone: "danger",
    });
    if (!approved) return;
    try {
      await api.deleteRoadmap(roadmap.id);
      setRoadmaps(current => current.filter(item => item.id !== roadmap.id));
      if (openId === roadmap.id) setOpenId(null);
    } catch (error) {
      onError?.(error);
    }
  }

  async function handleSaveBar(idx, data) {
    const current = roadmaps.find(roadmap => roadmap.id === openId);
    const previousBar = idx === null ? null : current?.bars[idx];
    if (current && previousBar?.linkedTaskId != null) {
      const nextBar = { ...previousBar, ...data, id: previousBar.id, predecessors: sanitizePredecessorIds(data.predecessors, previousBar.id) };
      try {
        const saved = recalc(await persistLinkedBarChange({ api, roadmap: current, previousBar, nextBar }));
        replaceRoadmap(saved);
        return saved;
      } catch (error) {
        onError?.(error);
        return null;
      }
    }
    return updateOpenRoadmap(roadmap => {
      const bars = idx === null
        ? [...roadmap.bars, { ...data, id: data.id || createRoadmapTaskId(), predecessors: sanitizePredecessorIds(data.predecessors, data.id) }]
        : roadmap.bars.map((barItem, index) => index === idx ? { ...barItem, ...data, id: barItem.id || data.id || createRoadmapTaskId(), predecessors: sanitizePredecessorIds(data.predecessors, barItem.id || data.id) } : barItem);
      return { ...roadmap, bars };
    });
  }

  async function handleLinkOrdinaryTask(task) {
    const current = roadmaps.find(roadmap => roadmap.id === openId);
    if (!current || !task || !canLinkTaskToRoadmaps(roadmaps, task)) return null;
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = task.due && task.due !== "—" ? task.due : null;
    const startDate = dueDate && dueDate < today ? dueDate : today;
    const base = {
      id: createRoadmapTaskId(),
      lane: current.lanes[0]?.id || "",
      owner: memberKey(task.assigneeId ?? task.ownerId ?? defaultOwnerId),
      startDate,
      endDate: dueDate || startDate,
      predecessors: [],
      linkedTaskId: task.id,
      linkedTaskSnapshot: snapshotLinkedTask(task),
    };
    const resolved = resolveLinkedBar(base, task);
    return persistRoadmap(recalc({ ...current, bars: [...current.bars, resolved] }));
  }

  async function handleUnlinkBar(idx) {
    return updateOpenRoadmap(roadmap => ({
      ...roadmap,
      bars: roadmap.bars.map((bar, index) => {
        if (index !== idx) return bar;
        return unlinkTaskBar(bar, taskById.get(String(bar.linkedTaskId)));
      }),
    }));
  }

  async function handleDeleteBar(idx) {
    return updateOpenRoadmap(roadmap => {
      const deletedTaskId = roadmap.bars[idx]?.id;
      return { ...roadmap, bars: removeTaskDependencies(roadmap.bars.filter((_, index) => index !== idx), deletedTaskId) };
    });
  }

  async function handleSaveMilestone(idx, data) {
    await updateOpenRoadmap(roadmap => ({
        ...roadmap,
        milestones: idx === null
          ? [...roadmap.milestones, data]
          : roadmap.milestones.map((milestone, index) => index === idx ? { ...milestone, ...data } : milestone),
      }));
  }

  async function handleDeleteMilestone(idx) {
    await updateOpenRoadmap(roadmap => ({ ...roadmap, milestones: roadmap.milestones.filter((_, index) => index !== idx) }));
  }

  async function handleSaveLane(data) {
    await updateOpenRoadmap(roadmap => ({ ...roadmap, lanes: [...roadmap.lanes, data] }));
  }

  async function handleLinkTasks(sourceId, targetId) {
    const currentRoadmap = roadmaps.find(item => item.id === openId);
    if (!currentRoadmap) return { ok: false, message: "Карта не найдена" };
    if (sourceId === targetId) return { ok: false, message: "Нельзя связать задачу саму с собой" };
    if (wouldCreateDependencyCycle(currentRoadmap.bars, sourceId, targetId)) {
      return { ok: false, message: "Связь создаст цикл" };
    }
    const targetTask = currentRoadmap.bars.find(barItem => barItem.id === targetId);
    if (!targetTask) return { ok: false, message: "Задача-приемник не найдена" };
    const nextPredecessors = sanitizePredecessorIds([...(targetTask.predecessors || []), sourceId], targetTask.id);
    if (nextPredecessors.length === (targetTask.predecessors || []).length) {
      return { ok: false, message: "Такая связь уже существует" };
    }
    const saved = await updateOpenRoadmap(roadmap => {
      const bars = roadmap.bars.map(barItem => (
        barItem.id === targetId
          ? { ...barItem, predecessors: nextPredecessors }
          : barItem
      ));
      return { ...roadmap, bars };
    });
    return saved ? { ok: true } : { ok: false, message: "Не удалось сохранить связь" };
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontFamily: FONT_STACK }}>Загружаем дорожные карты...</div>;
  if (loadError) return <div style={{ padding: 32, textAlign: "center", color: "#b42318", fontFamily: FONT_STACK }}>{loadError}</div>;

  if (rm) {
    return (
      <>
        {rmModal && (
          <RoadmapFormModal
            roadmap={rmModal === "edit" ? rm : null}
            members={members}
            defaultOwnerId={defaultOwnerId}
            onClose={() => setRmModal(null)}
            onSave={handleSaveRoadmap}
            onDelete={handleDeleteRoadmap}
          />
        )}
        {confirmDialog}
        <RoadmapDetail
          key={rm.id}
          rm={rm}
          members={members}
          defaultOwnerId={defaultOwnerId}
          availableTasks={availableTasksForLink(roadmaps, tasks)}
          taskById={taskById}
          onBack={() => setOpenId(null)}
          onEdit={() => setRmModal("edit")}
          onExportJson={() => downloadRoadmapExport(rm)}
          onExportCsv={() => downloadTextFile(buildRoadmapCsv(rm, members), `${buildSafeRoadmapFilename(rm.title)}.csv`, "text/csv;charset=utf-8")}
          onExportXls={() => downloadRoadmapXls(rm, members)}
          onExportPdf={(node, activeTab) => openRoadmapPrintView(node, rm.title, rm, members, activeTab)}
          onSaveBar={handleSaveBar}
          onDeleteBar={handleDeleteBar}
          onUnlinkBar={handleUnlinkBar}
          onLinkOrdinaryTask={handleLinkOrdinaryTask}
          onSaveMilestone={handleSaveMilestone}
          onDeleteMilestone={handleDeleteMilestone}
          onSaveLane={handleSaveLane}
          onLinkTasks={handleLinkTasks}
        />
      </>
    );
  }

  return (
    <>
      {rmModal && (
        <RoadmapFormModal
          roadmap={null}
          members={members}
          defaultOwnerId={defaultOwnerId}
          onClose={() => setRmModal(null)}
          onSave={handleSaveRoadmap}
          onDelete={handleDeleteRoadmap}
        />
      )}
      {confirmDialog}
      <CatalogView roadmaps={roadmaps} members={members} onOpen={setOpenId} onNew={() => setRmModal("new")} />
    </>
  );
}
