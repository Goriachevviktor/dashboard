import { useState, useEffect, useRef } from 'react';
import StatCard from '../components/common/StatCard.jsx';
import Avatar from '../components/common/Avatar.jsx';
import AssigneePicker from '../components/common/AssigneePicker.jsx';
import { ConfirmDialog, useConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useViewportFlags, formatShortDate, parseTaskDueDate, isTaskOverdue, findTeamMember } from '../utils.js';

function TaskDetailModal({ task, onClose, onSave, team = [], currentUser = null }) {
  const { isMobile } = useViewportFlags();
  const scrollRef = useRef(null);
  const touchStartY = useRef(0);
  const mobileDateInputRef = useRef(null);
  function formatDueForMobile(value) {
    if (!value || value === "—") return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [, , month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return `${day}.${month}`;
    }
    return value;
  }
  function normalizeMobileDue(value) {
    const text = String(value || "").trim();
    if (!text || text === "—") return "";
    const full = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    const short = text.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
    if (!full && !short) return text;
    const day = (full?.[1] || short?.[1] || "").padStart(2, "0");
    const month = (full?.[2] || short?.[2] || "").padStart(2, "0");
    const year = full?.[3] || String(new Date().getFullYear());
    return `${year}-${month}-${day}`;
  }
  function openMobileDatePicker() {
    const node = mobileDateInputRef.current;
    if (!node) return;
    if (typeof node.showPicker === "function") {
      node.showPicker();
      return;
    }
    node.focus();
    node.click();
  }
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [column, setColumn] = useState(task.column);
  const [due, setDue] = useState(isMobile ? formatDueForMobile(task.due) : (task.due === "—" ? "" : task.due));
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [ownerId, setOwnerId] = useState(task.ownerId);
  const [error, setError] = useState("");

  const priColor = { "Высокий": "#ef4444", "Средний": "#f59e0b", "Низкий": "#10b981" };
  const colColor = { "Беклог": "#94a3b8", "В работе": "#2563eb", "Готов": "#10b981", "Архив": "#64748b" };

  function handleSave() {
    if (!title.trim()) { setError("Введите название задачи"); return; }
    const normalizedDue = isMobile ? normalizeMobileDue(due) : due;
    onSave({ ...task, title: title.trim(), description: description.trim(), priority, column, due: normalizedDue || "—", assigneeId, ownerId });
    onClose();
  }

  function handleBackdrop(e) { if (e.target === e.currentTarget) onClose(); }

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (isMobile) {
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    }
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      if (isMobile) window.scrollTo(0, scrollY);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    let startY = 0;
    function onTouchStart(event) {
      startY = event.touches?.[0]?.clientY || 0;
    }
    function onTouchMove(event) {
      const scroller = scrollRef.current;
      if (!scroller || !scroller.contains(event.target)) {
        event.preventDefault();
        return;
      }
      const scrollable = scroller.scrollHeight > scroller.clientHeight + 1;
      if (!scrollable) {
        event.preventDefault();
        return;
      }
      const currentY = event.touches?.[0]?.clientY || 0;
      const deltaY = currentY - startY;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight;
      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, [isMobile]);

  function handleModalTouchStart(e) {
    touchStartY.current = e.touches?.[0]?.clientY || 0;
  }

  function handleModalTouchMove(e) {
    if (!isMobile) return;
    const scroller = scrollRef.current;
    if (!scroller || !scroller.contains(e.target)) {
      e.preventDefault();
      return;
    }
    const currentY = e.touches?.[0]?.clientY || 0;
    const deltaY = currentY - touchStartY.current;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight;
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      e.preventDefault();
    }
  }

  const labelStyle = { fontSize: isMobile ? 11 : 12, fontWeight: 700, color: "#64748b", marginBottom: isMobile ? 5 : 6, display: "block", letterSpacing: .3 };
  const inputStyle = { width: "100%", padding: isMobile ? "10px 12px" : "10px 14px", borderRadius: isMobile ? 12 : 10, border: "1.5px solid #e2edf8", fontSize: 14, color: "#1e3a6e", fontFamily: "Inter", outline: "none", background: "#f8fafc", transition: "border-color .15s" };
  const owner = findTeamMember(team, ownerId);
  const assignee = findTeamMember(team, assigneeId);
  const segmentButtonStyle = (active, color) => ({
    flex: 1,
    minHeight: isMobile ? 32 : 40,
    padding: isMobile ? "5px 3px" : "9px 4px",
    borderRadius: isMobile ? 11 : 9,
    border: "1.5px solid " + (active ? color : "#e2edf8"),
    background: active ? color + "18" : "#f8fafc",
    color: active ? color : "#64748b",
    fontSize: isMobile ? 11 : 12,
    fontWeight: active ? 750 : 500,
    cursor: "pointer",
    fontFamily: "Inter",
    transition: "all .15s",
    lineHeight: 1.1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  function priorityIcon(value) {
    if (value === "Высокий") {
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="8" cy="12.2" r="1.2" fill="currentColor"/></svg>;
    }
    if (value === "Средний") {
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
    }
    return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 6l3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }
  function columnIcon(value) {
    if (value === "Беклог") {
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
    }
    if (value === "В работе") {
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l5 4-5 4V4z" fill="currentColor"/></svg>;
    }
    if (value === "Архив") {
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 5h10v7.5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5V5zM2.5 3h11v2h-11zM6 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    }
    return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.3l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }

  return (
    <div onClick={handleBackdrop} onTouchStart={handleModalTouchStart} onTouchMove={handleModalTouchMove} style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", padding: isMobile ? "calc(var(--safe-top) + 14px) 14px calc(var(--mobile-tabbar-height) + var(--safe-bottom) + 14px)" : 0, overscrollBehavior: "none", touchAction: isMobile ? "none" : "auto" }}>
      <div style={{ background: "#fff", borderRadius: isMobile ? 22 : 20, width: isMobile ? "100%" : "min(92vw, 560px)", height: isMobile ? "min(66dvh, 610px)" : undefined, maxHeight: isMobile ? "min(66dvh, 610px)" : "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(37,99,235,.22)", animation: "modalIn .2s ease", overflow: "hidden", touchAction: "auto" }}>

        {/* Header */}
        <div style={{ padding: isMobile ? "14px 18px 10px" : "22px 28px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, paddingRight: 16 }}>
            <div style={{ fontSize: isMobile ? 17 : 16, fontWeight: 800, color: "#1e3a6e", lineHeight: 1.2 }}>Редактирование задачи</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: isMobile ? 6 : 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: priColor[priority], background: priColor[priority]+"18", padding: "3px 9px", borderRadius: 20 }}>{priority}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: colColor[column], background: colColor[column]+"18", padding: "3px 9px", borderRadius: 20 }}>{column}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: isMobile ? 36 : 32, height: isMobile ? 36 : 32, borderRadius: "50%", border: "none", background: "#f0f6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} style={{ padding: isMobile ? "12px 18px" : "22px 28px", display: "flex", flexDirection: "column", gap: isMobile ? 10 : 18, overflowY: "auto", flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", background: "#f8fafc", border: "1px solid #e2edf8", borderRadius: 999, padding: "6px 10px" }}>
              Автор: {owner ? owner.name : "Не указан"}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a6e", background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: 999, padding: "6px 10px" }}>
              Исполнитель: {assignee ? assignee.name : "Не назначен"}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Название задачи *</label>
            <input value={title}
              onChange={e => { setTitle(e.target.value); setError(""); }}
              placeholder="Название задачи"
              style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#e2edf8", fontSize: isMobile ? 15 : 15, fontWeight: 700, height: isMobile ? 42 : undefined }}
              onFocus={e => e.target.style.borderColor = "#93c5fd"}
              onBlur={e => e.target.style.borderColor = error ? "#ef4444" : "#e2edf8"} />
            {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Добавьте контекст, детали, критерии приёмки..."
              rows={isMobile ? 3 : 4}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, minHeight: isMobile ? 86 : undefined }}
              onFocus={e => e.target.style.borderColor = "#93c5fd"}
              onBlur={e => e.target.style.borderColor = "#e2edf8"} />
          </div>

          {/* Priority + Column */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr 1fr", gap: isMobile ? 8 : 14 }}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Приоритет</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["Высокий","Средний","Низкий"].map(p => (
                  <button key={p} onClick={() => setPriority(p)} title={p} aria-label={p} style={segmentButtonStyle(priority===p, priColor[p])}>
                    {isMobile ? priorityIcon(p) : p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Колонка</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["Беклог","В работе","Готов"].map(c => (
                  <button key={c} onClick={() => setColumn(c)} title={c} aria-label={c} style={segmentButtonStyle(column===c, colColor[c])}>
                    {isMobile ? columnIcon(c) : c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Due + Assignee */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, .72fr) minmax(0, 1.28fr)" : "1fr 1fr", gap: isMobile ? 8 : 14 }}>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <label style={labelStyle}>Срок</label>
              {isMobile ? (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={openMobileDatePicker}
                    style={{ ...inputStyle, minWidth: 0, height: 40, paddingLeft: 10, paddingRight: 8, textAlign: "left", color: due ? "#1e3a6e" : "#c0c8d6", fontWeight: 700, cursor: "pointer" }}
                  >
                    {due || "дд.мм"}
                  </button>
                  <input
                    ref={mobileDateInputRef}
                    type="date"
                    value={normalizeMobileDue(due)}
                    onChange={e => setDue(formatDueForMobile(e.target.value))}
                    aria-label="Выбрать срок"
                    style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                    tabIndex={-1}
                  />
                </div>
              ) : (
                <input type="date" value={due} onChange={e => setDue(e.target.value)}
                  style={{ ...inputStyle, minWidth: 0 }}
                  onFocus={e => e.target.style.borderColor = "#93c5fd"}
                  onBlur={e => e.target.style.borderColor = "#e2edf8"} />
              )}
            </div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <label style={labelStyle}>Исполнитель</label>
              <div style={{ position: "relative" }}>
                <select value={assigneeId || ""} onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
                  style={{ ...inputStyle, minWidth: 0, height: isMobile ? 40 : undefined, cursor: "pointer", paddingLeft: assignee ? (isMobile ? 32 : 40) : (isMobile ? 10 : 14), paddingRight: isMobile ? 22 : undefined }}>
                  <option value="">— Не назначен —</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {assignee && (
                  <div style={{ position: "absolute", left: isMobile ? 8 : 10, top: "50%", transform: "translateY(-50%)", width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, borderRadius: "50%", background: assignee.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, pointerEvents: "none" }}>{assignee.initials}</div>
                )}
              </div>
            </div>
          </div>

          {currentUser?.role === "admin" && (
            <div>
              <label style={labelStyle}>Автор</label>
              <div style={{ position: "relative" }}>
                <select value={ownerId || ""} onChange={e => setOwnerId(e.target.value ? Number(e.target.value) : null)}
                  style={{ ...inputStyle, cursor: "pointer", paddingLeft: owner ? (isMobile ? 32 : 40) : (isMobile ? 10 : 14) }}>
                  <option value="">— Не указан —</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {owner && (
                  <div style={{ position: "absolute", left: isMobile ? 8 : 10, top: "50%", transform: "translateY(-50%)", width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, borderRadius: "50%", background: owner.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, pointerEvents: "none" }}>{owner.initials}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "10px 18px 12px" : "16px 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #f0f6ff", flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: isMobile ? 1 : "unset", padding: isMobile ? "10px 14px" : "10px 20px", borderRadius: isMobile ? 12 : 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
          <button onClick={handleSave} style={{ flex: isMobile ? 1.35 : "unset", padding: isMobile ? "10px 14px" : "10px 24px", borderRadius: isMobile ? 12 : 10, border: "none", background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 12px rgba(37,99,235,.3)" }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
function AddTaskModal({ onClose, onAdd, team = [] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Средний");
  const [column, setColumn] = useState("Беклог");
  const [due, setDue] = useState("");
  const [assigneeId, setAssigneeId] = useState(null);
  const [error, setError] = useState("");

  const priColor = { "Высокий": "#ef4444", "Средний": "#f59e0b", "Низкий": "#10b981" };
  const colColor = { "Беклог": "#94a3b8", "В работе": "#2563eb", "Готов": "#10b981", "Архив": "#64748b" };

  function handleSubmit() {
    if (!title.trim()) { setError("Введите название задачи"); return; }
    onAdd({ title: title.trim(), description: description.trim(), priority, column, due: due || "—", assigneeId });
    onClose();
  }

  function handleBackdrop(e) { if (e.target === e.currentTarget) onClose(); }

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block", letterSpacing: .3 };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2edf8", fontSize: 14, color: "#1e3a6e", fontFamily: "Inter", outline: "none", background: "#f8fafc", transition: "border-color .15s" };

  return (
    <div onClick={handleBackdrop} style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "min(92vw, 520px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(37,99,235,.20)", animation: "modalIn .2s ease" }}>
        <style>{`@keyframes modalIn { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:none; } }`}</style>

        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>Новая задача</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Заполните поля и добавьте задачу на доску</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f0f6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Название задачи *</label>
            <input autoFocus value={title}
              onChange={e => { setTitle(e.target.value); setError(""); }}
              placeholder="Кратко и ясно опишите суть задачи"
              style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#e2edf8" }}
              onFocus={e => e.target.style.borderColor = error ? "#ef4444" : "#93c5fd"}
              onBlur={e => e.target.style.borderColor = error ? "#ef4444" : "#e2edf8"} />
            {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Добавьте контекст, детали, критерии приёмки..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = "#93c5fd"}
              onBlur={e => e.target.style.borderColor = "#e2edf8"} />
          </div>

          {/* Priority + Column */}
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Приоритет</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["Высокий","Средний","Низкий"].map(p => (
                  <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "1.5px solid " + (priority===p ? priColor[p] : "#e2edf8"), background: priority===p ? priColor[p]+"18" : "#f8fafc", color: priority===p ? priColor[p] : "#64748b", fontSize: 12, fontWeight: priority===p ? 600 : 400, cursor: "pointer", fontFamily: "Inter", transition: "all .15s" }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Колонка</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["Беклог","В работе","Готов"].map(c => (
                  <button key={c} onClick={() => setColumn(c)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "1.5px solid " + (column===c ? colColor[c] : "#e2edf8"), background: column===c ? colColor[c]+"18" : "#f8fafc", color: column===c ? colColor[c] : "#64748b", fontSize: 12, fontWeight: column===c ? 600 : 400, cursor: "pointer", fontFamily: "Inter", transition: "all .15s" }}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Due + Assignee */}
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Срок</label>
              <input type="date" value={due} onChange={e => setDue(e.target.value)}
                style={{ ...inputStyle }}
                onFocus={e => e.target.style.borderColor = "#93c5fd"}
                onBlur={e => e.target.style.borderColor = "#e2edf8"} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Исполнитель</label>
              <select value={assigneeId || ""} onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">— Не назначен —</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #f0f6ff" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
          <button onClick={handleSubmit} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 12px rgba(37,99,235,.3)" }}>Добавить задачу</button>
        </div>
      </div>
    </div>
  );
}

// ---- KANBAN CARD ----
function KanbanCard({ task, onChangeAssignee, onDragStart, onDragEnd, onEdit, onDelete, onMove, onArchive, team = [], currentUser = null }) {
  const { isMobile } = useViewportFlags();
  const priColor = { "Высокий": "#ef4444", "Средний": "#f59e0b", "Низкий": "#10b981" };
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const owner = findTeamMember(team, task.ownerId);
  const assignee = findTeamMember(team, task.assigneeId);
  const canDelete = currentUser?.role === "admin" || currentUser?.id === task.ownerId;
  const canArchive = ["Готов", "Готово"].includes(task.column);
  const overdue = isTaskOverdue(task);
  const cardBorderColor = overdue ? "#fca5a5" : "#e8f1fd";
  const cardShadow = overdue
    ? "0 1px 4px rgba(239,68,68,.10), 0 8px 24px rgba(239,68,68,.08)"
    : (isMobile ? "0 1px 3px rgba(37,99,235,.06)" : "0 1px 4px rgba(37,99,235,.07), 0 2px 12px rgba(37,99,235,.05)");

  function handleDragStart(e) {
    setDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("taskId", String(task.id));
    onDragStart && onDragStart(task.id);
  }
  function handleDragEnd() {
    setDragging(false);
    onDragEnd && onDragEnd();
  }

  return (
    <div
      draggable={!isMobile}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={e => { if (!dragging) onEdit && onEdit(task); }}
      style={{ background: overdue ? "#fff7f7" : "#fff", borderRadius: isMobile ? 14 : 12, padding: isMobile ? "12px" : "14px 16px", boxShadow: dragging ? "0 8px 32px rgba(37,99,235,.18)" : cardShadow, border: "1px solid " + (dragging ? "#93c5fd" : cardBorderColor), cursor: dragging ? "grabbing" : "pointer", transition: "box-shadow .15s, opacity .15s, transform .15s, border-color .15s, background .15s", opacity: dragging ? 0.55 : 1, transform: dragging ? "rotate(1.5deg) scale(1.02)" : "none", userSelect: "none", touchAction: "manipulation" }}
      onMouseEnter={e => { if (!dragging) { e.currentTarget.style.boxShadow = overdue ? "0 6px 24px rgba(239,68,68,.16)" : "0 4px 20px rgba(37,99,235,.13)"; e.currentTarget.style.borderColor = overdue ? "#ef4444" : "#bdd7f5"; } }}
      onMouseLeave={e => { if (!dragging) { e.currentTarget.style.boxShadow = cardShadow; e.currentTarget.style.borderColor = cardBorderColor; } }}>

      {/* Header: dot + title + priority badge */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: isMobile ? 10 : 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: priColor[task.priority], flexShrink: 0, marginTop: 4 }}></div>
        <div style={{ flex: 1, fontSize: isMobile ? 14 : 13, fontWeight: isMobile ? 750 : 600, color: "#1e3a6e", lineHeight: 1.35 }}>{task.title}</div>
        <span style={{ fontSize: 10, fontWeight: 600, color: priColor[task.priority], background: priColor[task.priority]+"18", padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>{task.priority}</span>
        {overdue && <span style={{ fontSize: 10, fontWeight: 750, color: "#b91c1c", background: "#fee2e2", padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>Просрочено</span>}
        {canArchive && (
          <button
            onClick={e => { e.stopPropagation(); onArchive && onArchive(task.id); }}
            title="Переместить в архив"
            style={{ width: 24, height: 24, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 5h10v7.5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5V5zM2.5 3h11v2h-11zM6 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete && onDelete(task.id); }}
            title="Удалить задачу"
            style={{ width: 24, height: 24, borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V3h4v1m-5 2 .4 5h5.2L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* Description */}
      {!isMobile && task.description && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, overflow: "hidden", maxHeight: expanded ? 200 : 38, transition: "max-height .2s ease" }}>
            {task.description}
          </div>
          {task.description.length > 70 && (
            <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "Inter", fontWeight: 500 }}>
              {expanded ? "Скрыть ▲" : "Подробнее ▼"}
            </button>
          )}
        </div>
      )}

      {/* Mobile description / desktop assignee picker */}
      {isMobile ? (
        task.description && (
          <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 12, background: "#f8fbff", border: "1px solid #e2edf8", color: "#64748b", fontSize: 12, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {task.description}
          </div>
        )
      ) : (
        <div style={{ marginBottom: 10 }} onClick={e => e.stopPropagation()}>
          <AssigneePicker assigneeId={task.assigneeId} onChange={id => onChangeAssignee(task.id, id)} team={team} />
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "3px 8px", borderRadius: 999 }}>
          Автор: {owner ? owner.name.split(" ")[0] : "Не указан"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#1e3a6e", background: "#eff6ff", padding: "3px 8px", borderRadius: 999 }}>
          Исп.: {assignee ? assignee.name.split(" ")[0] : "Не назначен"}
        </span>
      </div>

      {/* Footer: due */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="2" width="9" height="8" rx="1.5" stroke={overdue ? "#ef4444" : "#94a3b8"} strokeWidth="1" fill="none"/><path d="M3.5 1v2M7.5 1v2" stroke={overdue ? "#ef4444" : "#94a3b8"} strokeWidth="1" strokeLinecap="round"/></svg>
          <span style={{ fontSize: 11, color: overdue ? "#b91c1c" : "#94a3b8", fontWeight: overdue ? 750 : 400 }}>{overdue ? "просрочено: " : "до "}{formatShortDate(task.due)}</span>
        </div>
        {isMobile ? (
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 132 }}>{assignee ? assignee.name.split(" ")[0] : "Без исполнителя"}</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: .25, cursor: "grab" }}>
            <circle cx="4" cy="4" r="1.2" fill="#64748b"/><circle cx="10" cy="4" r="1.2" fill="#64748b"/>
            <circle cx="4" cy="10" r="1.2" fill="#64748b"/><circle cx="10" cy="10" r="1.2" fill="#64748b"/>
          </svg>
        )}
      </div>
    </div>
  );
}

// ---- TASKS SECTION ----

function TasksSection({ initialTasks = [], team = [], api, onError, currentUser = null }) {
  const { isCompact, isMobile } = useViewportFlags();
  const [confirmDelete, confirmDialog] = useConfirmDialog();
  const [tasks, setTasks] = useState(initialTasks);
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  // Filters
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [mobileColumn, setMobileColumn] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const currentUserId = currentUser?.id ?? null;

  const COLUMNS = ["Беклог", "В работе", "Готов"];
  const colColor  = { "Беклог": "#64748b", "В работе": "#2563eb", "Готов": "#10b981", "Архив": "#64748b" };
  const colBg     = { "Беклог": "#f1f5f9", "В работе": "#eff6ff", "Готов": "#f0fdf4", "Архив": "#f8fafc" };
  const colBorder = { "Беклог": "#e2edf8", "В работе": "#bdd7f5", "Готов": "#bbf7d0", "Архив": "#cbd5e1" };
  const colDropBg = { "Беклог": "#e8edf5", "В работе": "#dbeafe", "Готов": "#dcfce7", "Архив": "#e2e8f0" };

  useEffect(() => setTasks(initialTasks), [initialTasks]);

  function normalizeTaskColumn(column) {
    return column === "Готово" ? "Готов" : column;
  }

  function isArchiveColumn(column) {
    return column === "Архив";
  }

  function isDoneColumn(column) {
    return ["Готов", "Готово"].includes(column);
  }

  async function archiveTask(taskId) {
    return moveTask(taskId, "Архив");
  }

  async function changeAssignee(taskId, newId) {
    try {
      const updated = await api.patchTask(taskId, { assigneeId: newId });
      setTasks(ts => ts.map(t => t.id === taskId ? updated : t));
    } catch (error) {
      onError(error);
    }
  }

  async function moveTask(taskId, newCol) {
    try {
      const targetColumn = normalizeTaskColumn(newCol);
      const updated = await api.patchTask(taskId, { column: targetColumn });
      setTasks(ts => ts.map(t => t.id === taskId ? updated : t));
    } catch (error) {
      onError(error);
    }
  }

  async function addTask(data) {
    try {
      const payload = { ...data, column: normalizeTaskColumn(data.column) };
      const created = await api.createTask(payload);
      setTasks(ts => [...ts, created]);
    } catch (error) {
      onError(error);
    }
  }

  async function saveTask(updated) {
    try {
      const payload = { ...updated, column: normalizeTaskColumn(updated.column) };
      const saved = await api.patchTask(updated.id, payload);
      setTasks(ts => ts.map(t => t.id === saved.id ? saved : t));
    } catch (error) {
      onError(error);
    }
  }
  async function deleteTask(taskId) {
    const task = tasks.find(item => item.id === taskId);
    const confirmed = await confirmDelete({
      title: "Удалить задачу?",
      message: "Задача сразу исчезнет из доски. Это действие нельзя отменить.",
      itemTitle: task?.title,
      confirmText: "Удалить",
    });
    if (!confirmed) return;
    try {
      await api.deleteTask(taskId);
      setTasks(ts => ts.filter(t => t.id !== taskId));
      if (editTask?.id === taskId) setEditTask(null);
    } catch (error) {
      onError(error);
    }
  }

  // Drag handlers on columns
  function handleDragOver(e, col) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }

  function handleDrop(e, col) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("taskId"));
    if (id) moveTask(id, col);
    setDragOverCol(null);
    setDraggingId(null);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null);
  }

  const scopeTasks = tasks.filter(t => {
    if (scopeFilter === "owned") return currentUserId != null && t.ownerId === currentUserId;
    if (scopeFilter === "assigned") return currentUserId != null && t.assigneeId === currentUserId;
    if (scopeFilter === "unassigned") return !t.assigneeId;
    return true;
  });

  const activeScopeTasks = scopeTasks.filter(t => !isArchiveColumn(t.column));

  // Filtered tasks
  const filtered = activeScopeTasks.filter(t => {
    const matchAssignee = filterAssignee === "all" || String(t.assigneeId) === filterAssignee;
    const matchPriority = filterPriority === "all" || t.priority === filterPriority;
    return matchAssignee && matchPriority;
  });
  const mobileStatusFilter = [...COLUMNS, "all", "unassigned"].includes(mobileColumn) ? mobileColumn : "all";
  const mobileFiltered = filtered.filter(t => {
    if (mobileStatusFilter === "unassigned") return !t.assigneeId && !isArchiveColumn(t.column);
    if (mobileStatusFilter === "all") return !isArchiveColumn(t.column);
    return normalizeTaskColumn(t.column) === mobileStatusFilter;
  });

  const filterBtnStyle = (active) => ({
    padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (active ? "#2563eb" : "#e2edf8"),
    background: active ? "#eff6ff" : "#fff", color: active ? "#2563eb" : "#64748b",
    fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "Inter", transition: "all .15s", whiteSpace: "nowrap"
  });

  const scopeControls = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[
        { id: "all", label: "Все доступные" },
        { id: "owned", label: "Созданные мной" },
        { id: "assigned", label: "Назначенные мне" },
        { id: "unassigned", label: "Без исполнителя" },
      ].map(option => (
        <button key={option.id} onClick={() => setScopeFilter(option.id)} style={filterBtnStyle(scopeFilter === option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );

  if (isMobile) {
    const mobileSelectStyle = {
      width: "100%",
      height: 40,
      borderRadius: 12,
      border: "1.5px solid #dbeafe",
      background: "#f8fbff",
      color: "#1e3a6e",
      padding: "0 8px",
      fontFamily: "Inter",
      fontSize: 12,
      fontWeight: 800,
      outline: "none",
    };
    const mobileFilterLabel = {
      fontSize: 8,
      fontWeight: 850,
      color: "#94a3b8",
      letterSpacing: .45,
      textTransform: "uppercase",
      marginBottom: 5,
    };
    const mobileListTitle =
      mobileStatusFilter === "unassigned" ? "Без исполнителя" :
      mobileStatusFilter === "Готов" ? "Готовые задачи" :
      "Активные задачи";
    const mobileStatButton = (active) => ({
      width: "100%",
      border: "1.5px solid " + (active ? "#93c5fd" : "transparent"),
      borderRadius: 12,
      background: "transparent",
      padding: 0,
      cursor: "pointer",
      fontFamily: "Inter",
      textAlign: "left",
      boxShadow: active ? "0 0 0 2px rgba(37,99,235,.08)" : "none",
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {confirmDialog}
        {showModal && <AddTaskModal onClose={() => setShowModal(false)} onAdd={addTask} team={team} />}
        {editTask && <TaskDetailModal task={editTask} onClose={() => setEditTask(null)} onSave={saveTask} team={team} currentUser={currentUser} />}

        {scopeControls}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          <button onClick={() => setMobileColumn("all")} style={mobileStatButton(mobileStatusFilter === "all")}>
            <StatCard compact label="Всего задач" value={activeScopeTasks.length} sub="на доске" color="#1e3a6e"/>
          </button>
          <button onClick={() => setMobileColumn("Беклог")} style={mobileStatButton(mobileStatusFilter === "Беклог")}>
            <StatCard compact label="Беклог" value={scopeTasks.filter(t=>t.column==="Беклог").length} sub="ожидают" color="#64748b"/>
          </button>
          <button onClick={() => setMobileColumn("В работе")} style={mobileStatButton(mobileStatusFilter === "В работе")}>
            <StatCard compact label="В работе" value={scopeTasks.filter(t=>t.column==="В работе").length} sub="активных" color="#2563eb"/>
          </button>
          <button onClick={() => setMobileColumn("Готов")} style={mobileStatButton(mobileStatusFilter === "Готов")}>
            <StatCard compact label="Готово" value={scopeTasks.filter(t=>isDoneColumn(t.column)).length} sub="7 дней" color="#10b981"/>
          </button>
          <button onClick={() => { setFilterAssignee("all"); setMobileColumn("unassigned"); }} style={mobileStatButton(mobileStatusFilter === "unassigned")}>
            <StatCard compact label="Без исполнителя" value={scopeTasks.filter(t=>!t.assigneeId && !isArchiveColumn(t.column)).length} sub="назначить" color="#f59e0b"/>
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 8px 22px rgba(37,99,235,.06)", border: "1px solid #e2edf8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 850, color: "#1e3a6e", lineHeight: 1.15 }}>{mobileListTitle}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{mobileFiltered.length} из {activeScopeTasks.length} на экране</div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              title="Добавить задачу"
              style={{ width: 46, height: 46, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 8px 18px rgba(37,99,235,.28)", flexShrink: 0 }}
            >
              <svg width="20" height="20" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: (filterAssignee !== "all" || filterPriority !== "all" || mobileColumn !== "all") ? 10 : 14 }}>
            <div>
              <div style={mobileFilterLabel}>Исполнитель</div>
              <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={mobileSelectStyle}>
                <option value="all">Все</option>
                {team.map(m => <option key={m.id} value={String(m.id)}>{m.name.split(" ")[0]}</option>)}
              </select>
            </div>
            <div>
              <div style={mobileFilterLabel}>Приоритет</div>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={mobileSelectStyle}>
                <option value="all">Все</option>
                <option value="Высокий">Высокий</option>
                <option value="Средний">Средний</option>
                <option value="Низкий">Низкий</option>
              </select>
            </div>
          </div>

          {(filterAssignee !== "all" || filterPriority !== "all" || mobileColumn !== "all") && (
            <button
              onClick={() => { setFilterAssignee("all"); setFilterPriority("all"); setMobileColumn("all"); }}
              style={{ width: "100%", minHeight: 36, borderRadius: 10, border: "1px solid #dbeafe", background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 750, marginBottom: 12 }}
            >
              Сбросить фильтры
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mobileFiltered.length ? mobileFiltered.map(task => (
              <KanbanCard
                key={task.id}
                task={task}
                onChangeAssignee={changeAssignee}
                team={team}
                currentUser={currentUser}
                onEdit={task => setEditTask(task)}
                onMove={moveTask}
                onArchive={archiveTask}
                onDelete={deleteTask}
              />
            )) : (
              <div style={{ padding: "24px 14px", borderRadius: 14, border: "1px dashed #bfdbfe", color: "#94a3b8", textAlign: "center", fontSize: 14, fontWeight: 700 }}>
                По выбранным фильтрам задач нет
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {confirmDialog}
      {showModal && <AddTaskModal onClose={() => setShowModal(false)} onAdd={addTask} team={team} />}
      {editTask && <TaskDetailModal task={editTask} onClose={() => setEditTask(null)} onSave={saveTask} team={team} currentUser={currentUser} />}

      {/* Stats */}
      {scopeControls}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(5, minmax(0, 1fr))" : "repeat(5, minmax(140px, 1fr))", gap: isMobile ? 6 : 14, flexShrink: 0 }}>
        <StatCard compact={isMobile} label="Всего задач" value={activeScopeTasks.length} sub="на доске" color="#1e3a6e"/>
        <StatCard compact={isMobile} label="Беклог" value={scopeTasks.filter(t=>t.column==="Беклог").length} sub="ожидают" color="#64748b"/>
        <StatCard compact={isMobile} label="В работе" value={scopeTasks.filter(t=>t.column==="В работе").length} sub="активных" color="#2563eb"/>
        <StatCard compact={isMobile} label="Готово" value={scopeTasks.filter(t=>isDoneColumn(t.column)).length} sub="7 дней" color="#10b981"/>
        <StatCard compact={isMobile} label="Без исполнителя" value={scopeTasks.filter(t=>!t.assigneeId && !isArchiveColumn(t.column)).length} sub="назначить" color="#f59e0b"/>
      </div>

      {/* Board container */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px 20px", boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* Toolbar: title + filters + add button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1e3a6e", marginRight: 4 }}>Доска задач</div>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: "#e2edf8", flexShrink: 0 }}></div>

          {/* Filter: Assignee */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: .4, textTransform: "uppercase" }}>Исполнитель:</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={filterBtnStyle(filterAssignee==="all")} onClick={() => setFilterAssignee("all")}>Все</button>
              {team.map(m => (
                <button key={m.id} style={filterBtnStyle(filterAssignee===String(m.id))} onClick={() => setFilterAssignee(a => a===String(m.id) ? "all" : String(m.id))}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: m.color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 7, fontWeight: 700 }}>{m.initials[0]}</span>
                    {m.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: "#e2edf8", flexShrink: 0 }}></div>

          {/* Filter: Priority */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: .4, textTransform: "uppercase" }}>Приоритет:</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["all","Высокий","Средний","Низкий"].map(p => (
                <button key={p} style={filterBtnStyle(filterPriority===p)} onClick={() => setFilterPriority(p)}>
                  {p === "all" ? "Все" : p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <button onClick={() => setShowModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)", transition: "opacity .15s" }}
              onMouseEnter={e => e.currentTarget.style.opacity = ".88"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
              Добавить задачу
            </button>
          </div>
        </div>

        {/* Filtered count hint */}
        {(filterAssignee !== "all" || filterPriority !== "all") && (
          <div style={{ fontSize: 12, color: "#2563eb", marginBottom: 10, flexShrink: 0 }}>
            Показано {filtered.length} из {activeScopeTasks.length} задач
            <button onClick={() => { setFilterAssignee("all"); setFilterPriority("all"); }} style={{ marginLeft: 8, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter", textDecoration: "underline" }}>Сбросить</button>
          </div>
        )}

        {/* Columns */}
        <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14, flex: 1, minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}>
          {COLUMNS.map(col => {
            const colTasks = filtered.filter(t => normalizeTaskColumn(t.column) === col);
            const isOver = dragOverCol === col;
            return (
              <div key={col}
                onDragOver={e => handleDragOver(e, col)}
                onDrop={e => handleDrop(e, col)}
                onDragLeave={handleDragLeave}
                style={{ background: isOver ? colDropBg[col] : colBg[col], borderRadius: 12, border: "1.5px solid " + (isOver ? colColor[col] : colBorder[col]), display: "flex", flexDirection: "column", overflow: "hidden", transition: "background .15s, border-color .15s", minHeight: isMobile ? "auto" : 0 }}>

                {/* Column header */}
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid " + colBorder[col], flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: colColor[col] }}></div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colColor[col] }}>{col}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#fff", background: colColor[col], borderRadius: 20, padding: "1px 8px", minWidth: 22, textAlign: "center" }}>{colTasks.length}</span>
                </div>

                {/* Drop hint */}
                {isOver && draggingId && (
                  <div style={{ margin: "8px 12px 0", padding: "10px", borderRadius: 10, border: "2px dashed " + colColor[col], background: "transparent", color: colColor[col], fontSize: 12, textAlign: "center", fontWeight: 500 }}>
                    Отпустите здесь
                  </div>
                )}

                {/* Cards */}
                <div style={{ flex: 1, overflow: isMobile ? "visible" : "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {colTasks.length === 0 && !isOver && (
                    <div style={{ textAlign: "center", color: "#b0c4de", fontSize: 12, marginTop: 20, padding: "0 8px" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 6px", display: "block", opacity: .4 }}>
                        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {filterAssignee !== "all" || filterPriority !== "all" ? "Нет совпадений" : "Нет задач"}
                    </div>
                  )}
                  {colTasks.map(t => (
                    <KanbanCard key={t.id} task={t} onChangeAssignee={changeAssignee}
                      team={team}
                      currentUser={currentUser}
                      onDragStart={id => setDraggingId(id)}
                      onDragEnd={() => setDraggingId(null)}
                      onEdit={task => setEditTask(task)}
                      onMove={moveTask}
                      onArchive={archiveTask}
                      onDelete={deleteTask} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TasksSection;
