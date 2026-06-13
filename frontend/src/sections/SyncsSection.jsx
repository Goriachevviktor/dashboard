import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { ConfirmDialog, useConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useViewportFlags } from '../utils.js';

function SyncsSection({ initialStickers = null, api, onError }) {
  const { isMobile } = useViewportFlags();
  const MIN_STICKER_WIDTH = 220;
  const MIN_STICKER_HEIGHT = 160;
  const STICKER_COLORS = [
    { id: "sky", label: "Голубой", surface: "#eff6ff", accent: "#2563eb", border: "#bfdbfe" },
    { id: "mint", label: "Мятный", surface: "#ecfdf5", accent: "#10b981", border: "#a7f3d0" },
    { id: "amber", label: "Янтарный", surface: "#fffbeb", accent: "#f59e0b", border: "#fde68a" },
    { id: "violet", label: "Лавандовый", surface: "#f5f3ff", accent: "#8b5cf6", border: "#ddd6fe" },
    { id: "rose", label: "Розовый", surface: "#fff1f2", accent: "#e11d48", border: "#fecdd3" },
  ];
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingStickerId, setEditingStickerId] = useState(null);
  const [stickers, setStickers] = useState(initialStickers?.length ? initialStickers : [
    { id: 1, speaker: "Алексей К.", topic: "Риски квартального отчёта", text: "Подсветить блокеры по финансам и согласованию с аналитикой.", colorId: "sky", x: 24, y: 28, width: 236, height: 188 },
    { id: 2, speaker: "Мария С.", topic: "Статус продуктовой команды", text: "Обновить прогресс по MVP и зависимостям от дизайна.", colorId: "mint", x: 286, y: 64, width: 244, height: 196 },
    { id: 3, speaker: "Дмитрий П.", topic: "Технический комитет", text: "Собрать решения по архитектуре и вынести 2 спорных вопроса.", colorId: "amber", x: 558, y: 36, width: 236, height: 188 },
  ]);

  useEffect(() => {
    if (initialStickers) setStickers(initialStickers);
  }, [initialStickers]);

  function clampStickerPosition(x, y, width = 236, height = 188) {
    const board = boardRef.current;
    if (!board) return { x, y };
    const maxX = Math.max(12, board.clientWidth - width - 12);
    const maxY = Math.max(12, board.clientHeight - height - 12);
    return {
      x: Math.min(Math.max(12, x), maxX),
      y: Math.min(Math.max(12, y), maxY),
    };
  }

  function clampStickerSize(x, y, width, height) {
    const board = boardRef.current;
    if (!board) return { width, height };
    const maxWidth = Math.max(MIN_STICKER_WIDTH, board.clientWidth - x - 12);
    const maxHeight = Math.max(MIN_STICKER_HEIGHT, board.clientHeight - y - 12);
    return {
      width: Math.min(Math.max(MIN_STICKER_WIDTH, width), maxWidth),
      height: Math.min(Math.max(MIN_STICKER_HEIGHT, height), maxHeight),
    };
  }

  useEffect(() => {
    function handleMove(e) {
      if (!dragRef.current) return;
      const boardRect = boardRef.current?.getBoundingClientRect();
      if (!boardRect) return;
      const current = dragRef.current;
      if (current.mode === "move") {
        const { id, offsetX, offsetY, width, height } = current;
        const nextPos = clampStickerPosition(
          e.clientX - boardRect.left - offsetX,
          e.clientY - boardRect.top - offsetY,
          width,
          height
        );
        current.latestPatch = nextPos;
        setStickers(items => items.map(item => item.id === id ? { ...item, ...nextPos } : item));
        return;
      }

      if (current.mode === "resize") {
        const { id, startX, startY, startWidth, startHeight, stickerX, stickerY } = current;
        const nextSize = clampStickerSize(
          stickerX,
          stickerY,
          startWidth + (e.clientX - startX),
          startHeight + (e.clientY - startY)
        );
        current.latestPatch = nextSize;
        setStickers(items => items.map(item => item.id === id ? { ...item, ...nextSize } : item));
      }
    }

    function handleUp() {
      const current = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      if (current?.latestPatch) {
        api.patchSticker(current.id, current.latestPatch).catch(onError);
      }
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [api, onError]);

  function updateSticker(id, patch) {
    setStickers(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
    api.patchSticker(id, patch).catch(onError);
  }

  async function deleteSticker(id) {
    try {
      await api.deleteSticker(id);
      setStickers(items => items.filter(item => item.id !== id));
    } catch (error) {
      onError(error);
    }
  }

  function CreateStickerModal({ onClose, onCreate }) {
    const [speaker, setSpeaker] = useState("");
    const [topic, setTopic] = useState("");
    const [text, setText] = useState("");
    const [colorId, setColorId] = useState("sky");
    const [error, setError] = useState("");

    useEffect(() => {
      function onKeyDown(e) { if (e.key === "Escape") onClose(); }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    function handleSubmit() {
      if (!topic.trim()) {
        setError("Укажите тему спикера");
        return;
      }
      onCreate({
        speaker: speaker.trim() || "Без спикера",
        topic: topic.trim(),
        text: text.trim(),
        colorId,
        width: 236,
        height: 188,
      });
      onClose();
    }

    const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2edf8", fontSize: 14, color: "#1e3a6e", fontFamily: "Inter", outline: "none", background: "#f8fafc" };
    const labelStyle = { fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block", letterSpacing: .3 };

    return (
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
        <div style={{ width: "min(92vw, 500px)", background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(37,99,235,.22)" }}>
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>Новый стикер</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Добавьте карточку для заметок</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f0f6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Спикер</label>
                <input value={speaker} onChange={e => setSpeaker(e.target.value)} placeholder="Например: Мария С." style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Тема спикера *</label>
                <input value={topic} onChange={e => { setTopic(e.target.value); setError(""); }} placeholder="О чём будет блок" style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#e2edf8" }} />
                {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Заметка</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Ключевые тезисы, вопросы, follow-up..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }} />
            </div>
            <div>
              <label style={labelStyle}>Цвет стикера</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {STICKER_COLORS.map(color => (
                  <button
                    key={color.id}
                    onClick={() => setColorId(color.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, border: "1.5px solid " + (colorId === color.id ? color.accent : color.border), background: color.surface, cursor: "pointer", fontFamily: "Inter" }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: color.accent, boxShadow: "inset 0 0 0 2px rgba(255,255,255,.5)" }}></span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: color.accent }}>{color.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #f0f6ff" }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
            <button onClick={handleSubmit} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 12px rgba(37,99,235,.3)" }}>Создать стикер</button>
          </div>
        </div>
      </div>
    );
  }

  async function addSticker(payload) {
    const board = boardRef.current;
    const baseX = board ? 20 + (stickers.length % 3) * Math.min(264, Math.max(180, board.clientWidth / 3 - 18)) : 24;
    const baseY = 24 + Math.floor(stickers.length / 3) * 28;
    const position = clampStickerPosition(baseX, baseY, payload.width, payload.height);
    try {
      const created = await api.createSticker({ ...payload, ...position });
      setStickers(items => [...items, created]);
    } catch (error) {
      onError(error);
    }
  }

  if (isMobile) {
    const mobileInputStyle = color => ({ width: "100%", border: "1.5px solid " + color.border, outline: "none", background: "rgba(255,255,255,.78)", color: "#1e3a6e", fontFamily: "Inter", fontSize: 16, borderRadius: 12, padding: "10px 12px", boxSizing: "border-box" });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {showCreate && <CreateStickerModal onClose={() => setShowCreate(false)} onCreate={addSticker} />}
        <button
          onClick={() => setShowCreate(true)}
          style={{ minHeight: 46, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 16, fontWeight: 750, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.22)" }}
        >
          Создать заметку
        </button>
        {stickers.map(sticker => {
          const color = STICKER_COLORS.find(item => item.id === sticker.colorId) || STICKER_COLORS[0];
          const editing = editingStickerId === sticker.id;
          return (
            <div
              key={sticker.id}
              onClick={() => !editing && setEditingStickerId(sticker.id)}
              style={{ position: "relative", background: "#fff", border: "1.5px solid " + color.border, borderLeft: "5px solid " + color.accent, borderRadius: 16, padding: 14, boxShadow: "0 2px 10px rgba(37,99,235,.07)", cursor: editing ? "default" : "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: editing ? 12 : 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editing ? (
                    <input
                      value={sticker.topic}
                      onChange={e => updateSticker(sticker.id, { topic: e.target.value })}
                      placeholder="Тема заметки"
                      style={{ ...mobileInputStyle(color), fontWeight: 800, marginBottom: 8 }}
                      autoFocus
                    />
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 850, color: "#1e3a6e", lineHeight: 1.25, overflowWrap: "anywhere" }}>{sticker.topic || "Без темы"}</div>
                  )}
                  {!editing && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", marginTop: 7, padding: "4px 9px", borderRadius: 999, background: color.surface, color: color.accent, fontSize: 12, fontWeight: 750 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color.accent, flexShrink: 0 }}></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sticker.speaker || "Без спикера"}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {editing && (
                    <button onClick={e => { e.stopPropagation(); setEditingStickerId(null); }} title="Готово" style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); deleteSticker(sticker.id); }} title="Удалить" style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: "#fff1f2", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V3h4v1m-5 2 .4 5h5.2L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </div>
              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }} onClick={e => e.stopPropagation()}>
                  <input
                    value={sticker.speaker}
                    onChange={e => updateSticker(sticker.id, { speaker: e.target.value })}
                    placeholder="Спикер"
                    style={mobileInputStyle(color)}
                  />
                  <textarea
                    value={sticker.text}
                    onChange={e => updateSticker(sticker.id, { text: e.target.value })}
                    rows={5}
                    placeholder="Заметка"
                    style={{ ...mobileInputStyle(color), minHeight: 132, lineHeight: 1.45, resize: "vertical" }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {sticker.text || "Нет текста"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", margin: isMobile ? "-16px" : "-28px", background: "#f0f6ff" }}>
      {showCreate && <CreateStickerModal onClose={() => setShowCreate(false)} onCreate={addSticker} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: isMobile ? "16px 16px 12px" : "22px 28px 14px", flexShrink: 0 }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            Создать заметку
          </button>
        </div>
        <div
          ref={boardRef}
          style={{
            position: "relative",
            minHeight: 0,
            borderRadius: 0,
            overflow: "hidden",
            background: "linear-gradient(180deg,#f8fbff 0%, #f1f7ff 100%)",
            flex: 1,
          }}
        >
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(147,197,253,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(147,197,253,.18) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }}></div>
          <div style={{ position: "absolute", top: 18, left: 18, fontSize: 11, fontWeight: 700, color: "#93a9ca", letterSpacing: .7, textTransform: "uppercase", pointerEvents: "none" }}>Workspace</div>
          {stickers.map(sticker => {
            const color = STICKER_COLORS.find(item => item.id === sticker.colorId) || STICKER_COLORS[0];
            return (
              <div
                key={sticker.id}
                style={{
                  position: "absolute",
                  left: sticker.x,
                  top: sticker.y,
                  width: sticker.width || 236,
                  height: sticker.height || 188,
                  borderRadius: 18,
                  background: color.surface,
                  border: "1.5px solid " + color.border,
                  boxShadow: "0 10px 24px rgba(37,99,235,.12), 0 2px 6px rgba(15,23,42,.05)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  onMouseDown={e => {
                    e.stopPropagation();
                    const rect = e.currentTarget.parentElement.getBoundingClientRect();
                    dragRef.current = {
                      mode: "move",
                      id: sticker.id,
                      offsetX: e.clientX - rect.left,
                      offsetY: e.clientY - rect.top,
                      width: sticker.width || 236,
                      height: sticker.height || 188,
                    };
                    document.body.style.userSelect = "none";
                  }}
                  style={{ padding: "12px 14px 10px", cursor: "grab", borderBottom: "1px dashed " + color.border, background: "linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,0))" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: color.accent, letterSpacing: .8, textTransform: "uppercase", marginBottom: 5 }}>{sticker.speaker}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a6e", lineHeight: 1.35 }}>{sticker.topic}</div>
                    </div>
                    <button
                      onClick={() => deleteSticker(sticker.id)}
                      style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.72)", color: "#94a3b8", cursor: "pointer", flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "stretch" }}>
                  <textarea
                    value={sticker.text}
                    onChange={e => updateSticker(sticker.id, { text: e.target.value })}
                    placeholder="Запишите основные тезисы..."
                    style={{ flex: "1 1 auto", width: "100%", height: "100%", minHeight: 0, border: "none", background: "transparent", resize: "none", outline: "none", padding: "12px 14px 34px", fontFamily: "Inter", fontSize: 13, lineHeight: 1.55, color: "#475569", boxSizing: "border-box", overflowY: "auto", display: "block" }}
                  />
                </div>
                <div
                  onMouseDown={e => {
                    e.stopPropagation();
                    dragRef.current = {
                      mode: "resize",
                      id: sticker.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      startWidth: sticker.width || 236,
                      startHeight: sticker.height || 188,
                      stickerX: sticker.x,
                      stickerY: sticker.y,
                    };
                    document.body.style.userSelect = "none";
                  }}
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 8,
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    cursor: "nwse-resize",
                    background: "rgba(255,255,255,.72)",
                    border: "1px solid " + color.border,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 8L8 2M4.5 8H8V4.5" stroke={color.accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            );
          })}
          {stickers.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
              <div>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: "#eff6ff", color: "#60a5fa", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3a6e", marginBottom: 6 }}>Доска пока пустая</div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>Добавь первую заметку и распредели темы по полю.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SyncsSection;
