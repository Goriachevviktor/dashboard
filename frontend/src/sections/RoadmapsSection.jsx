import { useState, useEffect } from 'react';
import { getRoadmapToday, ROADMAP_YEAR } from '../utils.js';
import StatCard from '../components/common/StatCard.jsx';
import Avatar from '../components/common/Avatar.jsx';
import { useConfirmDialog } from '../components/common/ConfirmDialog.jsx';

const OWNERS = {
  viktor: { name: "Виктор",  initials: "ВИ", color: "#6d5bd0" },
  anna:   { name: "Анна",    initials: "АК", color: "#22b07d" },
  dmitry: { name: "Дмитрий", initials: "ДМ", color: "#3b6fe0" },
  elena:  { name: "Елена",   initials: "ЕС", color: "#f3a236" },
  pavel:  { name: "Павел",   initials: "ПР", color: "#2bb6c4" },
};

const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const QUARTERS = ["Q1","Q2","Q3","Q4"];

const STATUS_META = {
  active:   { label: "Активна",   color: "#22b07d", bg: "#e6f7f0" },
  draft:    { label: "Черновик",  color: "#f3a236", bg: "#fdf1df" },
  archived: { label: "Архив",     color: "#8a96ad", bg: "#eef1f6" },
};

const ROADMAP_STATUS_OPTIONS = [
  { value: "active", label: "Активна" },
  { value: "draft", label: "Черновик" },
  { value: "archived", label: "Архив" },
];

const BAR_COL = {
  done:     { bar: "#22b07d", soft: "#cdeede" },
  progress: { bar: "#3b6fe0", soft: "#cfddf8" },
  planned:  { bar: "#aeb9d0", soft: "#dde3ee" },
};

const MILESTONE_COLORS = ["#6d5bd0", "#3b6fe0", "#22b07d", "#f3a236", "#ec5b6b", "#2bb6c4", "#8a96ad", "#e11d48"];
const DEFAULT_MILESTONE_COLOR = MILESTONE_COLORS[0];

function daysInRoadmapMonth(monthIndex) {
  return new Date(ROADMAP_YEAR, monthIndex + 1, 0).getDate();
}

