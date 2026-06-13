import React from 'react';
import { useState, useEffect } from 'react';
import StatCard from '../components/common/StatCard.jsx';
import Avatar from '../components/common/Avatar.jsx';
import { ConfirmDialog, useConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useViewportFlags, formatShortDate, isTaskOverdue } from '../utils.js';

function TaskArchiveSection({ initialTasks = [], team = [], api, onError, currentUser = null }) {
  const { isMobile } = useViewportFlags();
  const [confirmDelete, confirmDialog] = useConfirmDialog();
  const [tasks, setTasks] = useState(initialTasks);
  const [editTask, setEditTask] = useState(null);

  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const archivedTasks = tasks.filter(task => task.column === "Архив");
  const canDeleteTask = task => currentUser?.role === "admin" || currentUser?.id === task.ownerId;

  async function updateTask(taskId, payload) {
    try {
      const saved = await api.patchTask(taskId, payload);
      setTasks(items => items.map(item => item.id === saved.id ? saved : item));
      return saved;
    } catch (error) {
      onError(error);
      return null;
    }
  }

  async function saveTask(updated) {
    const saved = await updateTask(updated.id, updated);
    if (saved) setEditTask(null);
  }

  async function restoreTask(taskId, column) {
    await updateTask(taskId, { column });
  }

  async function deleteTask(taskId) {
    const task = tasks.find(item => item.id === taskId);
    const confirmed = await confirmDelete({
      title: "Удалить задачу из архива?",
      message: "Задача будет удалена окончательно. Это действие нельзя отменить.",
      itemTitle: task?.title,
      confirmText: "Удалить",
    });
    if (!confirmed) return;
    try {
      await api.deleteTask(taskId);
      setTasks(items => items.filter(item => item.id !== taskId));
      if (editTask?.id === taskId) setEditTask(null);
    } catch (error) {
      onError(error);
    }
  }

  const buttonStyle = (color = "#2563eb") => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: isMobile ? 34 : 32,
    padding: isMobile ? "7px 10px" : "6px 10px",
    borderRadius: 9,
    border: "1px solid " + (color === "#ef4444" ? "#fecaca" : "#dbeafe"),
    background: "#fff",
    color,
    fontSize: 12,
    fontWeight: 750,
    fontFamily: "Inter",
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {confirmDialog}
      {editTask && <TaskDetailModal task={editTask} onClose={() => setEditTask(null)} onSave={saveTask} team={team} currentUser={currentUser} />}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(180px, 1fr))", gap: isMobile ? 8 : 14 }}>
        <StatCard compact={isMobile} label="В архиве" value={archivedTasks.length} sub="закрытых задач" color="#64748b"/>
        <StatCard compact={isMobile} label="С исполнителем" value={archivedTasks.filter(task => task.assigneeId).length} sub="есть ответственный" color="#2563eb"/>
        <StatCard compact={isMobile} label="Без исполнителя" value={archivedTasks.filter(task => !task.assigneeId).length} sub="без назначения" color="#f59e0b"/>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: isMobile ? 14 : 20, border: "1px solid #e2edf8", boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 850, color: "#1e3a6e" }}>Архив задач</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Завершённые задачи не мешают текущей доске</div>
          </div>
        </div>

        {archivedTasks.length ? (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", padding: isMobile ? "10px 12px" : "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 11, fontWeight: 850, letterSpacing: .35, textTransform: "uppercase" }}>
              Наименование задачи
            </div>
            {archivedTasks.map((task, index) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setEditTask(task)}
                title="Открыть задачу"
                style={{
                  width: "100%",
                  minHeight: isMobile ? 42 : 44,
                  display: "block",
                  padding: isMobile ? "10px 12px" : "11px 16px",
                  border: "none",
                  borderBottom: index === archivedTasks.length - 1 ? "none" : "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#1e3a6e",
                  fontSize: 14,
                  fontWeight: 750,
                  fontFamily: "Inter",
                  lineHeight: 1.35,
                  textAlign: "left",
                  cursor: "pointer",
                  overflowWrap: "anywhere",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fbff"}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}
              >
                {task.title}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: isMobile ? "30px 14px" : "42px 20px", borderRadius: 14, border: "1px dashed #cbd5e1", color: "#94a3b8", textAlign: "center", fontSize: 14, fontWeight: 750 }}>
            В архиве пока нет задач
          </div>
        )}
      </div>
    </div>
  );
}

// ---- OTHER SECTIONS (placeholders) ----

export default TaskArchiveSection;
