import React from 'react';

export const SECTIONS = [
  { id: "tasks", label: "Текущие задачи", description: "Список активных задач и их статусы",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="2" rx="1" fill="currentColor" opacity=".5"/><rect x="3" y="9" width="10" height="2" rx="1" fill="currentColor"/><rect x="3" y="14" width="12" height="2" rx="1" fill="currentColor" opacity=".7"/><circle cx="16" cy="15" r="3" fill="currentColor"/><path d="M15 15l.8.8 1.5-1.5" stroke="#fff" strokeWidth="1" strokeLinecap="round"/></svg> },
  { id: "events", label: "Ключевые события", description: "Важные даты и ключевые события",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M7 3v4M13 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="6" y="10" width="3" height="3" rx=".5" fill="currentColor"/><rect x="11" y="10" width="3" height="3" rx=".5" fill="currentColor" opacity=".5"/></svg> },
  { id: "roadmaps", label: "Дорожные карты", description: "Стратегические планы и Gantt-диаграммы",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6h14M3 10h10M3 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="13" y="8" width="5" height="4" rx="1" fill="currentColor" opacity=".5"/></svg> },
  { id: "mindmap", label: "Mind Map", description: "Визуальные карты идей и концепций",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" fill="currentColor"/><circle cx="4" cy="5" r="2" fill="currentColor" opacity=".5"/><circle cx="16" cy="5" r="2" fill="currentColor" opacity=".5"/><circle cx="4" cy="15" r="2" fill="currentColor" opacity=".5"/><circle cx="16" cy="15" r="2" fill="currentColor" opacity=".5"/><path d="M7 8.5L5.5 6.5M13 8.5L14.5 6.5M7 11.5L5.5 13.5M13 11.5L14.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { id: "syncs", label: "Заметки", description: "Рабочие заметки и тезисы команды",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M7 10a3 3 0 1 1 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 13v-2l-1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "ucp", label: "УПЦ", description: "Управление целевыми показателями",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 16l3-4 3 2 3-5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="10" cy="4" r="2" fill="currentColor" opacity=".5"/><path d="M10 6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: "ambp", label: "АМБП", description: "Достижение показателей бизнес-плана",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 16V5M4 16h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="6" y="10" width="2.5" height="4" rx="1" fill="currentColor" opacity=".45"/><rect x="10" y="7" width="2.5" height="7" rx="1" fill="currentColor" opacity=".7"/><rect x="14" y="4" width="2.5" height="10" rx="1" fill="currentColor"/><path d="M6 7l3-2 3 1 4-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "plan", label: "План развития", description: "Стратегический план и этапы развития",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 14l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M14 8h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "archive", label: "Архив", description: "Закрытые и завершённые задачи",
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 7h12v8.5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5V7zM3 4h14v3H3zM8 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "users", label: "Пользователи", description: "Команда, роли и приглашения",
    adminOnly: true,
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2.5 17a4.5 4.5 0 0 1 9 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" opacity=".65"/><path d="M12.5 14.5c.6-.5 1.4-.8 2.3-.8 1.5 0 2.8.9 3.4 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".65"/></svg> },
];

export const MOBILE_SECTION_LABELS = {
  tasks: "Задачи",
  archive: "Архив",
  events: "События",
  roadmaps: "Карты",
  mindmap: "MindMap",
  syncs: "Заметки",
  ucp: "УПЦ",
  ambp: "АМБП",
  plan: "План",
  users: "Люди",
};
