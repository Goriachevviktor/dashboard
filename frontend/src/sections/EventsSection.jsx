import { useState, useEffect, useRef, useMemo } from 'react';
import StatCard from '../components/common/StatCard.jsx';
import Avatar from '../components/common/Avatar.jsx';
import { ConfirmDialog, useConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useViewportFlags, formatDashboardDate, getRoadmapToday, formatShortDate, isStandalonePwa, ROADMAP_YEAR } from '../utils.js';

function EventsSection({ initialEvents = null, initialEventTasks = null, team = [], api, onError, currentUser = null }) {
  const { isCompact, isMobile } = useViewportFlags();
  const [confirmDelete, confirmDialog] = useConfirmDialog();
  const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  const today = useMemo(() => getRoadmapToday(), []);
  const hideClosedEventsInPwa = useMemo(() => isStandalonePwa(), []);
  const TODAY_MONTH = today.month;
  const TODAY_DAY = today.day;

  const TYPE_OPTIONS = ["Совещание","Мероприятие","Релиз","Дедлайн","Планирование","УПЦ","План развития"];
  const TYPE_COLOR = { "Совещание":"#2563eb","Мероприятие":"#8b5cf6","Релиз":"#10b981","Дедлайн":"#ef4444","Планирование":"#f59e0b","УПЦ":"#0f766e","План развития":"#7c3aed" };

  const [events, setEvents] = useState(() => Array.isArray(initialEvents) ? initialEvents : []);
  const [eventTasks, setEventTasks] = useState(() => initialEventTasks || {});
  const [selectedId,  setSelectedId]  = useState(() => initialEvents?.[0]?.id || null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAddTask,  setShowAddTask]  = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [roadmapTypeFilter, setRoadmapTypeFilter] = useState("all");
  const [pwaEventStatusFilter, setPwaEventStatusFilter] = useState("all");
  const [showClosedPastMonths, setShowClosedPastMonths] = useState(false);

  useEffect(() => {
    if (!Array.isArray(initialEvents)) return;
    setEvents(initialEvents);
    setSelectedId(current => initialEvents.some(item => item.id === current) ? current : (initialEvents[0]?.id || null));
  }, [initialEvents]);

  useEffect(() => {
    if (initialEventTasks) setEventTasks(initialEventTasks);
  }, [initialEventTasks]);

  const daysToYearEnd = useMemo(() => {
    const now = new Date();
    const referenceDate = now.getFullYear() === ROADMAP_YEAR
      ? now
      : new Date(ROADMAP_YEAR, TODAY_MONTH, TODAY_DAY);
    const endOfYear = new Date(ROADMAP_YEAR, 11, 31);
    return Math.max(0, Math.ceil((endOfYear - referenceDate) / (1000 * 60 * 60 * 24)));
  }, [TODAY_DAY, TODAY_MONTH]);

  const displayEvents = useMemo(
    () => hideClosedEventsInPwa ? events.filter(event => !isRoadmapEventClosed(event)) : events,
    [events, eventTasks, hideClosedEventsInPwa]
  );

  const statusFilteredEvents = useMemo(
    () => !hideClosedEventsInPwa || pwaEventStatusFilter === "all"
      ? displayEvents
      : displayEvents.filter(event => roadmapEventTimeStatus(event) === pwaEventStatusFilter),
    [displayEvents, hideClosedEventsInPwa, pwaEventStatusFilter]
  );

  const roadmapEvents = useMemo(
    () => roadmapTypeFilter === "all" ? statusFilteredEvents : statusFilteredEvents.filter(event => event.type === roadmapTypeFilter),
    [statusFilteredEvents, roadmapTypeFilter]
  );

  function isRoadmapEventClosed(event) {
    if (!event) return true;
    if (event.generated) return Boolean(event.done);
    const relatedTasks = eventTasks[String(event.id)] || eventTasks[event.id] || [];
    return Boolean(event.done) && relatedTasks.every(task => task.done);
  }

  function roadmapEventTimeStatus(event) {
    if (isRoadmapEventClosed(event)) return "done";
    if (event.month < TODAY_MONTH || (event.month === TODAY_MONTH && event.day < TODAY_DAY)) return "overdue";
    if (event.month === TODAY_MONTH && event.day === TODAY_DAY) return "today";
    return "upcoming";
  }

  const pwaStatusOptions = useMemo(() => [
    { id: "all", label: "Все", count: displayEvents.length },
    { id: "done", label: "Завершено", count: 0 },
    { id: "overdue", label: "Просрочено", count: displayEvents.filter(event => roadmapEventTimeStatus(event) === "overdue").length },
    { id: "today", label: "Сегодня", count: displayEvents.filter(event => roadmapEventTimeStatus(event) === "today").length },
    { id: "upcoming", label: "Предстоит", count: displayEvents.filter(event => roadmapEventTimeStatus(event) === "upcoming").length },
  ], [displayEvents, eventTasks, TODAY_DAY, TODAY_MONTH]);

  const hiddenPastMonths = useMemo(() => {
    if (showClosedPastMonths) return new Set();
    const hidden = new Set();
    for (let month = 0; month < TODAY_MONTH; month += 1) {
      const monthEvents = roadmapEvents.filter(event => event.month === month);
      if (!monthEvents.length || monthEvents.every(isRoadmapEventClosed)) hidden.add(month);
    }
    return hidden;
  }, [roadmapEvents, eventTasks, showClosedPastMonths, TODAY_MONTH]);

  const visibleRoadmapEvents = useMemo(
    () => roadmapEvents.filter(event => !hiddenPastMonths.has(event.month)),
    [roadmapEvents, hiddenPastMonths]
  );

  const timelineStartMonth = useMemo(() => {
    if (showClosedPastMonths) return 0;
    for (let month = 0; month < 12; month += 1) {
      if (!hiddenPastMonths.has(month)) return month;
    }
    return TODAY_MONTH;
  }, [hiddenPastMonths, showClosedPastMonths, TODAY_MONTH]);
  const timelineMonthSpan = Math.max(1, 12 - timelineStartMonth);
  const clampTimelinePct = value => Math.max(0, Math.min(1, value));
  const todayPct = clampTimelinePct((TODAY_MONTH - timelineStartMonth + (TODAY_DAY - 1) / 31) / timelineMonthSpan);

  const selectedEvent = visibleRoadmapEvents.find(e => e.id === selectedId) || null;
  const selectedEventGenerated = Boolean(selectedEvent?.generated);
  const tasks = (!selectedEventGenerated && selectedId && eventTasks[selectedId]) || [];

  useEffect(() => {
    if (!visibleRoadmapEvents.length) return;
    if (!visibleRoadmapEvents.some(event => event.id === selectedId)) setSelectedId(visibleRoadmapEvents[0].id);
  }, [visibleRoadmapEvents, selectedId]);

  async function addEvent(data) {
    try {
      const created = await api.createEvent(data);
      setEvents(es => [...es, created]);
      setSelectedId(created.id);
    } catch (error) {
      onError(error);
    }
  }

  async function saveEvent(eventId, data) {
    try {
      const updated = await api.patchEvent(eventId, data);
      setEvents(es => es.map(item => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
    } catch (error) {
      onError(error);
    }
  }

  async function toggleCreatedEventDone(event) {
    if (!event || event.generated) return;
    await saveEvent(event.id, { done: !event.done });
  }

  async function deleteEvent(eventId) {
    const event = events.find(item => item.id === eventId);
    const relatedCount = (eventTasks[eventId] || []).length;
    const confirmed = await confirmDelete({
      title: "Удалить событие?",
      message: relatedCount
        ? `Вместе с событием будут удалены связанные задачи: ${relatedCount}. Восстановить их не получится.`
        : "Событие будет удалено без возможности восстановления.",
      itemTitle: event?.title,
      confirmText: "Удалить событие",
    });
    if (!confirmed) return;
    try {
      await api.deleteEvent(eventId);
      setEvents(es => {
        const next = es.filter(item => item.id !== eventId);
        if (selectedId === eventId) setSelectedId(next[0]?.id || null);
        return next;
      });
      setEventTasks(et => {
        const next = { ...et };
        delete next[eventId];
        return next;
      });
    } catch (error) {
      onError(error);
    }
  }

  async function addTask(eventId, data) {
    try {
      const created = await api.createEventTask(eventId, data);
      setEventTasks(et => ({
        ...et,
        [eventId]: [...(et[eventId] || []), created]
      }));
    } catch (error) {
      onError(error);
    }
  }

  async function saveEventTask(eventId, taskId, data) {
    try {
      const updated = await api.patchEventTask(eventId, taskId, data);
      setEventTasks(et => ({
        ...et,
        [eventId]: (et[eventId] || []).map(t => t.id === taskId ? updated : t)
      }));
      setSelectedTask(null);
    } catch (error) {
      onError(error);
    }
  }

  async function deleteEventTask(eventId, taskId) {
    const task = (eventTasks[eventId] || []).find(item => item.id === taskId);
    const confirmed = await confirmDelete({
      title: "Удалить задачу события?",
      message: "Задача исчезнет из списка подготовки к событию. Это действие нельзя отменить.",
      itemTitle: task?.title,
      confirmText: "Удалить",
    });
    if (!confirmed) return;
    try {
      await api.deleteEventTask(eventId, taskId);
      setEventTasks(et => ({
        ...et,
        [eventId]: (et[eventId] || []).filter(t => t.id !== taskId)
      }));
      if (selectedTask?.task?.id === taskId) setSelectedTask(null);
    } catch (error) {
      onError(error);
    }
  }

  async function toggleTask(eventId, taskId) {
    const current = (eventTasks[eventId] || []).find(t => t.id === taskId);
    if (!current) return;
    try {
      const updated = await api.patchEventTask(eventId, taskId, { done: !current.done });
      setEventTasks(et => ({
        ...et,
        [eventId]: et[eventId].map(t => t.id === taskId ? updated : t)
      }));
    } catch (error) {
      onError(error);
    }
  }

  async function toggleGeneratedEventDone(event) {
    if (!event?.generated || !event.source || !event.sourceKind) return;
    try {
      const updated = await api.patchGeneratedRoadmapEvent({
        source: event.source,
        sourceKind: event.sourceKind,
        sourceTaskId: event.sourceTaskId,
        sourceCheckpointId: event.sourceCheckpointId,
        done: !event.done,
      });
      setEvents(items => items.map(item => item.id === event.id ? { ...item, done: updated.done } : item));
    } catch (error) {
      onError(error);
    }
  }

  function getMonthPct(month) {
    return clampTimelinePct((month - timelineStartMonth) / timelineMonthSpan);
  }

  function getEventPct(ev) {
    return clampTimelinePct((ev.month - timelineStartMonth + (ev.day - 1) / 31) / timelineMonthSpan);
  }

  function compactRoadmapTitle(event) {
    const raw = String(event?.title || "").trim();
    if (!raw) return "Без названия";
    const sourcePrefix = event?.type === "УПЦ" ? "УПЦ · " : event?.type === "План развития" ? "План · " : "";
    const parts = raw.split(":").map(part => part.trim()).filter(Boolean);
    const base = parts.length > 1 && ["УПЦ", "План развития"].includes(event?.type) ? parts[parts.length - 1] : raw;
    const cleaned = base
      .replace(/^провести\s+/i, "")
      .replace(/^реализация\s+(задач\s+)?/i, "")
      .replace(/^создание\s+/i, "")
      .trim();
    const limit = sourcePrefix ? 44 : 52;
    const short = cleaned.length > limit ? cleaned.slice(0, limit - 1).trimEnd() + "…" : cleaned;
    return sourcePrefix + short;
  }

  const roadmapLabelStyle = (event, selected) => ({
    width: 190,
    minHeight: 24,
    maxHeight: 42,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    fontSize: 10,
    lineHeight: 1.25,
    fontWeight: 700,
    color: event.done ? "#94a3b8" : TYPE_COLOR[event.type],
    background: selected ? TYPE_COLOR[event.type] + "22" : "#fff",
    padding: "4px 8px",
    borderRadius: 8,
    textAlign: "center",
    border: selected ? "1.5px solid " + TYPE_COLOR[event.type] : "1.5px solid #e8f1fd",
    transition: "all .15s",
    boxShadow: selected ? "0 2px 8px rgba(37,99,235,.12)" : "none",
  });

  // Anti-collision: assign each event a side (top/bottom) and a level within that side
  // so labels never overlap horizontally
  const LABEL_W_PCT = 0.115; // compact two-line labels reduce horizontal collisions

  function assignLevels(evList) {
    // Sort by x position
    const sorted = [...evList].sort((a, b) => getEventPct(a) - getEventPct(b));
    // Separate into top/bottom alternating first pass
    const top = [], bottom = [];
    sorted.forEach((ev, i) => (i % 2 === 0 ? top : bottom).push(ev));

    function computeLevels(group) {
      // Pre-seed level 0 with the "Сегодня" label so events near it get bumped
      const TODAY_LABEL_W = 0.08; // "Сегодня" badge is ~70px wide
      const levels = [[{ pct: todayPct }]]; // level 0 reserved around today
      return group.map(ev => {
        const pct = getEventPct(ev);
        let l = 0;
        while (true) {
          if (!levels[l]) levels[l] = [];
          const collision = levels[l].some(p => Math.abs(p.pct - pct) < LABEL_W_PCT);
          if (!collision) { levels[l].push({ pct }); return { ...ev, level: l }; }
          l++;
        }
      });
    }

    return {
      topEvents:    computeLevels(top),
      bottomEvents: computeLevels(bottom),
    };
  }

  const { topEvents, bottomEvents } = useMemo(() => assignLevels(visibleRoadmapEvents), [visibleRoadmapEvents, todayPct, timelineStartMonth]);

  function EventModal({ event, onClose, onSubmit }) {
    const isEdit = Boolean(event);
    const [title, setTitle] = useState(event?.title || "");
    const [description, setDescription] = useState(event?.description || "");
    const [type,  setType]  = useState(event?.type || "Совещание");
    const initialMonth = event?.month ?? TODAY_MONTH;
    const initialDay = event?.day ?? TODAY_DAY;
    const formatEventDate = (monthIndex, dayValue) => `${ROADMAP_YEAR}-${String(Number(monthIndex) + 1).padStart(2, "0")}-${String(Number(dayValue)).padStart(2, "0")}`;
    const [eventDate, setEventDate] = useState(formatEventDate(initialMonth, initialDay));
    const [done, setDone] = useState(Boolean(event?.done));
    const [memberIds, setMemberIds] = useState(event?.memberIds || []);
    const [ownerId, setOwnerId] = useState(event?.ownerId || currentUser?.id || null);
    const [error, setError] = useState("");

    function toggleMember(memberId) {
      setMemberIds(ids => ids.includes(memberId) ? ids.filter(id => id !== memberId) : [...ids, memberId]);
    }

    useEffect(() => {
      const fn = e => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, []);

    function handleSave() {
      if (!title.trim()) { setError("Введите название"); return; }
      if (!eventDate) { setError("Выберите дату события"); return; }
      const parsedDate = new Date(eventDate + "T00:00:00");
      if (Number.isNaN(parsedDate.getTime())) { setError("Выберите корректную дату события"); return; }
      onSubmit({ title: title.trim(), description: description.trim(), type, month: parsedDate.getMonth(), day: parsedDate.getDate(), done, memberIds, ownerId });
      onClose();
    }

    const lbl = { fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6, display:"block", letterSpacing:.3 };
    const inp = { width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #e2edf8", fontSize:14, color:"#1e3a6e", fontFamily:"Inter", outline:"none", background:"#f8fafc" };

    return (
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position:"fixed", inset:0, background:"rgba(15,30,70,.38)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
        <div style={{ background:"#fff", borderRadius:20, width:"min(92vw, 520px)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(37,99,235,.22)", animation:"modalIn .2s ease" }}>
          <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #e8f1fd", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1e3a6e" }}>{isEdit ? "Редактирование события" : "Новое событие"}</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{isEdit ? "Измените поля события" : "Добавьте событие на дорожную карту"}</div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:"50%", border:"none", background:"#f0f6ff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding:"22px 28px", display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={lbl}>Название события *</label>
              <input autoFocus value={title} onChange={e => { setTitle(e.target.value); setError(""); }}
                placeholder="Например: Запуск нового продукта"
                style={{ ...inp, borderColor: error ? "#ef4444" : "#e2edf8" }}
                onFocus={e => e.target.style.borderColor = "#93c5fd"}
                onBlur={e => e.target.style.borderColor = error ? "#ef4444" : "#e2edf8"} />
              {error && <div style={{ fontSize:12, color:"#ef4444", marginTop:4 }}>{error}</div>}
            </div>
            <div>
              <label style={lbl}>Тип события</label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {TYPE_OPTIONS.map(t => (
                  <button key={t} onClick={() => setType(t)} style={{ padding:"7px 12px", borderRadius:8, border:"1.5px solid "+(type===t?TYPE_COLOR[t]:"#e2edf8"), background:type===t?TYPE_COLOR[t]+"18":"#f8fafc", color:type===t?TYPE_COLOR[t]:"#64748b", fontSize:12, fontWeight:type===t?600:400, cursor:"pointer", fontFamily:"Inter", transition:"all .15s" }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Контекст, цель или важные детали события" style={{ ...inp, resize:"vertical", lineHeight:1.55, minHeight:90, maxHeight:220 }} />
            </div>
            <div>
              <label style={lbl}>Дата события</label>
              <input type="date" value={eventDate} min={`${ROADMAP_YEAR}-01-01`} max={`${ROADMAP_YEAR}-12-31`} onChange={e => setEventDate(e.target.value)} style={{ ...inp, cursor:"pointer" }}
                onFocus={e => e.target.style.borderColor = "#93c5fd"}
                onBlur={e => e.target.style.borderColor = "#e2edf8"} />
            </div>
            {isEdit && currentUser?.role === "admin" && (
              <div>
                <label style={lbl}>Автор события</label>
                <select value={ownerId || ""} onChange={e => setOwnerId(e.target.value ? Number(e.target.value) : null)} style={{ ...inp, cursor:"pointer" }}>
                  <option value="">— Не указан —</option>
                  {team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Участники события</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {team.map(member => {
                  const active = memberIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:999, border:"1.5px solid " + (active ? member.color : "#e2edf8"), background:active ? member.color + "18" : "#f8fafc", color:active ? member.color : "#64748b", cursor:"pointer", fontFamily:"Inter" }}
                    >
                      <span style={{ width:22, height:22, borderRadius:"50%", background:member.color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:9, fontWeight:700 }}>{member.initials}</span>
                      <span style={{ fontSize:12, fontWeight:600 }}>{member.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#64748b", fontWeight:600 }}>
              <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} />
              Событие завершено
            </label>
          </div>
          <div style={{ padding:"16px 28px 24px", display:"flex", gap:10, justifyContent:"flex-end", borderTop:"1px solid #f0f6ff" }}>
            <button onClick={onClose} style={{ padding:"10px 20px", borderRadius:10, border:"1.5px solid #e2edf8", background:"#f8fafc", color:"#64748b", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"Inter" }}>Отмена</button>
            <button onClick={handleSave} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#3b82f6)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter", boxShadow:"0 4px 12px rgba(37,99,235,.3)" }}>{isEdit ? "Сохранить" : "Добавить событие"}</button>
          </div>
        </div>
      </div>
    );
  }

  // Add Task Modal
  function AddTaskModal({ eventId, onClose, onAdd }) {
    const [title,      setTitle]      = useState("");
    const [description, setDescription] = useState("");
    const [assigneeId, setAssigneeId] = useState(null);
    const [due,        setDue]        = useState("");
    const [error,      setError]      = useState("");
    const ev = events.find(e => e.id === eventId);

    useEffect(() => {
      const fn = e => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, []);

    function handleSave() {
      if (!title.trim()) { setError("Введите название задачи"); return; }
      onAdd(eventId, { title: title.trim(), description: description.trim(), assigneeId, due });
      onClose();
    }

    const lbl = { fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6, display:"block", letterSpacing:.3 };
    const inp = { width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #e2edf8", fontSize:14, color:"#1e3a6e", fontFamily:"Inter", outline:"none", background:"#f8fafc" };
    const assignee = team.find(m => m.id === assigneeId) || null;

    return (
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position:"fixed", inset:0, background:"rgba(15,30,70,.38)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
        <div style={{ background:"#fff", borderRadius:20, width:"min(92vw, 460px)", boxShadow:"0 24px 64px rgba(37,99,235,.22)", animation:"modalIn .2s ease" }}>
          <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #e8f1fd", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:12, color:"#94a3b8", marginBottom:2 }}>К событию: <span style={{ color: ev ? TYPE_COLOR[ev.type] : "#1e3a6e", fontWeight:600 }}>{ev?.title}</span></div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1e3a6e" }}>Новая задача</div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:"50%", border:"none", background:"#f0f6ff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding:"22px 28px", display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={lbl}>Название задачи *</label>
              <input autoFocus value={title} onChange={e => { setTitle(e.target.value); setError(""); }}
                placeholder="Что нужно сделать?"
                style={{ ...inp, borderColor: error ? "#ef4444" : "#e2edf8" }}
                onFocus={e => e.target.style.borderColor = "#93c5fd"}
                onBlur={e => e.target.style.borderColor = error ? "#ef4444" : "#e2edf8"} />
              {error && <div style={{ fontSize:12, color:"#ef4444", marginTop:4 }}>{error}</div>}
            </div>
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Исполнитель</label>
                <div style={{ position:"relative" }}>
                  <select value={assigneeId || ""} onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
                    style={{ ...inp, cursor:"pointer", paddingLeft: assignee ? 40 : 14 }}>
                    <option value="">— Не назначен —</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {assignee && (
                    <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", width:22, height:22, borderRadius:"50%", background:assignee.color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:8, fontWeight:700, pointerEvents:"none" }}>{assignee.initials}</div>
                  )}
                </div>
              </div>
              <div style={{ flex:1 }}>
                <label style={lbl}>Срок выполнения</label>
                <input type="date" value={due} onChange={e => setDue(e.target.value)} style={inp}
                  onFocus={e => e.target.style.borderColor = "#93c5fd"}
                  onBlur={e => e.target.style.borderColor = "#e2edf8"} />
              </div>
            </div>
            <div>
              <label style={lbl}>Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Контекст задачи, ожидания или результат" style={{ ...inp, resize:"vertical", lineHeight:1.55, minHeight:90, maxHeight:220 }} />
            </div>
          </div>
          <div style={{ padding:"16px 28px 24px", display:"flex", gap:10, justifyContent:"flex-end", borderTop:"1px solid #f0f6ff" }}>
            <button onClick={onClose} style={{ padding:"10px 20px", borderRadius:10, border:"1.5px solid #e2edf8", background:"#f8fafc", color:"#64748b", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"Inter" }}>Отмена</button>
            <button onClick={handleSave} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#3b82f6)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter", boxShadow:"0 4px 12px rgba(37,99,235,.3)" }}>Добавить задачу</button>
          </div>
        </div>
      </div>
    );
  }

  function EventTaskModal({ eventId, task, onClose, onSave }) {
    const [title, setTitle] = useState(task.title || "");
    const [description, setDescription] = useState(task.description || "");
    const [assigneeId, setAssigneeId] = useState(task.assigneeId || null);
    const [due, setDue] = useState(task.due || "");
    const [done, setDone] = useState(Boolean(task.done));
    const [error, setError] = useState("");
    const assignee = team.find(m => m.id === assigneeId) || null;
    const lbl = { fontSize:12, fontWeight:600, color:"#64748b", marginBottom:6, display:"block", letterSpacing:.3 };
    const inp = { width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #e2edf8", fontSize:14, color:"#1e3a6e", fontFamily:"Inter", outline:"none", background:"#f8fafc" };

    useEffect(() => {
      const fn = e => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, []);

    function handleSave() {
      if (!title.trim()) { setError("Введите название задачи"); return; }
      onSave(eventId, task.id, { title: title.trim(), description: description.trim(), assigneeId, due, done });
    }

    return (
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position:"fixed", inset:0, background:"rgba(15,30,70,.38)", zIndex:320, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
        <div style={{ background:"#fff", borderRadius:20, width:"min(92vw, 560px)", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(37,99,235,.22)" }}>
          <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #e8f1fd", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1e3a6e" }}>Задача события</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>Описание, исполнитель и срок</div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:"50%", border:"none", background:"#f0f6ff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding:"22px 28px", display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={lbl}>Название задачи *</label>
              <input autoFocus value={title} onChange={e => { setTitle(e.target.value); setError(""); }} style={{ ...inp, borderColor:error ? "#ef4444" : "#e2edf8" }} />
              {error && <div style={{ fontSize:12, color:"#ef4444", marginTop:4 }}>{error}</div>}
            </div>
            <div>
              <label style={lbl}>Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="Добавьте описание задачи..." style={{ ...inp, resize:"vertical", lineHeight:1.55, minHeight:120, maxHeight:320 }} />
            </div>
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Исполнитель</label>
                <div style={{ position:"relative" }}>
                  <select value={assigneeId || ""} onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : null)} style={{ ...inp, cursor:"pointer", paddingLeft: assignee ? 40 : 14 }}>
                    <option value="">— Не назначен —</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {assignee && <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", width:22, height:22, borderRadius:"50%", background:assignee.color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:8, fontWeight:700, pointerEvents:"none" }}>{assignee.initials}</div>}
                </div>
              </div>
              <div style={{ flex:1 }}>
                <label style={lbl}>Срок</label>
                <input type="date" value={due} onChange={e => setDue(e.target.value)} style={inp} />
              </div>
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#64748b", fontWeight:600 }}>
              <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} />
              Задача выполнена
            </label>
          </div>
          <div style={{ padding:"16px 28px 24px", display:"flex", gap:10, justifyContent:"flex-end", borderTop:"1px solid #f0f6ff" }}>
            <button onClick={onClose} style={{ padding:"10px 20px", borderRadius:10, border:"1.5px solid #e2edf8", background:"#f8fafc", color:"#64748b", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"Inter" }}>Отмена</button>
            <button onClick={handleSave} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#3b82f6)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter", boxShadow:"0 4px 12px rgba(37,99,235,.3)" }}>Сохранить</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {confirmDialog}
      {showAddEvent && <EventModal onClose={() => setShowAddEvent(false)} onSubmit={addEvent} />}
      {editEvent && <EventModal event={editEvent} onClose={() => setEditEvent(null)} onSubmit={(patch) => { saveEvent(editEvent.id, patch); setEditEvent(null); }} />}
      {showAddTask && selectedEvent && <AddTaskModal eventId={selectedId} onClose={() => setShowAddTask(false)} onAdd={addTask} />}
      {selectedTask && <EventTaskModal eventId={selectedTask.eventId} task={selectedTask.task} onClose={() => setSelectedTask(null)} onSave={saveEventTask} />}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "repeat(4, minmax(0, 1fr))" : "repeat(4, minmax(180px, 1fr))", gap:isMobile ? 6 : 14 }}>
        <StatCard compact={isMobile} label="Событий в году" value={displayEvents.length} sub={hideClosedEventsInPwa ? "активных" : "запланировано"} color="#1e3a6e" onClick={hideClosedEventsInPwa ? () => setPwaEventStatusFilter("all") : null} active={hideClosedEventsInPwa && pwaEventStatusFilter === "all"}/>
        <StatCard compact={isMobile} label="Завершено" value={hideClosedEventsInPwa ? 0 : events.filter(e=>e.done).length} sub={hideClosedEventsInPwa ? "скрыто в PWA" : "пройдено"} color="#10b981" onClick={hideClosedEventsInPwa ? () => setPwaEventStatusFilter("done") : null} active={hideClosedEventsInPwa && pwaEventStatusFilter === "done"}/>
        <StatCard compact={isMobile} label="Предстоит" value={pwaStatusOptions.find(option => option.id === "upcoming")?.count ?? displayEvents.filter(e=>!e.done).length} sub="впереди" color="#2563eb" onClick={hideClosedEventsInPwa ? () => setPwaEventStatusFilter("upcoming") : null} active={hideClosedEventsInPwa && pwaEventStatusFilter === "upcoming"}/>
        <StatCard compact={isMobile} label={hideClosedEventsInPwa ? "Просрочено" : "До конца года"} value={hideClosedEventsInPwa ? (pwaStatusOptions.find(option => option.id === "overdue")?.count ?? 0) : daysToYearEnd} sub={hideClosedEventsInPwa ? "требуют внимания" : "дней"} color="#f59e0b" onClick={hideClosedEventsInPwa ? () => setPwaEventStatusFilter("overdue") : null} active={hideClosedEventsInPwa && pwaEventStatusFilter === "overdue"}/>
      </div>

      {/* Roadmap */}
      <div style={{ background:"#fff", borderRadius:isMobile ? 18 : 16, padding:isMobile ? 14 : "24px 28px", boxShadow:"0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)" }}>
        <div style={{ display:"flex", alignItems:isCompact ? "flex-start" : "center", justifyContent:"space-between", marginBottom:20, gap:14, flexWrap:"wrap" }}>
          <div style={{ fontSize:isMobile ? 18 : 14, fontWeight:isMobile ? 850 : 600, color:"#1e3a6e" }}>Дорожная карта 2026</div>
          <div style={{ display:"flex", alignItems:isCompact ? "flex-start" : "center", gap:14, flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {Object.entries(TYPE_COLOR).map(([t,c]) => {
                const active = roadmapTypeFilter === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRoadmapTypeFilter(current => current === t ? "all" : t)}
                    title={active ? "Показать все типы" : `Показать только: ${t}`}
                    style={{ display:"flex", alignItems:"center", gap:5, minHeight:26, padding:"4px 8px", borderRadius:999, border:"1.5px solid " + (active ? c : "#e2edf8"), background: active ? c + "14" : "#fff", color: active ? c : "#94a3b8", fontSize:11, fontWeight: active ? 800 : 650, fontFamily:"Inter", cursor:"pointer" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }}></span>
                    {t}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowClosedPastMonths(value => !value)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 10px", borderRadius:10, border:"1.5px solid " + (showClosedPastMonths ? "#93c5fd" : "#e2edf8"), background:showClosedPastMonths ? "#eff6ff" : "#fff", color:showClosedPastMonths ? "#2563eb" : "#64748b", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Inter", whiteSpace:"nowrap" }}>
              {showClosedPastMonths ? "Скрыть прошлое" : "Показать прошлое"}
            </button>
            <button onClick={() => setShowAddEvent(true)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#3b82f6)", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter", boxShadow:"0 2px 8px rgba(37,99,235,.25)", whiteSpace:"nowrap" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
              Добавить событие
            </button>
          </div>
        </div>

        {/* Timeline */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleRoadmapEvents
              .slice()
              .sort((a, b) => a.month === b.month ? a.day - b.day : a.month - b.month)
              .map(ev => {
                const isSel = selectedId === ev.id;
                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedId(ev.id)}
                    style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", minHeight: 58, width: "100%", padding: "10px 12px", borderRadius: 14, border: "1.5px solid " + (isSel ? TYPE_COLOR[ev.type] : "#e2edf8"), background: isSel ? TYPE_COLOR[ev.type] + "12" : "#f8fbff", textAlign: "left", fontFamily: "Inter", color: "#1e3a6e", cursor: "pointer" }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: TYPE_COLOR[ev.type] + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: ev.done ? "#94a3b8" : TYPE_COLOR[ev.type] }}></div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div title={ev.title} style={{ fontSize: 14, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{compactRoadmapTitle(ev)}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{MONTHS[ev.month]} · {ev.day}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: TYPE_COLOR[ev.type], background: TYPE_COLOR[ev.type] + "18", padding: "2px 7px", borderRadius: 999 }}>{ev.type}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: ev.done ? "#10b981" : "#2563eb" }}>{ev.done ? "✓" : "→"}</div>
                  </button>
                );
              })}
          </div>
        ) : (
        <div style={{ overflowX:"auto", paddingBottom:4 }}>
          <div style={{ position:"relative", paddingTop:60, paddingBottom:60, minWidth:isCompact ? 860 : "auto" }}>
          {/* Top labels — multi-level anti-collision */}
          <div style={{ position:"relative", height: Math.max(1, topEvents.length ? Math.max(...topEvents.map(e=>e.level))+1 : 1) * 48 + 16 }}>
            {topEvents.map(ev => {
              const pct = getEventPct(ev);
              const isSel = selectedId === ev.id;
              // level 0 = closest to track (bottom of zone), higher levels = further up
              const maxLevel = topEvents.length ? Math.max(...topEvents.map(e=>e.level)) : 0;
              const bottomOffset = ev.level * 48;
              return (
                <div key={ev.id} onClick={() => setSelectedId(ev.id)}
                  style={{ position:"absolute", left:`${pct*100}%`, bottom: bottomOffset, transform:"translateX(-50%)", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <div style={roadmapLabelStyle(ev, isSel)} title={ev.title}>
                    {compactRoadmapTitle(ev)}
                  </div>
                  <div style={{ width:1, height: bottomOffset === 0 ? 10 : bottomOffset + 10, background:ev.done?"#d1d5db":TYPE_COLOR[ev.type], opacity:.4, position:"absolute", bottom: -( bottomOffset === 0 ? 10 : bottomOffset + 10), left:"50%" }}></div>
                </div>
              );
            })}
          </div>

          {/* Track */}
          <div style={{ position:"relative", height:32 }}>
            <div style={{ position:"absolute", top:"50%", left:0, right:0, height:4, background:"#e8f1fd", borderRadius:4, transform:"translateY(-50%)" }}></div>
            <div style={{ position:"absolute", top:"50%", left:0, width:`${todayPct*100}%`, height:4, background:"linear-gradient(90deg,#2563eb,#60a5fa)", borderRadius:4, transform:"translateY(-50%)" }}></div>
            {MONTHS.map((_, i) => hiddenPastMonths.has(i) ? null : (
              <div key={i} style={{ position:"absolute", left:`${getMonthPct(i)*100}%`, top:"50%", transform:"translateX(-50%) translateY(-50%)" }}>
                <div style={{ width:2, height:10, background:"#d1d5db", borderRadius:1 }}></div>
              </div>
            ))}
            {/* Today */}
            <div style={{ position:"absolute", left:`${todayPct*100}%`, top:"50%", transform:"translateX(-50%) translateY(-50%)", zIndex:10 }}>
              <div style={{ width:14, height:14, borderRadius:"50%", background:"#fff", border:"3px solid #2563eb", boxShadow:"0 0 0 4px rgba(37,99,235,.15)" }}></div>
              <div style={{ position:"absolute", top:-24, left:"50%", transform:"translateX(-50%)", fontSize:10, fontWeight:700, color:"#2563eb", whiteSpace:"nowrap", background:"#eff6ff", padding:"1px 6px", borderRadius:6 }}>Сегодня</div>
            </div>
            {/* Event dots */}
            {[...topEvents, ...bottomEvents].map(ev => {
              const pct = getEventPct(ev);
              const isSel = selectedId === ev.id;
              return (
                <div key={ev.id} onClick={() => setSelectedId(ev.id)}
                  style={{ position:"absolute", left:`${pct*100}%`, top:"50%", transform:"translateX(-50%) translateY(-50%)", zIndex:5, cursor:"pointer" }}>
                  <div style={{ width:isSel?16:12, height:isSel?16:12, borderRadius:"50%", background:ev.done?"#d1d5db":TYPE_COLOR[ev.type], border:isSel?`3px solid ${TYPE_COLOR[ev.type]}`:"2px solid #fff", boxShadow:isSel?`0 0 0 3px ${TYPE_COLOR[ev.type]}33`:"0 1px 4px rgba(0,0,0,.1)", transition:"all .2s" }}></div>
                </div>
              );
            })}
          </div>

          {/* Month labels */}
          <div style={{ position:"relative", height:22, marginTop:8 }}>
            {MONTHS.map((m, i) => hiddenPastMonths.has(i) ? null : (
              <div key={m} style={{
                position:"absolute",
                left:`${getMonthPct(i)*100}%`,
                transform:i===timelineStartMonth?"translateX(0)":"translateX(-50%)",
                textAlign:i===timelineStartMonth?"left":"center",
                fontSize:11,
                color:i===TODAY_MONTH?"#2563eb":"#94a3b8",
                fontWeight:i===TODAY_MONTH?700:400,
                whiteSpace:"nowrap"
              }}>{m}</div>
            ))}
          </div>

          {/* Bottom labels — multi-level anti-collision */}
          <div style={{ position:"relative", height: Math.max(1, bottomEvents.length ? Math.max(...bottomEvents.map(e=>e.level))+1 : 1) * 48 + 16, marginTop:4 }}>
            {bottomEvents.map(ev => {
              const pct = getEventPct(ev);
              const isSel = selectedId === ev.id;
              const topOffset = ev.level * 48;
              return (
                <div key={ev.id} onClick={() => setSelectedId(ev.id)}
                  style={{ position:"absolute", left:`${pct*100}%`, top: topOffset, transform:"translateX(-50%)", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <div style={{ width:1, height: topOffset === 0 ? 10 : topOffset + 10, background:ev.done?"#d1d5db":TYPE_COLOR[ev.type], opacity:.4, position:"absolute", top:-(topOffset===0?10:topOffset+10), left:"50%" }}></div>
                  <div style={roadmapLabelStyle(ev, isSel)} title={ev.title}>
                    {compactRoadmapTitle(ev)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
        )}
      </div>

      {/* Event detail + tasks */}
      {selectedEvent && (
        <div style={{ background:"#fff", borderRadius:isMobile ? 18 : 16, padding:isMobile ? 14 : 24, boxShadow:"0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)" }}>
          <div style={{ display:"flex", alignItems:isMobile ? "flex-start" : "center", gap:14, marginBottom:20, paddingBottom:16, borderBottom:"1px solid #e8f1fd", flexWrap:"wrap" }}>
            <button
              onClick={() => selectedEventGenerated ? toggleGeneratedEventDone(selectedEvent) : toggleCreatedEventDone(selectedEvent)}
              title={selectedEvent.done ? "Вернуть в работу" : "Отметить выполненным"}
              style={{ width:44, height:44, borderRadius:12, border:"1.5px solid " + (selectedEvent.done ? "#10b981" : TYPE_COLOR[selectedEvent.type] + "55"), background:selectedEvent.done ? "#10b981" : TYPE_COLOR[selectedEvent.type]+"18", color:selectedEvent.done ? "#fff" : TYPE_COLOR[selectedEvent.type], display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}
            >
              {selectedEvent.done ? <svg width="18" height="18" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> : <div style={{ width:16, height:16, borderRadius:5, border:"2px solid currentColor" }}></div>}
            </button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#1e3a6e" }}>{selectedEvent.title}</div>
              <div style={{ display:"flex", gap:10, marginTop:4, alignItems:"center", flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"#64748b" }}>{MONTHS[selectedEvent.month]} 2026 · {selectedEvent.day} число</span>
                <span style={{ fontSize:11, fontWeight:600, color:TYPE_COLOR[selectedEvent.type], background:TYPE_COLOR[selectedEvent.type]+"18", padding:"2px 8px", borderRadius:20 }}>{selectedEvent.type}</span>
                {selectedEventGenerated && <span style={{ fontSize:11, fontWeight:600, color:"#64748b", background:"#f1f5f9", padding:"2px 8px", borderRadius:20 }}>Автоматически</span>}
                {selectedEvent.done && <span style={{ fontSize:11, fontWeight:600, color:"#10b981", background:"#10b98118", padding:"2px 8px", borderRadius:20 }}>Завершено</span>}
              </div>
              {selectedEvent.description && <div style={{ fontSize:13, color:"#64748b", marginTop:8, lineHeight:1.55 }}>{selectedEvent.description}</div>}
              {!selectedEventGenerated && (selectedEvent.memberIds || []).length > 0 && (
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginTop:10 }}>
                  {(selectedEvent.memberIds || []).map(memberId => {
                    const member = team.find(item => item.id === memberId);
                    if (!member) return null;
                    return (
                      <span key={member.id} title={member.name} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px 4px 4px", borderRadius:999, background:member.color + "14", color:member.color, fontSize:11, fontWeight:700 }}>
                        <span style={{ width:20, height:20, borderRadius:"50%", background:member.color, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800 }}>{member.initials}</span>
                        {member.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              {!selectedEventGenerated && <span style={{ fontSize:13, color:"#94a3b8" }}>{tasks.filter(t=>t.done).length}/{tasks.length} задач</span>}
              {!selectedEventGenerated && <button onClick={() => setEditEvent(selectedEvent)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px", borderRadius:10, border:"1px solid #dbeafe", background:"#fff", color:"#2563eb", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter", whiteSpace:"nowrap" }}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M8.5 3.5l2 2L5.2 10.8H3.2V8.8L8.5 3.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Редактировать
              </button>}
              {!selectedEventGenerated && <button onClick={() => deleteEvent(selectedEvent.id)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px", borderRadius:10, border:"1px solid #fecaca", background:"#fff", color:"#ef4444", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter", whiteSpace:"nowrap" }}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V3h4v1m-5 2 .4 5h5.2L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Удалить
              </button>}
              {!selectedEventGenerated && <button onClick={() => setShowAddTask(true)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#3b82f6)", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter", boxShadow:"0 2px 8px rgba(37,99,235,.2)", whiteSpace:"nowrap" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
                Добавить задачу
              </button>}
            </div>
          </div>

          {selectedEventGenerated ? null : tasks.length === 0 ? (
            <div style={{ textAlign:"center", padding:"28px 0", color:"#94a3b8", fontSize:14 }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin:"0 auto 10px", display:"block", opacity:.35 }}>
                <rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <path d="M10 14h12M10 19h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              К этому событию задачи ещё не добавлены
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", letterSpacing:.5, textTransform:"uppercase", marginBottom:4 }}>Задачи к событию</div>
              {tasks.map(task => {
                const assignee = team.find(m => m.id === task.assigneeId) || null;
                return (
                  <div key={task.id} onClick={() => setSelectedTask({ eventId: selectedId, task })}
                    style={{ display:"flex", alignItems:isMobile ? "flex-start" : "center", gap:12, padding:isMobile ? "12px" : "12px 16px", background:task.done?"#f0fdf4":"#f8fafc", borderRadius:12, border:"1px solid "+(task.done?"#bbf7d0":"#e2edf8"), cursor:"pointer", transition:"all .15s", flexWrap:isMobile ? "wrap" : "nowrap" }}
                    onMouseEnter={e => e.currentTarget.style.background = task.done?"#e8fdf2":"#eff6ff"}
                    onMouseLeave={e => e.currentTarget.style.background = task.done?"#f0fdf4":"#f8fafc"}>
                    <button onClick={e => { e.stopPropagation(); toggleTask(selectedId, task.id); }} title="Отметить выполнение" style={{ width:20, height:20, borderRadius:6, border:task.done?"none":"2px solid #d1d5db", background:task.done?"#10b981":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer", padding:0 }}>
                      {task.done && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span style={{ flex:1, fontSize:14, color:task.done?"#64748b":"#1e3a6e", fontWeight:500, textDecoration:task.done?"line-through":"none" }}>
                      {task.title}
                      {task.description && <span style={{ display:"block", fontSize:12, color:"#94a3b8", marginTop:3, textDecoration:"none" }}>{task.description}</span>}
                    </span>
                    {task.due && <span style={{ fontSize:11, color:"#94a3b8", whiteSpace:"nowrap", marginLeft:isMobile ? 32 : 0 }}>{formatShortDate(task.due)}</span>}
                    {assignee ? (
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:isMobile ? 32 : 0 }}>
                        <div style={{ width:24, height:24, borderRadius:"50%", background:assignee.color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:9, fontWeight:700 }}>{assignee.initials}</div>
                        <span style={{ fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>{assignee.name}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:11, color:"#94a3b8", whiteSpace:"nowrap" }}>Не назначен</span>
                    )}
                    <button onClick={e => { e.stopPropagation(); setSelectedTask({ eventId: selectedId, task }); }} title="Редактировать" style={{ width:28, height:28, borderRadius:8, border:"1px solid #dbeafe", background:"#fff", color:"#2563eb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 3.5l2 2L5.2 10.8H3.2V8.8L8.5 3.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {(currentUser?.role === "admin" || currentUser?.id === task.ownerId) && (
                      <button onClick={e => { e.stopPropagation(); deleteEventTask(selectedId, task.id); }} title="Удалить" style={{ width:28, height:28, borderRadius:8, border:"1px solid #fecaca", background:"#fff", color:"#ef4444", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V3h4v1m-5 2 .4 5h5.2L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}
                  </div>
                );
              })}
              <div style={{ marginTop:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:"#64748b" }}>Готовность к событию</span>
                  <span style={{ fontSize:12, fontWeight:600, color:"#1e3a6e" }}>{tasks.length>0?Math.round(tasks.filter(t=>t.done).length/tasks.length*100):0}%</span>
                </div>
                <div style={{ height:6, background:"#e8f1fd", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${tasks.length>0?tasks.filter(t=>t.done).length/tasks.length*100:0}%`, background:"linear-gradient(90deg,#10b981,#34d399)", borderRadius:4, transition:"width .5s ease" }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EventsSection;
