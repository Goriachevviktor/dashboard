import { useState, useRef, useEffect, useCallback } from 'react';

const COLORS = ["#2563eb","#8b5cf6","#10b981","#f59e0b","#ef4444","#0ea5e9","#6366f1","#14b8a6"];

function getColor(depth, index) {
  return COLORS[(index + depth * 3) % COLORS.length];
}

const INIT_MAP = {
  id: "root",
  text: "Центральная идея",
  children: [
    { id: "n1", text: "Направление 1", children: [
      { id: "n1a", text: "Подпункт А", children: [] },
      { id: "n1b", text: "Подпункт Б", children: [] },
    ]},
    { id: "n2", text: "Направление 2", children: [
      { id: "n2a", text: "Подпункт В", children: [] },
    ]},
    { id: "n3", text: "Направление 3", children: [] },
  ],
};

function uid() { return "n" + Math.random().toString(36).slice(2, 8); }

function findNode(tree, id) {
  if (tree.id === id) return tree;
  for (const c of tree.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function updateNode(tree, id, updater) {
  if (tree.id === id) return updater(tree);
  return { ...tree, children: tree.children.map(c => updateNode(c, id, updater)) };
}

function removeNode(tree, id) {
  return { ...tree, children: tree.children.filter(c => c.id !== id).map(c => removeNode(c, id)) };
}

function NodeBox({ node, depth, onAdd, onEdit, onDelete, selectedId, onSelect }) {
  const color = depth === 0 ? "#1e3a6e" : getColor(depth, node.id.charCodeAt(1) || 0);
  const isSelected = selectedId === node.id;
  const isRoot = depth === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: depth % 2 === 0 ? "flex-start" : "flex-end", gap: 8 }}>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          background: isRoot ? "#1e3a6e" : `${color}18`,
          border: `2px solid ${isSelected ? "#1e3a6e" : color}`,
          borderRadius: isRoot ? 16 : 12,
          padding: isRoot ? "12px 20px" : "8px 14px",
          cursor: "pointer",
          position: "relative",
          boxShadow: isSelected ? `0 0 0 3px ${color}33` : "0 1px 4px rgba(0,0,0,.06)",
          transition: "box-shadow .15s",
          minWidth: isRoot ? 160 : 120,
          maxWidth: 240,
        }}
      >
        <div style={{ fontSize: isRoot ? 15 : 13, fontWeight: isRoot ? 700 : 600, color: isRoot ? "#fff" : color, wordBreak: "break-word" }}>
          {node.text}
        </div>
        {isSelected && !isRoot && (
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button onClick={e => { e.stopPropagation(); onEdit(node.id); }}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: `1px solid ${color}`, background: "transparent", color, cursor: "pointer", fontFamily: "Inter" }}>
              ✏️ Изменить
            </button>
            <button onClick={e => { e.stopPropagation(); onAdd(node.id); }}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: `1px solid ${color}`, background: "transparent", color, cursor: "pointer", fontFamily: "Inter" }}>
              + Дочерний
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(node.id); }}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid #fca5a5", background: "transparent", color: "#ef4444", cursor: "pointer", fontFamily: "Inter" }}>
              🗑
            </button>
          </div>
        )}
        {isRoot && isSelected && (
          <div style={{ marginTop: 6 }}>
            <button onClick={e => { e.stopPropagation(); onEdit(node.id); }}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,.4)", background: "transparent", color: "#fff", cursor: "pointer", fontFamily: "Inter" }}>
              ✏️ Изменить
            </button>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: depth % 2 === 0 ? 32 : 0, paddingRight: depth % 2 !== 0 ? 32 : 0, borderLeft: depth % 2 === 0 ? `2px solid ${color}33` : "none", borderRight: depth % 2 !== 0 ? `2px solid ${color}33` : "none" }}>
          {node.children.map(child => (
            <NodeBox key={child.id} node={child} depth={depth + 1} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}

      {isSelected && (
        <button onClick={e => { e.stopPropagation(); onAdd(node.id); }}
          style={{ fontSize: 11, padding: "4px 12px", borderRadius: 8, border: `1.5px dashed ${color}`, background: "transparent", color, cursor: "pointer", fontFamily: "Inter", fontWeight: 600 }}>
          + Добавить ветку
        </button>
      )}
    </div>
  );
}

function EditModal({ nodeId, currentText, onClose, onSave }) {
  const [text, setText] = useState(currentText);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={e => { e.preventDefault(); onSave(nodeId, text); onClose(); }}
        style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 24px 64px rgba(30,58,110,.18)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e", marginBottom: 16 }}>Редактировать узел</div>
        <input value={text} onChange={e => setText(e.target.value)} autoFocus required
          style={{ width: "100%", height: 42, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#64748b", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Отмена</button>
          <button type="submit" style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}

export default function MindMapSection() {
  const [tree, setTree] = useState(INIT_MAP);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id);
  }

  function handleAdd(parentId) {
    const newNode = { id: uid(), text: "Новый узел", children: [] };
    setTree(t => updateNode(t, parentId, n => ({ ...n, children: [...n.children, newNode] })));
    setSelectedId(newNode.id);
  }

  function handleEdit(id) {
    setEditingId(id);
  }

  function handleSaveEdit(id, text) {
    setTree(t => updateNode(t, id, n => ({ ...n, text })));
  }

  function handleDelete(id) {
    setTree(t => removeNode(t, id));
    setSelectedId(null);
  }

  const editingNode = editingId ? findNode(tree, editingId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {editingNode && (
        <EditModal nodeId={editingId} currentText={editingNode.text} onClose={() => setEditingId(null)} onSave={handleSaveEdit} />
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, fontSize: 13, color: "#94a3b8" }}>
          Нажмите на узел чтобы выбрать, затем добавляйте дочерние ветки
        </div>
        {selectedId && selectedId !== "root" && (
          <button onClick={() => { handleDelete(selectedId); }}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fef2f2", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>
            Удалить узел
          </button>
        )}
        <button onClick={() => handleAdd("root")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          Добавить ветку
        </button>
      </div>

      {/* Map canvas */}
      <div
        onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}
        style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2edf8", padding: 32, minHeight: 400, boxShadow: "0 1px 4px rgba(37,99,235,.05)", overflow: "auto" }}
      >
        <div style={{ display: "inline-flex", gap: 32, alignItems: "flex-start", minWidth: "100%" }}>
          <NodeBox
            node={tree}
            depth={0}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
        Подсказка: кликните на узел → появятся кнопки действий
      </div>
    </div>
  );
}
