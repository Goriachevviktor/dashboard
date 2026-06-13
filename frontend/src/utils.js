import { useState, useEffect } from 'react';

export const ROADMAP_YEAR = 2026;
export const ROADMAP_FALLBACK_TODAY = { year: ROADMAP_YEAR, month: 3, day: 29 };
export const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export const USER_COLORS = ["#2563eb", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6", "#d946ef", "#64748b"];

export function formatDashboardDate(date) {
  return FULL_DATE_FORMATTER.format(date).replace(/\s?г\.$/, "");
}

export function getRoadmapToday() {
  const now = new Date();
  if (now.getFullYear() !== ROADMAP_YEAR) return ROADMAP_FALLBACK_TODAY;
  return { year: ROADMAP_YEAR, month: now.getMonth(), day: now.getDate() };
}

export function useViewportFlags() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    width,
    isCompact: width < 1180,
    isMobile: width < 820,
  };
}

export function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function initialsFromName(name, email) {
  const source = (name || email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function userColor(user, index = 0) {
  const id = Number(user?.id);
  const basis = Number.isFinite(id) ? id : index;
  return USER_COLORS[Math.abs(basis) % USER_COLORS.length];
}

export function normalizeDashboardData(data, currentUser = null) {
  return {
    team: normalizeTeam(data.team, currentUser),
    tasks: data.tasks || [],
    events: data.events || [],
    eventTasks: data.eventTasks || {},
    syncStickers: data.syncStickers || [],
    ucpTasks: data.ucpTasks || [],
    developmentTasks: data.developmentTasks || [],
    ambpTopics: data.ambpTopics || [],
  };
}

export function normalizeTeam(team, currentUser = null) {
  const source = Array.isArray(team) && team.length
    ? team
    : currentUser
      ? [currentUser]
      : [];
  return source.map((member, index) => ({
    id: member.id,
    name: member.name || member.displayName || member.email || "Пользователь",
    initials: member.initials || initialsFromName(member.name || member.displayName, member.email),
    color: userColor(member, index),
    email: member.email,
  }));
}

export function findTeamMember(team, id) {
  return team.find(member => member.id === id) || null;
}

export function formatShortDate(value) {
  if (!value || value === "—") return "—";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(new Date(value + "T00:00:00"))
    .replace(".", "");
}

export function parseTaskDueDate(value) {
  if (!value || value === "—") return null;
  const text = String(value).trim().toLowerCase();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dotted = text.match(/^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{4}))?$/);
  if (dotted) return new Date(Number(dotted[3] || ROADMAP_YEAR), Number(dotted[2]) - 1, Number(dotted[1]));
  const monthMap = { янв: 0, января: 0, фев: 1, февраля: 1, мар: 2, марта: 2, апр: 3, апреля: 3, май: 4, мая: 4, июн: 5, июня: 5, июл: 6, июля: 6, авг: 7, августа: 7, сен: 8, сентября: 8, окт: 9, октября: 9, ноя: 10, ноября: 10, дек: 11, декабря: 11 };
  const ru = text.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/i);
  if (ru && monthMap[ru[2]] != null) return new Date(Number(ru[3] || ROADMAP_YEAR), monthMap[ru[2]], Number(ru[1]));
  return null;
}

export function isTaskOverdue(task) {
  if (!task || ["Готов", "Готово", "Архив"].includes(task.column)) return false;
  const due = parseTaskDueDate(task.due);
  if (!due || Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}
