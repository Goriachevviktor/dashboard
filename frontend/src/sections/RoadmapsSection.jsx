import React from 'react';
import { useState } from 'react';
import { useViewportFlags } from '../utils.js';

const SAMPLE_ROADMAPS = [
  {
    id: 1,
    title: "Продуктовая дорожная карта 2026",
    description: "Ключевые инициативы и релизы на год",
    color: "#2563eb",
    items: [
      { id: 1, title: "Q1: Запуск модуля аналитики", start: 0, duration: 3, status: "done", assignee: "Виктор" },
      { id: 2, title: "Q2: Рефакторинг API", start: 3, duration: 2, status: "in_progress", assignee: "Команда" },
      { id: 3, title: "Q3: Мобильное приложение", start: 5, duration: 3, status: "planned", assignee: null },
      { id: 4, title: "Q4: Интеграции", start: 8, duration: 4, status: "planned", assignee: null },
    ],
  },
];

const STATUS_COLOR = {
  done: { bg: "#dcfce7", text: "#15803d", border: "#86efac", label: "Выполнено" },
  in_progress: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd", label: "В работе" },
  planned: { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1", label: "Запланировано" },
  blocked: { bg: "#fef2f2", text: "#b91c1c", border: "#fca5a5", label: "Заблокировано" },
};

const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const TOTAL_MONTHS = 12;

function GanttBar({ item, totalMonths }) {
  const left = (item.start / totalMonths) * 100;
  const width = (item.duration / totalMonths) * 100;
  const s = STATUS_COLOR[item.status] || STATUS_COLOR.planned;
  return (
    <div style={{ position: "relative", height: 36, marginBottom: 6 }}>
      <div style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        height: "100%",
        background: s.bg,
        border: `1.5px solid ${s.border}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        overflow: "hidden",
        boxSizing: "border-box",
        minWidth: 2,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: s.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.title}
        </span>
        {item.assignee && (
          <span style={{ marginLeft: 8, fontSize: 11, color: s.text, opacity: 0.7, whiteSpace: "nowrap", flexShrink: 0 }}>
            · {item.assignee}
          </span>
        )}
      </div>
    </div>
  );
}

function RoadmapCard({ roadmap, onEdit }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2edf8", padding: "20px 24px", boxShadow: "0 1px 4px rgba(37,99,235,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: roadmap.color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>{roadmap.title}</div>
          {roadmap.description && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{roadmap.description}</div>}
        </div>
        <button onClick={() => onEdit(roadmap)} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>
          Редактировать
        </button>
      </div>

      {/* Month header */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${TOTAL_MONTHS}, 1fr)`, marginBottom: 8 }}>
        {MONTHS.map(m => (
          <div key={m} style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textAlign: "center", letterSpacing: 0.3 }}>{m}</div>
        ))}
      </div>

      {/* Month lines */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${TOTAL_MONTHS}, 1fr)`, pointerEvents: "none", zIndex: 0 }}>
          {MONTHS.map((_, i) => (
            <div key={i} style={{ borderLeft: i > 0 ? "1px dashed #e8f0fa" : "none" }} />
          ))}
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          {roadmap.items.map(item => (
            <GanttBar key={item.id} item={item} totalMonths={TOTAL_MONTHS} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
        {Object.entries(STATUS_COLOR).map(([key, s]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.bg, border: `1px solid ${s.border}` }} />
            <span style={{ fontSize: 11, color: "#64748b" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapModal({ roadmap, onClose, onSave }) {
  const [title, setTitle] = useState(roadmap?.title || "");
  const [description, setDescription] = useState(roadmap?.description || "");
  const [color, setColor] = useState(roadmap?.color || "#2563eb");
  const COLORS = ["#2563eb","#8b5cf6","#10b981","#f59e0b","#ef4444","#0ea5e9","#6366f1"];

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...(roadmap || {}), title, description, color, items: roadmap?.items || [] });
    onClose();
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 24px 64px rgba(30,58,110,.18)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1e3a6e", marginBottom: 20 }}>
          {roadmap ? "Редактировать карту" : "Новая дорожная карта"}
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Название</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required autoFocus
          style={{ width: "100%", height: 40, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 16 }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Описание</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          style={{ width: "100%", height: 40, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 16 }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Цвет</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: color === c ? "3px solid #1e3a6e" : "3px solid transparent", cursor: "pointer", outline: "none" }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Отмена</button>
          <button type="submit" style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}

export default function RoadmapsSection() {
  const { isMobile } = useViewportFlags();
  const [roadmaps, setRoadmaps] = useState(SAMPLE_ROADMAPS);
  const [modal, setModal] = useState(null);

  function handleSave(data) {
    if (data.id) {
      setRoadmaps(rs => rs.map(r => r.id === data.id ? data : r));
    } else {
      setRoadmaps(rs => [...rs, { ...data, id: Date.now(), items: [] }]);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {modal && <RoadmapModal roadmap={modal === "new" ? null : modal} onClose={() => setModal(null)} onSave={handleSave} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: "#94a3b8" }}>{roadmaps.length} {roadmaps.length === 1 ? "карта" : "карт"}</div>
        </div>
        <button onClick={() => setModal("new")}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          Добавить карту
        </button>
      </div>

      {/* Roadmap cards */}
      {roadmaps.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: 16, border: "1.5px dashed #bfdbfe", color: "#94a3b8" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 12px", display: "block", opacity: .4 }}>
            <path d="M3 7h18M3 12h12M3 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Нет дорожных карт</div>
          <div style={{ fontSize: 13 }}>Нажмите «Добавить карту» чтобы начать</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {roadmaps.map(r => <RoadmapCard key={r.id} roadmap={r} onEdit={setModal} />)}
        </div>
      )}
    </div>
  );
}