function monthValueToDate(value, fallbackMonth = 0, endOfSpan = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return `${ROADMAP_YEAR}-${String(fallbackMonth + 1).padStart(2, "0")}-01`;
  }
  if (numeric >= 12) return `${ROADMAP_YEAR}-12-31`;
  const month = Math.max(0, Math.min(11, Math.floor(numeric)));
  const days = daysInRoadmapMonth(month);
  const fraction = Math.max(0, numeric - month);
  const day = endOfSpan
    ? Math.max(1, Math.min(days, Math.ceil(fraction * days) || 1))
    : Math.max(1, Math.min(days, Math.floor(fraction * days) + 1));
  return `${ROADMAP_YEAR}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateToMonthValue(value, endOfSpan = false) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return endOfSpan ? 1 : 0;
  const month = Math.max(0, Math.min(11, date.getMonth()));
  const day = date.getDate();
  const days = daysInRoadmapMonth(month);
  const fraction = endOfSpan ? day / days : (day - 1) / days;
  return Math.max(0, Math.min(12, Number((month + fraction).toFixed(3))));
}

function bar(lane, title, start, end, status, progress, owner) {
  return { lane, title, start, end, status, progress, owner };
}

const SAMPLE_ROADMAPS = (() => {
  const roadmaps = [
    {
      id: "rm-product",
      title: "Продуктовый роадмап 2026",
      desc: "Ключевые продуктовые инициативы и релизы на год",
      owner: "viktor",
      tag: "Продукт",
      tagColor: "#3b6fe0",
      status: "active",
      period: "Q1 – Q4 2026",
      milestones: [
        { name: "Релиз 2.0", month: 2.0 },
        { name: "Beta мобайл", month: 5.2 },
        { name: "Публичный запуск", month: 8.4 },
        { name: "Итоги года", month: 11.4 },
      ],
      lanes: [
        { id: "l1", name: "Платформа", color: "#3b6fe0" },
        { id: "l2", name: "Мобильное приложение", color: "#6d5bd0" },
        { id: "l3", name: "Аналитика", color: "#22b07d" },
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
      tagColor: "#6d5bd0",
      status: "active",
      period: "Q1 – Q3 2026",
      milestones: [
        { name: "Миграция БД", month: 3.0 },
        { name: "Zero-downtime", month: 7.0 },
      ],
      lanes: [
        { id: "p1", name: "Инфраструктура", color: "#6d5bd0" },
        { id: "p2", name: "Безопасность", color: "#ec5b6b" },
        { id: "p3", name: "DevOps", color: "#2bb6c4" },
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
      tagColor: "#f3a236",
      status: "active",
      period: "Q2 – Q4 2026",
      milestones: [
        { name: "Запуск кампании", month: 4.0 },
        { name: "Конференция", month: 9.0 },
      ],
      lanes: [
        { id: "m1", name: "Контент", color: "#f3a236" },
        { id: "m2", name: "Performance", color: "#3b6fe0" },
        { id: "m3", name: "PR / Бренд", color: "#22b07d" },
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
      tagColor: "#22b07d",
      status: "draft",
      period: "Q3 – Q4 2026",
      milestones: [{ name: "Пилот", month: 8.0 }],
      lanes: [
        { id: "o1", name: "Активация", color: "#22b07d" },
        { id: "o2", name: "Поддержка", color: "#3b6fe0" },
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
      tagColor: "#2bb6c4",
      status: "active",
      period: "Q1 – Q2 2026",
      milestones: [{ name: "Отчёт по сегментам", month: 2.5 }, { name: "Гипотезы Q3", month: 5.5 }],
      lanes: [
        { id: "r1", name: "Качественные", color: "#2bb6c4" },
        { id: "r2", name: "Количественные", color: "#6d5bd0" },
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
      id: "rm-2025",
      title: "Роадмап 2025 (архив)",
      desc: "Завершённые инициативы прошлого года",
      owner: "viktor",
      tag: "Архив",
      tagColor: "#8a96ad",
      status: "archived",
      period: "Q1 – Q4 2025",
      milestones: [{ name: "Запуск v1", month: 6.0 }],
      lanes: [{ id: "a1", name: "Продукт", color: "#8a96ad" }],
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
  const col = value === 100 ? "#22b07d" : value >= 50 ? "#3b6fe0" : "#f3a236";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#eef2f8" strokeWidth="5" fill="none" />
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
  const col = { done: "#22b07d", progress: "#3b6fe0", planned: "#c7d2e6" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 0" }}>
      {rm.bars.slice(0, 5).map((b, i) => (
        <div key={i} style={{ position: "relative", height: 7, background: "#f1f4fa", borderRadius: 999 }}>
          <span style={{
            position: "absolute", top: 0, height: 7, borderRadius: 999,
            left: `${(b.start / 12) * 100}%`,
            width: `${((b.end - b.start) / 12) * 100}%`,
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

function RoadmapCard({ rm, onOpen }) {
  const sm = STATUS_META[rm.status] || STATUS_META.archived;
  return (
    <button onClick={() => onOpen(rm.id)} style={{
      textAlign: "left", background: "#fff", border: "1px solid #e2edf8",
      borderRadius: 16, padding: 22, boxShadow: "0 1px 4px rgba(37,99,235,.05)",
      display: "flex", flexDirection: "column", gap: 14, cursor: "pointer",
      transition: "transform .15s, box-shadow .18s", fontFamily: "Inter", width: "100%",
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
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3a6e", marginBottom: 4 }}>{rm.title}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>{rm.desc}</div>
      </div>
      <MiniTimeline rm={rm} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #f1f5fb", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ProgressRing value={rm.progress} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a6e" }}>{rm.tasksDone}/{rm.tasksTotal} задач</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{rm.period}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#6d5bd0" }}>
            <DiamondIcon size={13} />{rm.milestones.length}
          </span>
          <Avatar member={OWNERS[rm.owner]} size={30} />
        </div>
      </div>
    </button>
  );
}

function RoadmapRow({ rm, onOpen }) {
  const sm = STATUS_META[rm.status] || STATUS_META.archived;
  return (
    <button onClick={() => onOpen(rm.id)} style={{
      display: "flex", alignItems: "center", gap: 18, textAlign: "left",
      background: "#fff", border: "1px solid #e2edf8", borderRadius: 12,
      padding: "14px 20px", boxShadow: "0 1px 3px rgba(37,99,235,.05)",
      cursor: "pointer", fontFamily: "Inter", width: "100%",
      transition: "border-color .15s, box-shadow .15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#bfdbfe"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2edf8"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(37,99,235,.05)"; }}
    >
      <span style={{ width: 5, alignSelf: "stretch", borderRadius: 999, background: rm.tagColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3a6e" }}>{rm.title}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rm.desc}</div>
      </div>
      <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, width: 120, flexShrink: 0 }}>{rm.period}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#6d5bd0", width: 80, flexShrink: 0 }}>
        <DiamondIcon size={13} />{rm.milestones.length} вех
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 160, flexShrink: 0 }}>
        <div style={{ flex: 1, height: 7, background: "#eef2f8", borderRadius: 999, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", background: "#3b6fe0", borderRadius: 999, width: rm.progress + "%" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e3a6e", width: 36 }}>{rm.progress}%</span>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 999, color: sm.color, background: sm.bg }}>{sm.label}</span>
      <Avatar member={OWNERS[rm.owner]} size={28} />
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
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

function BarFormModal({ bar: initBar, lanes, onClose, onSave, onDelete }) {
  const isEdit = Boolean(initBar);
  const [title,    setTitle]    = useState(initBar?.title    || "");
  const [lane,     setLane]     = useState(initBar?.lane     || lanes[0]?.id || "");
  const [status,   setStatus]   = useState(initBar?.status   || "planned");
  const [progress, setProgress] = useState(initBar?.progress ?? 0);
  const [startDate, setStartDate] = useState(monthValueToDate(initBar?.start ?? 0, 0));
  const [endDate,   setEndDate]   = useState(monthValueToDate(initBar?.end ?? 3, 2, true));
  const [owner,    setOwner]    = useState(initBar?.owner    || "viktor");
  const [error,    setError]    = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const start = dateToMonthValue(startDate);
    const end = dateToMonthValue(endDate, true);
    if (end <= start) {
      setError("Дата окончания должна быть позже даты начала");
      return;
    }
    onSave({ title, lane, status, progress: Number(progress), start, end, owner });
    onClose();
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1.5px solid #dbeafe", borderRadius: 8,
    padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none",
    color: "#1e3a6e", boxSizing: "border-box", background: "#fff",
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 480, background: "#fff", borderRadius: 18,
        padding: 28, boxShadow: "0 24px 64px rgba(30,58,110,.18)",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3a6e", marginBottom: 4 }}>
          {isEdit ? "Редактировать задачу" : "Новая задача"}
        </div>

        <div>
          <label style={labelStyle}>Название *</label>
          <input value={title} onChange={e => { setTitle(e.target.value); setError(""); }} required autoFocus style={inputStyle} placeholder="Название задачи" />
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
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Начало периода</label>
            <input
              type="date"
              min={`${ROADMAP_YEAR}-01-01`}
              max={`${ROADMAP_YEAR}-12-31`}
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setError(""); }}
              style={{ ...inputStyle, cursor: "pointer" }}
            />
          </div>
          <div>
            <label style={labelStyle}>Конец периода</label>
            <input
              type="date"
              min={`${ROADMAP_YEAR}-01-01`}
              max={`${ROADMAP_YEAR}-12-31`}
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
        {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: -6 }}>{error}</div>}

        <div>
          <label style={labelStyle}>Владелец</label>
          <select value={owner} onChange={e => setOwner(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {Object.entries(OWNERS).map(([key, o]) => (
              <option key={key} value={key}>{o.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 4 }}>
          <div>
            {isEdit && (
              <button type="button" onClick={() => { onDelete(); onClose(); }} style={{
                padding: "9px 16px", borderRadius: 9, border: "1.5px solid #fca5a5",
                background: "#fff", color: "#ef4444", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Удалить</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 9, border: "1.5px solid #dbeafe",
              background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Отмена</button>
            <button type="submit" style={{
              padding: "9px 20px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff",
              fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Сохранить</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Модалка добавления/редактирования вехи ───────────────────────────────

function MilestoneFormModal({ milestone, onClose, onSave, onDelete }) {
  const isEdit = Boolean(milestone);
  const [name, setName] = useState(milestone?.name || "");
  const [date, setDate] = useState(monthValueToDate(milestone?.month ?? 0));
  const [color, setColor] = useState(milestone?.color || DEFAULT_MILESTONE_COLOR);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ name, month: dateToMonthValue(date), color });
    onClose();
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1.5px solid #dbeafe", borderRadius: 8,
    padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none",
    color: "#1e3a6e", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18,
        padding: 28, boxShadow: "0 24px 64px rgba(30,58,110,.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3a6e", marginBottom: 4 }}>
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
            min={`${ROADMAP_YEAR}-01-01`}
            max={`${ROADMAP_YEAR}-12-31`}
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
                padding: "9px 16px", borderRadius: 9, border: "1.5px solid #fca5a5",
                background: "#fff", color: "#ef4444", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Удалить</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 9, border: "1.5px solid #dbeafe",
              background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Отмена</button>
            <button type="submit" style={{
              padding: "9px 20px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff",
              fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{isEdit ? "Сохранить" : "Добавить"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Модалка создания/редактирования карты ─────────────────────────────────

const TAG_COLORS = ["#3b6fe0","#6d5bd0","#22b07d","#f3a236","#ec5b6b","#2bb6c4","#8a96ad"];

const LANE_COLORS = ["#3b6fe0","#6d5bd0","#22b07d","#f3a236","#ec5b6b","#2bb6c4","#8a96ad","#e11d48"];

function RoadmapFormModal({ roadmap, onClose, onSave, onDelete }) {
  const isEdit = Boolean(roadmap);
  const [title, setTitle]       = useState(roadmap?.title       || "");
  const [desc, setDesc]         = useState(roadmap?.desc        || "");
  const [tag, setTag]           = useState(roadmap?.tag         || "");
  const [tagColor, setTagColor] = useState(roadmap?.tagColor    || TAG_COLORS[0]);
  const [period, setPeriod]     = useState(roadmap?.period      || "");
  const [owner, setOwner]       = useState(roadmap?.owner       || "viktor");
  const [status, setStatus]     = useState(roadmap?.status      || "active");
  const [lanes, setLanes]       = useState(roadmap?.lanes       || []);
  const [newLaneName, setNewLaneName] = useState("");
  const [newLaneColor, setNewLaneColor] = useState(LANE_COLORS[0]);

  function addLane() {
    if (!newLaneName.trim()) return;
    setLanes(ls => [...ls, { id: "lane-" + Date.now(), name: newLaneName.trim(), color: newLaneColor }]);
    setNewLaneName("");
  }

  function removeLane(id) {
    setLanes(ls => ls.filter(l => l.id !== id));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...(roadmap || {}), title, desc, tag, tagColor, period, owner, status, lanes });
    onClose();
  }

  const inputStyle = {
    width: "100%", height: 38, border: "1.5px solid #dbeafe", borderRadius: 8,
    padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none",
    color: "#1e3a6e", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 500, background: "#fff", borderRadius: 18,
        padding: 28, boxShadow: "0 24px 64px rgba(30,58,110,.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3a6e", marginBottom: 4 }}>
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
            <input value={period} onChange={e => setPeriod(e.target.value)} style={inputStyle} placeholder="Q1 – Q4 2026" />
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
          <select value={owner} onChange={e => setOwner(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {Object.entries(OWNERS).map(([key, o]) => (
              <option key={key} value={key}>{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Статус карты</label>
          <div style={{ display: "inline-flex", background: "#f8fbff", border: "1.5px solid #dbeafe", borderRadius: 999, padding: 4, gap: 2 }}>
            {ROADMAP_STATUS_OPTIONS.map(option => {
              const active = status === option.value;
              const meta = STATUS_META[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 13px",
                    borderRadius: 999,
                    border: "none",
                    background: active ? meta.bg : "transparent",
                    color: active ? meta.color : "#64748b",
                    fontFamily: "Inter",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? meta.color : "#cbd5e1" }} />
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
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f8fbff", borderRadius: 8, border: "1px solid #e2edf8" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: "#1e3a6e" }}>{l.name}</span>
                  <button type="button" onClick={() => removeLane(l.id)} style={{ border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
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
              padding: "0 14px", borderRadius: 8, border: "none", background: "#2563eb",
              color: "#fff", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}>+</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
          {isEdit ? (
            <button type="button" onClick={() => onDelete?.(roadmap)} style={{
              padding: "9px 16px", borderRadius: 9, border: "1.5px solid #fecaca",
              background: "#fef2f2", color: "#ef4444", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Удалить карту</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 9, border: "1.5px solid #dbeafe",
              background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Отмена</button>
            <button type="submit" style={{
              padding: "9px 20px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff",
              fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Сохранить</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function CatalogView({ roadmaps, onOpen, onNew }) {
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
          return [tag.toLowerCase(), { label: tag, color: r.tagColor || "#8a96ad", count: 0 }];
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
        <StatCard label="ВСЕГО КАРТ" value={roadmaps.length} sub="в портфеле" color="#1e3a6e" />
        <StatCard label="АКТИВНЫХ" value={counts.active} sub="в работе" color="#3b6fe0" />
        <StatCard label="ВЕХ" value={totalMiles} sub="ключевых событий" color="#6d5bd0" />
        <StatCard label="СРЕДНИЙ ПРОГРЕСС" value={avgProgress + "%"} sub="по портфелю" color="#22b07d" />
      </div>

      {/* Тулбар */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {FCHIP.map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: filter === c.id ? "#eff6ff" : "#fff",
              border: filter === c.id ? "1px solid #bfdbfe" : "1px solid #e2edf8",
              color: filter === c.id ? "#2563eb" : "#475569",
              fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999,
              cursor: "pointer", fontFamily: "Inter",
            }}>
              {c.label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                background: filter === c.id ? "#fff" : "#eef2f8",
                color: filter === c.id ? "#2563eb" : "#94a3b8",
              }}>{counts[c.id]}</span>
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setTagFilter("all")} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: tagFilter === "all" ? "#f8fbff" : "#fff",
              border: tagFilter === "all" ? "1px solid #bfdbfe" : "1px solid #e2edf8",
              color: tagFilter === "all" ? "#2563eb" : "#64748b",
              fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 999,
              cursor: "pointer", fontFamily: "Inter",
            }}>
              Все теги
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                background: tagFilter === "all" ? "#fff" : "#eef2f8",
                color: tagFilter === "all" ? "#2563eb" : "#94a3b8",
              }}>{roadmaps.length}</span>
            </button>
            {tags.map(tag => {
              const active = tagFilter === tag.label.toLowerCase();
              return (
                <button key={tag.label} onClick={() => setTagFilter(tag.label.toLowerCase())} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: active ? tag.color + "18" : "#fff",
                  border: active ? `1px solid ${tag.color}55` : "1px solid #e2edf8",
                  color: active ? tag.color : "#64748b",
                  fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 999,
                  cursor: "pointer", fontFamily: "Inter",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: tag.color }} />
                  {tag.label}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                    background: active ? "#fff" : "#eef2f8",
                    color: active ? tag.color : "#94a3b8",
                  }}>{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {/* Поиск */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2edf8", borderRadius: 999, padding: "7px 14px", width: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск карт…"
            style={{ border: "none", outline: "none", fontSize: 13, color: "#1e3a6e", background: "none", width: "100%", fontFamily: "Inter" }} />
        </div>
        {/* Grid/List */}
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e2edf8", borderRadius: 999, padding: 4, gap: 2 }}>
          {[["grid", "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"], ["list", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]].map(([id, d]) => (
            <button key={id} onClick={() => setView(id)} style={{
              width: 30, height: 30, borderRadius: 999, border: "none", cursor: "pointer",
              background: view === id ? "#2563eb" : "none",
              color: view === id ? "#fff" : "#94a3b8", display: "grid", placeItems: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={d}/></svg>
            </button>
          ))}
        </div>
        {/* Новая карта */}
        <button onClick={onNew} style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "8px 16px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter",
          boxShadow: "0 2px 8px rgba(37,99,235,.25)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Новая карта
        </button>
      </div>

      {/* Контент */}
      {list.length === 0 ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8", fontSize: 15 }}>Карты не найдены</div>
      ) : view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {list.map(rm => <RoadmapCard key={rm.id} rm={rm} onOpen={onOpen} />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(rm => <RoadmapRow key={rm.id} rm={rm} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

// ── Timeline (Gantt) ───────────────────────────────────────────────────────

function GanttBar({ b, hover, setHover, idx, onBarClick }) {
  const c = BAR_COL[b.status] || BAR_COL.planned;
  const left = (b.start / 12) * 100;
  const width = ((b.end - b.start) / 12) * 100;
  const isHov = hover === idx;
  return (
    <div style={{ height: 46, display: "flex", alignItems: "center", position: "relative" }}>
      <div
        onClick={() => onBarClick && onBarClick(b, idx)}
        onMouseEnter={() => setHover(idx)}
        onMouseLeave={() => setHover(null)}
        style={{
          position: "absolute", height: 30, borderRadius: 9,
          left: left + "%", width: width + "%",
          background: c.bar, display: "flex", alignItems: "center",
          padding: "0 10px", gap: 8, overflow: "hidden", cursor: "pointer",
          boxShadow: isHov ? "0 6px 16px rgba(31,45,77,.22)" : "0 2px 6px rgba(31,45,77,.14)",
          transform: isHov ? "translateY(-1px)" : "none",
          transition: "transform .12s, box-shadow .15s", zIndex: isHov ? 3 : 2,
          minWidth: 8,
        }}
      >
        {b.status === "progress" && (
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: b.progress + "%", background: "rgba(255,255,255,.22)", zIndex: 0 }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", zIndex: 1 }}>{b.title}</span>
        <span style={{ marginLeft: "auto", zIndex: 1, flexShrink: 0 }}>
          <Avatar member={OWNERS[b.owner]} size={20} />
        </span>
      </div>
    </div>
  );
}

function TimelineView({ rm, onBarClick, onMilestoneClick }) {
  const [hover, setHover] = useState(null);
  const today = getRoadmapToday();
  const todayMonth = today.month + today.day / 31;
  const todayPct = (todayMonth / 12) * 100;

  const rows = [];
  rm.lanes.forEach(lane => {
    const laneBars = rm.bars.filter(b => b.lane === lane.id);
    rows.push({ type: "lane", lane });
    laneBars.forEach(b => rows.push({ type: "bar", b, idx: rm.bars.indexOf(b) }));
  });

  const sideW = 220;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ overflowX: "auto" }}>
        {/* Шапка */}
        <div style={{ display: "flex", borderBottom: "1px solid #e8f0fa", position: "sticky", top: 0, background: "#fff", zIndex: 4 }}>
          <div style={{ width: sideW, flexShrink: 0, padding: "14px 20px", fontSize: 12, fontWeight: 700, color: "#94a3b8", borderRight: "1px solid #e8f0fa" }}>
            Направление / задача
          </div>
          <div style={{ flex: 1, minWidth: 720, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {QUARTERS.map((q, qi) => (
              <div key={q} style={{ borderRight: qi < 3 ? "1px solid #e8f0fa" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 700, padding: "10px 0 6px", textAlign: "center", color: "#1e3a6e" }}>
                  {q} <span style={{ color: "#94a3b8", fontWeight: 500, fontSize: 11 }}>2026</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {[0,1,2].map(m => (
                    <div key={m} style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", paddingBottom: 8 }}>{MONTHS[qi*3+m]}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Тело */}
        <div style={{ display: "flex" }}>
          {/* Левый сайдбар */}
          <div style={{ width: sideW, flexShrink: 0, borderRight: "1px solid #e8f0fa" }}>
            {rows.map((r, i) => r.type === "lane" ? (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 20px", background: "#f7f9fd", fontSize: 12, fontWeight: 700, color: "#1e3a6e" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.lane.color, flexShrink: 0 }} />
                {r.lane.name}
              </div>
            ) : (
              <div key={i} style={{ height: 46, padding: "0 20px 0 28px", display: "flex", alignItems: "center", fontSize: 13, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.b.title}>
                {r.b.title}
              </div>
            ))}
          </div>

          {/* Сетка Gantt */}
          <div style={{ flex: 1, minWidth: 720, position: "relative", minHeight: rows.length === 0 ? 120 : undefined }}>
            {/* Вертикальные линии */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} style={{
                  position: "absolute", top: 0, bottom: 0, width: 1,
                  background: i % 3 === 0 ? "#dde8f5" : "#eef3fa",
                  left: `${(i / 12) * 100}%`,
                }} />
              ))}
            </div>
            {/* Линия сегодня */}
            <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: "#ef4444", left: todayPct + "%", zIndex: 3 }}>
              <span style={{
                position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)",
                background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700,
                padding: "2px 7px", borderRadius: "0 0 6px 6px", whiteSpace: "nowrap",
              }}>сегодня</span>
            </div>
            {/* Вехи */}
            {rm.milestones.map((m, i) => {
              const milestoneColor = m.color || DEFAULT_MILESTONE_COLOR;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute", top: 0, bottom: 0, zIndex: 3,
                    left: `${(m.month / 12) * 100}%`, transform: "translateX(-50%)",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    pointerEvents: "none",
                  }}>
                  <span
                    onClick={() => onMilestoneClick && onMilestoneClick(m, i)}
                    title="Редактировать веху"
                    style={{ color: milestoneColor, marginTop: 4, cursor: "pointer", pointerEvents: "auto" }}
                  ><DiamondIcon size={14} /></span>
                  <span
                    onClick={() => onMilestoneClick && onMilestoneClick(m, i)}
                    title="Редактировать веху"
                    style={{ position: "absolute", top: 22, fontSize: 10, fontWeight: 700, color: milestoneColor, background: milestoneColor + "1f", padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap", cursor: "pointer", pointerEvents: "auto" }}
                  >{m.name}</span>
                  <span style={{ position: "absolute", top: 20, bottom: 0, width: 1, background: `repeating-linear-gradient(180deg, ${milestoneColor}66 0 4px, transparent 4px 8px)`, pointerEvents: "none" }} />
                </div>
              );
            })}
            {/* Строки */}
            {rows.map((r, i) => r.type === "lane" ? (
              <div key={i} style={{ height: 40, background: "#f7f9fd" }} />
            ) : (
              <GanttBar key={i} b={r.b} idx={r.idx} hover={hover} setHover={setHover} onBarClick={onBarClick} />
            ))}
          </div>
        </div>
      </div>

      {/* Empty state — нет дорожек */}
      {rows.length === 0 && (
        <div style={{ padding: "32px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          Нет дорожек. Нажмите «Редактировать» карту и добавьте направления.
        </div>
      )}

      {/* Легенда */}
      <div style={{ display: "flex", gap: 20, padding: "12px 20px", borderTop: "1px solid #e8f0fa" }}>
        {[["#22b07d","Завершено"],["#3b6fe0","В работе"],["#aeb9d0","Запланировано"]].map(([col, label]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
            <span style={{ width: 14, height: 10, borderRadius: 3, background: col, display: "inline-block" }} />{label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6d5bd0", fontWeight: 600 }}>
          <DiamondIcon size={12} />Веха
        </span>
      </div>
    </div>
  );
}

// ── Swimlanes ──────────────────────────────────────────────────────────────

function SwimlanesView({ rm, onBarClick }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, overflowX: "auto" }}>
      {rm.lanes.map(lane => {
        const bars = rm.bars.filter(b => b.lane === lane.id);
        return (
          <div key={lane.id} style={{ flexShrink: 0, width: 300, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f7f9fd", borderRadius: 10, borderLeft: `4px solid ${lane.color}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: lane.color }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1e3a6e", flex: 1 }}>{lane.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "#fff", padding: "2px 8px", borderRadius: 999 }}>{bars.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {bars.map((b, i) => {
                const c = BAR_COL[b.status] || BAR_COL.planned;
                const label = b.status === "done" ? "Завершено" : b.status === "progress" ? b.progress + "%" : "Запланировано";
                return (
                  <div key={i} onClick={() => onBarClick && onBarClick(b, rm.bars.indexOf(b))} style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 10, padding: "13px 14px", boxShadow: "0 1px 3px rgba(37,99,235,.05)", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1e3a6e" }}>{b.title}</span>
                      <Avatar member={OWNERS[b.owner]} size={22} />
                    </div>
                    <div style={{ height: 6, background: "#eef2f8", borderRadius: 999, overflow: "hidden", margin: "10px 0 7px" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 999, background: c.bar, width: b.progress + "%" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: c.bar, fontWeight: 600 }}>{label}</span>
                      <span style={{ color: "#94a3b8" }}>{MONTHS[Math.floor(b.start)]}–{MONTHS[Math.min(11, Math.floor(b.end))]}</span>
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
  const today = getRoadmapToday();
  const todayMonth = today.month + (today.day - 1) / daysInRoadmapMonth(today.month);
  const active = [];
  const upcoming = [];

  (rm.bars || []).forEach((barItem, idx) => {
    if (barItem.status === "done") return;
    const item = { ...barItem, idx };
    const startsNowOrPast = Number(barItem.start) <= todayMonth;
    const endsFuture = Number(barItem.end) > todayMonth;
    if (barItem.status === "progress" || (startsNowOrPast && endsFuture)) {
      active.push(item);
      return;
    }
    upcoming.push(item);
  });

  active.sort((a, b) => a.end - b.end || a.start - b.start);
  upcoming.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    now: active,
    next: upcoming.slice(0, 4),
    later: upcoming.slice(4),
  };
}

