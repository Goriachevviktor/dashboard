import React from 'react';
import { useState, useEffect } from 'react';
import StatCard from '../components/common/StatCard.jsx';
import Avatar from '../components/common/Avatar.jsx';
import { ConfirmDialog, useConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { KpiRadarChart, BurndownChart } from '../components/common/Charts.jsx';
import { useViewportFlags, formatDashboardDate } from '../utils.js';

function UcpSection({ initialTasks = [], team = [], api, onError, currentUser = null }) {
  const { isMobile } = useViewportFlags();
  const [confirmDelete, confirmDialog] = useConfirmDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [tasks, setTasks] = useState(() => Array.isArray(initialTasks) ? initialTasks : []);

  useEffect(() => {
    if (initialTasks) setTasks(initialTasks);
  }, [initialTasks]);

  const canDeleteTask = task => currentUser?.role === "admin" || currentUser?.id === task.ownerId;

  function formatCheckpointDate(value) {
    if (!value) return "Без даты";
    const date = new Date(value + "T00:00:00");
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
  }

  function CreateUcpTaskModal({ task, onClose, onSubmit }) {
    const isEdit = Boolean(task);
    const [title, setTitle] = useState(task?.title || "");
    const [description, setDescription] = useState(task?.description || "");
    const [done, setDone] = useState(Boolean(task?.done));
    const [memberIds, setMemberIds] = useState(task?.memberIds || []);
    const [checkpoints, setCheckpoints] = useState(
      task?.checkpoints?.length
        ? task.checkpoints.map(item => ({ ...item, evidenceMaterials: item.evidenceMaterials || "", done: Boolean(item.done) }))
        : [{ id: 1, label: "", date: "", evidenceMaterials: "", done: false }]
    );
    const [error, setError] = useState("");

    useEffect(() => {
      function onKeyDown(e) { if (e.key === "Escape") onClose(); }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    function toggleMember(memberId) {
      setMemberIds(ids => ids.includes(memberId) ? ids.filter(id => id !== memberId) : [...ids, memberId]);
    }

    function updateCheckpoint(checkpointId, patch) {
      setCheckpoints(items => items.map(item => item.id === checkpointId ? { ...item, ...patch } : item));
    }

    function addCheckpoint() {
      setCheckpoints(items => [...items, { id: Date.now() + items.length, label: "", date: "", evidenceMaterials: "", done: false }]);
    }

    function removeCheckpoint(checkpointId) {
      setCheckpoints(items => items.length === 1 ? items : items.filter(item => item.id !== checkpointId));
    }

    function handleSubmit() {
      if (!title.trim()) {
        setError("Введите название задачи");
        return;
      }
      const normalizedCheckpoints = checkpoints
        .map(item => ({
          ...item,
          label: item.label.trim(),
          date: item.date,
          evidenceMaterials: (item.evidenceMaterials || "").trim(),
          done: Boolean(item.done),
        }))
        .filter(item => item.label || item.date || item.evidenceMaterials);
      onSubmit({
        ...(task ? { id: task.id } : {}),
        title: title.trim(),
        description: description.trim(),
        done,
        memberIds,
        checkpoints: normalizedCheckpoints,
      });
      onClose();
    }

    const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2edf8", fontSize: 14, color: "#1e3a6e", fontFamily: "Inter", outline: "none", background: "#f8fafc" };
    const labelStyle = { fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block", letterSpacing: .3 };

    return (
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
        <div style={{ width: "min(94vw, 760px)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(37,99,235,.22)" }}>
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>{isEdit ? "Редактирование задачи УПЦ" : "Новая задача УПЦ"}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Название, описание, контрольные точки и команда соисполнителей</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f0f6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={labelStyle}>Название задачи *</label>
              <input value={title} onChange={e => { setTitle(e.target.value); setError(""); }} placeholder="Например: Улучшить целевой показатель активации" style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#e2edf8" }} />
              {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
            </div>
            <div>
              <label style={labelStyle}>Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Опишите контекст, ожидаемый результат и критерии успеха..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1.5px solid " + (done ? "#86efac" : "#e2edf8"), background: done ? "#f0fdf4" : "#f8fafc", color: done ? "#15803d" : "#1e3a6e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#22c55e" }} />
              Задача выполнена
            </label>
            <div>
              <label style={labelStyle}>Команда соисполнителей</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {team.map(member => {
                  const active = memberIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => toggleMember(member.id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, border: "1.5px solid " + (active ? member.color : "#e2edf8"), background: active ? member.color + "18" : "#f8fafc", color: active ? member.color : "#64748b", cursor: "pointer", fontFamily: "Inter" }}
                    >
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: member.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>{member.initials}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{member.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Контрольные точки</label>
                <button onClick={addCheckpoint} style={{ border: "none", background: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>+ Добавить точку</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {checkpoints.map(point => (
                  <div key={point.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 10, alignItems: "start" }}>
                    <label title="Выполнено" style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid " + (point.done ? "#86efac" : "#e2edf8"), background: point.done ? "#f0fdf4" : "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={Boolean(point.done)} onChange={e => updateCheckpoint(point.id, { done: e.target.checked })} style={{ width: 16, height: 16, accentColor: "#22c55e" }} />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr .8fr 1.2fr auto", gap: 10, alignItems: "center" }}>
                      <input value={point.label} onChange={e => updateCheckpoint(point.id, { label: e.target.value })} placeholder="Название контрольной точки" style={inputStyle} />
                      <input type="date" value={point.date} onChange={e => updateCheckpoint(point.id, { date: e.target.value })} style={inputStyle} />
                      <input value={point.evidenceMaterials || ""} onChange={e => updateCheckpoint(point.id, { evidenceMaterials: e.target.value })} placeholder="Подтверждающие материалы" style={inputStyle} />
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

  async function addTask(task) {
    try {
      const created = await api.createUcpTask(task);
      setTasks(items => [...items, created]);
    } catch (error) {
      onError(error);
    }
  }

  async function saveTask(task) {
    try {
      const saved = await api.patchUcpTask(task.id, task);
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

  async function deleteTask(taskId) {
    const task = tasks.find(item => item.id === taskId);
    const confirmed = await confirmDelete({
      title: "Удалить задачу УПЦ?",
      message: "Задача и ее контрольные точки исчезнут с доски УПЦ. Это действие нельзя отменить.",
      itemTitle: task?.title,
      confirmText: "Удалить",
    });
    if (!confirmed) return;
    try {
      await api.deleteUcpTask(taskId);
      setTasks(items => items.filter(item => item.id !== taskId));
      if (editTask?.id === taskId) setEditTask(null);
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {confirmDialog}
      {showCreate && <CreateUcpTaskModal onClose={() => setShowCreate(false)} onSubmit={addTask} />}
      {editTask && <CreateUcpTaskModal task={editTask} onClose={() => setEditTask(null)} onSubmit={(task) => { saveTask(task); setEditTask(null); }} />}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(3, minmax(180px, 1fr))", gap: isMobile ? 6 : 14 }}>
        <StatCard compact={isMobile} label="Задач УПЦ" value={tasks.length} sub={tasks.filter(task => task.done).length + " выполнено"} color="#1e3a6e"/>
        <StatCard compact={isMobile} label="Контрольных точек" value={tasks.reduce((sum, task) => sum + (task.checkpoints || []).length, 0)} sub={tasks.reduce((sum, task) => sum + (task.checkpoints || []).filter(point => point.done).length, 0) + " выполнено"} color="#2563eb"/>
        <StatCard compact={isMobile} label="Соисполнителей" value={new Set(tasks.flatMap(task => task.memberIds || [])).size} sub="задействовано" color="#8b5cf6"/>
      </div>
      <div style={{ background: "#fff", borderRadius: isMobile ? 18 : 16, padding: isMobile ? 14 : 24, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: isMobile ? 18 : 14, fontWeight: isMobile ? 850 : 600, color: "#1e3a6e" }}>Доска задач УПЦ</div>
            {!isMobile && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Фиксируйте инициативы, контрольные точки и команды соисполнителей в одном месте.</div>}
          </div>
          <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            Создать задачу
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {tasks.map(task => (
            <div key={task.id} style={{ padding: isMobile ? 14 : 18, background: task.done ? "#f8fff9" : "#f8fafc", borderRadius: 14, border: "1px solid " + (task.done ? "#bbf7d0" : "#e2edf8"), display: "flex", flexDirection: "column", gap: isMobile ? 12 : 14 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                    <button onClick={() => toggleTaskDone(task)} title={task.done ? "Вернуть в работу" : "Отметить выполненной"} style={{ width: 26, height: 26, borderRadius: 8, border: "1.5px solid " + (task.done ? "#22c55e" : "#cbd5e1"), background: task.done ? "#22c55e" : "#fff", color: task.done ? "#fff" : "#94a3b8", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {task.done && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <div style={{ fontSize: 15, fontWeight: 700, color: task.done ? "#64748b" : "#1e3a6e", lineHeight: 1.35, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setEditTask(task)} style={{ padding: isMobile ? "6px 8px" : "6px 10px", borderRadius: 8, border: "1px solid #dbeafe", background: "#fff", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>
                      {isMobile ? "Изм." : "Редактировать"}
                    </button>
                    {canDeleteTask(task) && (
                      <button onClick={() => deleteTask(task.id)} title="Удалить задачу УПЦ" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V3h4v1m-5 2 .4 5h5.2L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}
                  </div>
                </div>
                {task.description && <div style={{ fontSize: 13, color: "#64748b", marginTop: 8, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: isMobile ? 2 : "unset", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.description}</div>}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Контрольные точки</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(task.checkpoints || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Контрольные точки не добавлены</div>
                  ) : (task.checkpoints || []).map(point => (
                    <div key={point.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "9px 10px", background: point.done ? "#f0fdf4" : "#fff", borderRadius: 10, border: "1px solid " + (point.done ? "#bbf7d0" : "#e8f1fd") }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <button onClick={() => toggleCheckpointDone(task, point.id)} title={point.done ? "Вернуть контрольную точку" : "Отметить контрольную точку"} style={{ width: 22, height: 22, borderRadius: 7, border: "1.5px solid " + (point.done ? "#22c55e" : "#cbd5e1"), background: point.done ? "#22c55e" : "#fff", color: point.done ? "#fff" : "#94a3b8", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {point.done && <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </button>
                        <span style={{ fontSize: 13, color: point.done ? "#64748b" : "#1e3a6e", fontWeight: 500, flex: 1, textDecoration: point.done ? "line-through" : "none" }}>{point.label || "Контрольная точка"}</span>
                        <span style={{ fontSize: 12, color: point.done ? "#16a34a" : "#2563eb", fontWeight: 600, whiteSpace: "nowrap" }}>{formatCheckpointDate(point.date)}</span>
                      </div>
                      {point.evidenceMaterials && (
                        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                          <span style={{ fontWeight: 700, color: "#475569" }}>Материалы: </span>{point.evidenceMaterials}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .7, textTransform: "uppercase", marginBottom: 8 }}>Соисполнители</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(task.memberIds || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Команда пока не выбрана</div>
                  ) : (task.memberIds || []).map(memberId => {
                    const member = team.find(item => item.id === memberId);
                    if (!member) return null;
                    return (
                      <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#fff", borderRadius: 999, border: "1px solid #e8f1fd" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: member.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>{member.initials}</div>
                        <span style={{ fontSize: 12, color: "#1e3a6e", fontWeight: 600 }}>{member.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UcpSection;
