import { useState, useEffect, useRef } from 'react';
import StatCard from '../components/common/StatCard.jsx';
import { useConfirmDialog } from '../components/common/useConfirmDialog.jsx';
import { useViewportFlags } from '../utils.js';

function PlanTaskModal({ task, team, isMobile, inputStyle, labelStyle, onClose, onSubmit }) {
  const isEdit = Boolean(task);
  const [memberIds, setMemberIds] = useState(task?.memberIds || []);
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [resultImage, setResultImage] = useState(task?.resultImage || "");
  const [successMetric, setSuccessMetric] = useState(task?.successMetric || "");
  const [due, setDue] = useState(task?.due || "");
  const [done, setDone] = useState(Boolean(task?.done));
  const [checkpoints, setCheckpoints] = useState(
    task?.checkpoints?.length
      ? task.checkpoints.map(item => ({ ...item, done: Boolean(item.done) }))
      : [{ id: 1, label: "", date: "", done: false }]
  );
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function toggleMember(memberId) {
    setMemberIds(ids => ids.includes(memberId) ? ids.filter(id => id !== memberId) : [...ids, memberId]);
  }

  function updateCheckpoint(checkpointId, patch) {
    setCheckpoints(items => items.map(item => item.id === checkpointId ? { ...item, ...patch } : item));
  }

  function addCheckpoint() {
    setCheckpoints(items => [...items, { id: Date.now() + items.length, label: "", date: "", done: false }]);
  }

  function removeCheckpoint(checkpointId) {
    setCheckpoints(items => items.length === 1 ? items : items.filter(item => item.id !== checkpointId));
  }

  function handleSubmit() {
    if (!title.trim()) {
      setError("Введите наименование задачи");
      return;
    }
    const normalizedCheckpoints = checkpoints
      .map(item => ({ ...item, label: (item.label || "").trim(), date: item.date || "", done: Boolean(item.done) }))
      .filter(item => item.label || item.date);
    onSubmit({
      ...(task ? { id: task.id, status: task.status || "" } : { status: "" }),
      title: title.trim(),
      description: description.trim(),
      resultImage: resultImage.trim(),
      successMetric: successMetric.trim(),
      due,
      done,
      memberIds,
      checkpoints: normalizedCheckpoints,
    });
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "min(94vw, 760px)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(37,99,235,.22)" }}>
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>{isEdit ? "Редактирование задачи развития" : "Новая задача развития"}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Наименование, ожидаемый образ результата, метрика и срок</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f0f6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={labelStyle}>Наименование задачи *</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setError(""); }} placeholder="Например: Запустить регулярный управленческий отчёт" style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#e2edf8" }} />
            {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
          </div>
          <div>
            <label style={labelStyle}>Описание задачи</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Контекст, проблема, границы задачи..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div>
            <label style={labelStyle}>Образ результата</label>
            <textarea value={resultImage} onChange={e => setResultImage(e.target.value)} rows={3} placeholder="Как должен выглядеть результат после завершения задачи..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr .8fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Метрика успеха</label>
              <input value={successMetric} onChange={e => setSuccessMetric(e.target.value)} placeholder="Например: 90% задач обновляются еженедельно" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Сроки задачи</label>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1.5px solid " + (done ? "#86efac" : "#e2edf8"), background: done ? "#f0fdf4" : "#f8fafc", color: done ? "#15803d" : "#1e3a6e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#22c55e" }} />
            Задача выполнена
          </label>
          <div>
            <label style={labelStyle}>Команда соисполнителей</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {team.length === 0 ? (
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Пользователи не найдены</span>
              ) : team.map(member => {
                const active = memberIds.includes(member.id);
                return (
                  <button key={member.id} type="button" onClick={() => toggleMember(member.id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 999, border: "1.5px solid " + (active ? "#2563eb" : "#e2edf8"), background: active ? "#eff6ff" : "#f8fafc", color: active ? "#2563eb" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: active ? "#2563eb" : "#e2edf8", color: active ? "#fff" : "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{member.initials}</span>
                    <span>{member.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Подзадачи / чек-поинты</label>
              <button onClick={addCheckpoint} style={{ border: "none", background: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>+ Добавить точку</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {checkpoints.map(point => (
                <div key={point.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 10, alignItems: "start" }}>
                  <label title="Выполнено" style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid " + (point.done ? "#86efac" : "#e2edf8"), background: point.done ? "#f0fdf4" : "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={Boolean(point.done)} onChange={e => updateCheckpoint(point.id, { done: e.target.checked })} style={{ width: 16, height: 16, accentColor: "#22c55e" }} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr .8fr auto", gap: 10, alignItems: "center" }}>
                    <input value={point.label} onChange={e => updateCheckpoint(point.id, { label: e.target.value })} placeholder="Название подзадачи или контрольной точки" style={inputStyle} />
                    <input type="date" value={point.date} onChange={e => updateCheckpoint(point.id, { date: e.target.value })} style={inputStyle} />
                    <button onClick={() => removeCheckpoint(point.id)} style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#94a3b8", cursor: "pointer" }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #f0f6ff" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
          <button onClick={handleSubmit} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 12px rgba(37,99,235,.3)" }}>{isEdit ? "Сохранить изменения" : "Создать задачу"}</button>
        </div>
      </div>
    </div>
  );
}


function PlanSection({ initialTasks = [], team = [], api, onError, currentUser = null }) {
  const { isMobile } = useViewportFlags();
  const [confirmDelete, confirmDialog] = useConfirmDialog();
  const [tasks, setTasks] = useState(initialTasks || []);
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const statusTimers = useRef({});

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2edf8", fontSize: 14, color: "#1e3a6e", fontFamily: "Inter", outline: "none", background: "#f8fafc" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block", letterSpacing: .3 };

  function formatPlanDate(value) {
    if (!value) return "Без срока";
    const date = new Date(value + "T00:00:00");
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function compactStatus(task) {
    const text = (task.status || "").trim();
    if (!text) return "Без статуса";
    return text.length > 28 ? text.slice(0, 28) + "..." : text;
  }

  function taskTone(task) {
    if (task.done) return { label: "Завершено", color: "#10b981", bg: "#10b98118" };
    const text = (task.status || "").toLowerCase();
    if (text.includes("заверш")) return { label: "Завершено", color: "#10b981", bg: "#10b98118" };
    if (task.due && new Date(task.due + "T23:59:59") < new Date()) return { label: "Просрочено", color: "#ef4444", bg: "#ef444418" };
    if (text.includes("блок") || text.includes("риск")) return { label: "Риск", color: "#f59e0b", bg: "#f59e0b18" };
    if (text.includes("работ")) return { label: "В работе", color: "#2563eb", bg: "#2563eb18" };
    return { label: "План", color: "#64748b", bg: "#e2edf8" };
  }

  async function addTask(task) {
    try {
      const created = await api.createDevelopmentTask(task);
      setTasks(items => [...items, created]);
      setSelectedTaskId(created.id);
    } catch (error) {
      onError(error);
    }
  }

  async function saveTask(task) {
    try {
      const saved = await api.patchDevelopmentTask(task.id, task);
      setTasks(items => items.map(item => item.id === saved.id ? saved : item));
    } catch (error) {
      onError(error);
    }
  }

  async function toggleTaskDone(task) {
    await saveTask({ ...task, done: !task.done });
  }

  async function toggleCheckpointDone(task, checkpointId) {
    const checkpoints = (task.checkpoints || []).map(point => point.id === checkpointId ? { ...point, done: !point.done } : point);
    await saveTask({ ...task, checkpoints });
  }

  function updateStatusDraft(taskId, status) {
    setTasks(items => items.map(item => item.id === taskId ? { ...item, status } : item));
    window.clearTimeout(statusTimers.current[taskId]);
    statusTimers.current[taskId] = window.setTimeout(async () => {
      try {
        const saved = await api.patchDevelopmentTask(taskId, { status });
        setTasks(items => items.map(item => item.id === saved.id ? saved : item));
      } catch (error) {
        onError(error);
      }
    }, 700);
  }

  function resizeStatusTextarea(node) {
    if (!node) return;
    node.style.height = "auto";
    node.style.height = Math.max(76, node.scrollHeight) + "px";
  }

  async function deleteTask(taskId) {
    const task = tasks.find(item => item.id === taskId);
    const confirmed = await confirmDelete({
      title: "Удалить задачу развития?",
      message: "Задача исчезнет из плана развития. Это действие нельзя отменить.",
      itemTitle: task?.title,
      confirmText: "Удалить",
    });
    if (!confirmed) return;
    try {
      await api.deleteDevelopmentTask(taskId);
      setTasks(items => items.filter(item => item.id !== taskId));
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      if (editTask?.id === taskId) setEditTask(null);
    } catch (error) {
      onError(error);
    }
  }

  const completed = tasks.filter(task => task.done || (task.status || "").toLowerCase().includes("заверш")).length;
  const totalCheckpoints = tasks.reduce((sum, task) => sum + (task.checkpoints || []).length, 0);
  const completedCheckpoints = tasks.reduce((sum, task) => sum + (task.checkpoints || []).filter(point => point.done).length, 0);
  const nearest = [...tasks].filter(task => task.due).sort((a, b) => a.due.localeCompare(b.due))[0];
  const selectedTask = tasks.find(task => task.id === selectedTaskId) || tasks[0] || null;
  const selectedMembers = selectedTask ? team.filter(member => (selectedTask.memberIds || []).includes(member.id)) : [];
  const canDeleteTask = task => currentUser?.role === "admin" || currentUser?.id === task?.ownerId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {confirmDialog}
      {showCreate && <PlanTaskModal key="new" team={team} isMobile={isMobile} inputStyle={inputStyle} labelStyle={labelStyle} onClose={() => setShowCreate(false)} onSubmit={addTask} />}
      {editTask && <PlanTaskModal key={editTask.id} task={editTask} team={team} isMobile={isMobile} inputStyle={inputStyle} labelStyle={labelStyle} onClose={() => setEditTask(null)} onSubmit={(task) => { saveTask(task); setEditTask(null); }} />}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(180px, 1fr))", gap: isMobile ? 6 : 14 }}>
        <StatCard compact={isMobile} label="Задач" value={tasks.length} sub="в плане" color="#1e3a6e"/>
        <StatCard compact={isMobile} label="Завершено" value={completed} sub="задач" color="#10b981"/>
        <StatCard compact={isMobile} label="Чек-поинтов" value={totalCheckpoints} sub={completedCheckpoints + " выполнено"} color="#8b5cf6"/>
        <StatCard compact={isMobile} label="Ближайший срок" value={nearest ? formatPlanDate(nearest.due) : "—"} sub={nearest?.title || "нет дат"} color="#2563eb"/>
      </div>

      <div style={{ background: "#fff", borderRadius: isMobile ? 18 : 16, padding: isMobile ? 14 : 24, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: isMobile ? 18 : 14, fontWeight: isMobile ? 850 : 600, color: "#1e3a6e" }}>План развития</div>
            {!isMobile && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Фиксируйте задачи развития, ожидаемый результат, метрики и текущие комментарии по статусу.</div>}
          </div>
          <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            Создать задачу
          </button>
        </div>

        {tasks.length === 0 ? (
          <div style={{ padding: 28, borderRadius: 14, border: "1px dashed #bfdbfe", background: "#f8fbff", color: "#64748b", fontSize: 13, textAlign: "center" }}>В плане пока нет задач. Создайте первую задачу развития.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {tasks.map(task => {
                const tone = taskTone(task);
                const active = selectedTask?.id === task.id;
                return (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    style={{
                      textAlign: "left",
                      padding: isMobile ? "12px" : "14px 16px",
                      minHeight: isMobile ? 88 : 104,
                      background: task.done ? "#f0fdf4" : active ? "#eff6ff" : "#f8fafc",
                      borderRadius: 12,
                      border: "1.5px solid " + (task.done ? "#bbf7d0" : active ? "#93c5fd" : "#e2edf8"),
                      cursor: "pointer",
                      fontFamily: "Inter",
                      boxShadow: active ? "0 8px 20px rgba(37,99,235,.10)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: tone.color, background: tone.bg, padding: "3px 9px", borderRadius: 999 }}>{tone.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#2563eb", padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>Задача</span>
                    </div>
                    <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 750, color: task.done ? "#64748b" : "#1e3a6e", lineHeight: 1.35, minHeight: isMobile ? 0 : 36, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</div>
                    <div style={{ display: "inline-flex", marginTop: 10, fontSize: 11, fontWeight: 600, color: tone.color, background: tone.bg, padding: "3px 9px", borderRadius: 999 }}>{compactStatus(task)}</div>
                  </button>
                );
              })}
            </div>

            {selectedTask && (
              <div style={{ marginTop: 18, padding: isMobile ? 14 : 18, background: "#f8fafc", borderRadius: 14, border: "1px solid #e2edf8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <button onClick={() => toggleTaskDone(selectedTask)} title={selectedTask.done ? "Вернуть в работу" : "Отметить выполненной"} style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid " + (selectedTask.done ? "#22c55e" : "#cbd5e1"), background: selectedTask.done ? "#22c55e" : "#fff", color: selectedTask.done ? "#fff" : "#94a3b8", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {selectedTask.done && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                      <div style={{ fontSize: 16, fontWeight: 800, color: selectedTask.done ? "#64748b" : "#1e3a6e", lineHeight: 1.35, textDecoration: selectedTask.done ? "line-through" : "none" }}>{selectedTask.title}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 700, marginTop: 6 }}>{formatPlanDate(selectedTask.due)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setEditTask(selectedTask)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #dbeafe", background: "#fff", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter" }}>Редактировать</button>
                    {canDeleteTask(selectedTask) && <button onClick={() => deleteTask(selectedTask.id)} title="Удалить задачу" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V3h4v1m-5 2 .4 5h5.2L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <div style={{ padding: 14, background: "#fff", borderRadius: 12, border: "1px solid #e8f1fd" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Описание задачи</div>
                    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{selectedTask.description || "Не указано"}</div>
                  </div>
                  <div style={{ padding: 14, background: "#fff", borderRadius: 12, border: "1px solid #e8f1fd" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Образ результата</div>
                    <div style={{ fontSize: 13, color: "#1e3a6e", lineHeight: 1.6 }}>{selectedTask.resultImage || "Не указан"}</div>
                  </div>
                  <div style={{ padding: 14, background: "#fff", borderRadius: 12, border: "1px solid #e8f1fd" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Метрика успеха</div>
                    <div style={{ fontSize: 13, color: "#1e3a6e", lineHeight: 1.6 }}>{selectedTask.successMetric || "Не указана"}</div>
                  </div>
                  <div style={{ padding: 14, background: "#fff", borderRadius: 12, border: "1px solid #e8f1fd" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Сроки задачи</div>
                    <div style={{ fontSize: 13, color: "#1e3a6e", lineHeight: 1.6 }}>{formatPlanDate(selectedTask.due)}</div>
                  </div>
                  <div style={{ padding: 14, background: "#fff", borderRadius: 12, border: "1px solid #e8f1fd" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Соисполнители</div>
                    {selectedMembers.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>Не назначены</div>
                    ) : (
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        {selectedMembers.map(member => (
                          <span key={member.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 999, background: "#eff6ff", color: "#2563eb", fontSize: 12, fontWeight: 700 }}>
                            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>{member.initials}</span>
                            {member.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 12, padding: 14, background: "#fff", borderRadius: 12, border: "1px solid #e8f1fd" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Подзадачи / чек-поинты</div>
                  {(selectedTask.checkpoints || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Подзадачи не добавлены</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(selectedTask.checkpoints || []).map(point => (
                        <div key={point.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", background: point.done ? "#f0fdf4" : "#f8fafc", borderRadius: 10, border: "1px solid " + (point.done ? "#bbf7d0" : "#e2edf8") }}>
                          <button onClick={() => toggleCheckpointDone(selectedTask, point.id)} title={point.done ? "Вернуть подзадачу" : "Отметить подзадачу"} style={{ width: 22, height: 22, borderRadius: 7, border: "1.5px solid " + (point.done ? "#22c55e" : "#cbd5e1"), background: point.done ? "#22c55e" : "#fff", color: point.done ? "#fff" : "#94a3b8", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {point.done && <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </button>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: point.done ? "#64748b" : "#1e3a6e", fontWeight: 600, lineHeight: 1.35, textDecoration: point.done ? "line-through" : "none" }}>{point.label || "Подзадача"}</span>
                          <span style={{ fontSize: 12, color: point.done ? "#16a34a" : "#2563eb", fontWeight: 700, whiteSpace: "nowrap" }}>{formatPlanDate(point.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Статус / комментарий</div>
                  <textarea
                    value={selectedTask.status || ""}
                    onChange={e => {
                      resizeStatusTextarea(e.currentTarget);
                      updateStatusDraft(selectedTask.id, e.target.value);
                    }}
                    ref={resizeStatusTextarea}
                    rows={3}
                    placeholder="Напишите текущий статус, блокеры или следующий шаг..."
                    style={{ ...inputStyle, resize: "none", minHeight: 76, lineHeight: 1.5, background: "#fff", overflow: "hidden" }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PlanSection;