function NNLView({ rm, onBarClick }) {
  const grouped = buildNowNextLater(rm);
  const cols = [
    { key: "now",   label: "Now",   sub: "Сейчас в работе", color: "#3b6fe0" },
    { key: "next",  label: "Next",  sub: "Следующий шаг",   color: "#6d5bd0" },
    { key: "later", label: "Later", sub: "В перспективе",   color: "#8a96ad" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, padding: 20 }}>
      {cols.map(col => (
        <div key={col.key} style={{ background: "#f7f9fd", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 12px", color: col.color }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>{col.label}</span>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{col.sub}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "#fff", padding: "1px 8px", borderRadius: 999 }}>{grouped[col.key].length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grouped[col.key].length === 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: 20, border: "1.5px dashed #d6deeb", borderRadius: 8 }}>Пусто</div>
            )}
            {grouped[col.key].map((item, i) => {
              const statusColor = (BAR_COL[item.status] || BAR_COL.planned).bar;
              const startMonth = MONTHS[Math.max(0, Math.min(11, Math.floor(item.start)))];
              const endMonth = MONTHS[Math.max(0, Math.min(11, Math.floor(item.end)))];
              const label = item.status === "progress" ? `${item.progress}%` : "Запланировано";
              return (
              <div key={i} onClick={() => onBarClick && onBarClick(item, item.idx)} style={{
                display: "flex", flexDirection: "column", gap: 9,
                background: "#fff", border: "1px solid #e2edf8", borderTop: `3px solid ${col.color}`,
                borderRadius: 8, padding: "12px 13px", fontSize: 13, fontWeight: 600, color: "#1e3a6e",
                boxShadow: "0 1px 3px rgba(37,99,235,.04)", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span>{item.title}</span>
                  <Avatar member={OWNERS[item.owner]} size={22} />
                </div>
                <div style={{ height: 6, background: "#eef2f8", borderRadius: 999, overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${item.progress || 0}%`, height: "100%", background: statusColor, borderRadius: 999 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: statusColor }}>{label}</span>
                  <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{startMonth}–{endMonth}</span>
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
    width: "100%", height: 38, border: "1.5px solid #dbeafe", borderRadius: 8,
    padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none",
    color: "#1e3a6e", boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18,
        padding: 28, boxShadow: "0 24px 64px rgba(30,58,110,.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3a6e" }}>Новая дорожка</div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Название *</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus style={inputStyle} placeholder="Платформа" />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Цвет</label>
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
            padding: "9px 20px", borderRadius: 9, border: "1.5px solid #dbeafe",
            background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Отмена</button>
          <button type="submit" style={{
            padding: "9px 20px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff",
            fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Добавить</button>
        </div>
      </form>
    </div>
  );
}

function RoadmapDetail({ rm, onBack, onEdit, onSaveBar, onDeleteBar, onSaveMilestone, onDeleteMilestone, onSaveLane }) {
  const [tab, setTab]               = useState("timeline");
  const [barModal, setBarModal]     = useState(null); // null | "new" | { bar, idx }
  const [mileModal, setMileModal]   = useState(null); // null | "new" | { milestone, idx }
  const [laneModal, setLaneModal]   = useState(false);
  const sm = STATUS_META[rm.status] || STATUS_META.archived;
  const TABS = [
    { id: "timeline", label: "Timeline" },
    { id: "swim",     label: "Дорожки" },
    { id: "nnl",      label: "Now · Next · Later" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Шапка */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(37,99,235,.05)" }}>
        <button onClick={onBack} style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "#f1f5fb",
          border: "none", cursor: "pointer", display: "grid", placeItems: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round"><polyline points="15 6 9 12 15 18"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8", fontWeight: 600, marginBottom: 6 }}>
            <span style={{ cursor: "pointer", color: "#2563eb" }} onClick={onBack}>Дорожные карты</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
            <span>{rm.tag}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e3a6e" }}>{rm.title}</h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, color: sm.color, background: sm.bg, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sm.color }} />{sm.label}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>{rm.desc}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
          <button onClick={onEdit} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8, border: "1.5px solid #dbeafe",
            background: "#f8fbff", color: "#2563eb", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "Inter",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Редактировать
          </button>
          <div style={{ display: "flex", gap: 20, paddingLeft: 20, borderLeft: "1px solid #e8f0fa" }}>
            {[
              ["Владелец", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar member={OWNERS[rm.owner]} size={22} />{OWNERS[rm.owner]?.name}</div>],
              ["Период", rm.period],
              ["Прогресс", <span style={{ color: "#3b6fe0", fontWeight: 700 }}>{rm.progress}%</span>],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: ".05em" }}>{k.toUpperCase()}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1e3a6e", display: "flex", alignItems: "center", gap: 6 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e2edf8", borderRadius: 999, padding: 4, gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "Inter",
              background: tab === t.id ? "#2563eb" : "none",
              color: tab === t.id ? "#fff" : "#94a3b8",
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setLaneModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, border: "1px solid #e2edf8", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/></svg>
          Дорожка
        </button>
        <button onClick={() => setMileModal("new")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, border: "1px solid #e2edf8", background: "#fff", color: "#1e3a6e", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>
          <DiamondIcon size={14} />Добавить веху
        </button>
        <button onClick={() => setBarModal("new")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Добавить задачу
        </button>
      </div>

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
          lanes={rm.lanes}
          onClose={() => setBarModal(null)}
          onSave={data => onSaveBar(barModal === "new" ? null : barModal.idx, data)}
          onDelete={barModal !== "new" ? () => onDeleteBar(barModal.idx) : undefined}
        />
      )}

      {/* Контент вкладки */}
      <div style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(37,99,235,.05)" }}>
        {tab === "timeline" && <TimelineView rm={rm} onBarClick={(b, idx) => setBarModal({ bar: b, idx })} onMilestoneClick={(milestone, idx) => setMileModal({ milestone, idx })} />}
        {tab === "swim"     && <SwimlanesView rm={rm} onBarClick={(b, idx) => setBarModal({ bar: b, idx })} />}
        {tab === "nnl"      && <NNLView rm={rm} onBarClick={(b, idx) => setBarModal({ bar: b, idx })} />}
      </div>
    </div>
  );
}

// ── Главный экспорт ────────────────────────────────────────────────────────

function recalc(rm) {
  const total = rm.bars.length || 1;
  return {
    ...rm,
    progress: Math.round(rm.bars.reduce((a, b) => a + b.progress, 0) / total),
    tasksDone: rm.bars.filter(b => b.status === "done").length,
    tasksTotal: rm.bars.length,
  };
}

const LS_KEY = "dashboard_roadmaps_v1";

function loadRoadmaps() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore corrupted local roadmap state and fall back to samples.
  }
  return SAMPLE_ROADMAPS;
}

export default function RoadmapsSection() {
  const [confirmAction, confirmDialog] = useConfirmDialog();
  const [roadmaps, setRoadmaps] = useState(loadRoadmaps);
  const [openId, setOpenId]     = useState(null);
  const [rmModal, setRmModal]   = useState(null); // null | "new" | roadmap obj

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(roadmaps));
    } catch {
      // Local storage may be unavailable in private mode or restricted contexts.
    }
  }, [roadmaps]);

  const rm = openId ? roadmaps.find(r => r.id === openId) : null;

  function handleSaveRoadmap(data) {
    if (data.id) {
      setRoadmaps(rs => rs.map(r => r.id === data.id ? recalc({ ...r, ...data }) : r));
    } else {
      const newRm = recalc({
        ...data,
        id: "rm-" + Date.now(),
        milestones: data.milestones || [],
        lanes: data.lanes || [],
        bars: data.bars || [],
        nnl: data.nnl || { now: [], next: [], later: [] },
      });
      setRoadmaps(rs => [...rs, newRm]);
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
    setRoadmaps(rs => rs.filter(r => r.id !== roadmap.id));
    if (openId === roadmap.id) setOpenId(null);
  }

  function handleSaveBar(idx, data) {
    setRoadmaps(rs => rs.map(r => {
      if (r.id !== openId) return r;
      const bars = idx === null
        ? [...r.bars, data]
        : r.bars.map((b, i) => i === idx ? { ...b, ...data } : b);
      return recalc({ ...r, bars });
    }));
  }

  function handleDeleteBar(idx) {
    setRoadmaps(rs => rs.map(r => {
      if (r.id !== openId) return r;
      return recalc({ ...r, bars: r.bars.filter((_, i) => i !== idx) });
    }));
  }

  function handleSaveMilestone(idx, data) {
    setRoadmaps(rs => rs.map(r =>
      r.id !== openId
        ? r
        : {
            ...r,
            milestones: idx === null
              ? [...r.milestones, data]
              : r.milestones.map((m, i) => i === idx ? { ...m, ...data } : m),
          }
    ));
  }

  function handleDeleteMilestone(idx) {
    setRoadmaps(rs => rs.map(r =>
      r.id !== openId ? r : { ...r, milestones: r.milestones.filter((_, i) => i !== idx) }
    ));
  }

  function handleSaveLane(data) {
    setRoadmaps(rs => rs.map(r =>
      r.id !== openId ? r : { ...r, lanes: [...r.lanes, data] }
    ));
  }

  if (rm) {
    return (
      <>
        {rmModal && (
          <RoadmapFormModal
            roadmap={rmModal === "edit" ? rm : null}
            onClose={() => setRmModal(null)}
            onSave={handleSaveRoadmap}
            onDelete={handleDeleteRoadmap}
          />
        )}
        {confirmDialog}
        <RoadmapDetail
          rm={rm}
          onBack={() => setOpenId(null)}
          onEdit={() => setRmModal("edit")}
          onSaveBar={handleSaveBar}
          onDeleteBar={handleDeleteBar}
          onSaveMilestone={handleSaveMilestone}
          onDeleteMilestone={handleDeleteMilestone}
          onSaveLane={handleSaveLane}
        />
      </>
    );
  }

  return (
    <>
      {rmModal && (
        <RoadmapFormModal
          roadmap={null}
          onClose={() => setRmModal(null)}
          onSave={handleSaveRoadmap}
          onDelete={handleDeleteRoadmap}
        />
      )}
      {confirmDialog}
      <CatalogView roadmaps={roadmaps} onOpen={setOpenId} onNew={() => setRmModal("new")} />
    </>
  );
}
