import { useState, useEffect, useCallback } from 'react';

export function ConfirmDialog({ title, message, itemTitle, confirmText = "Удалить", cancelText = "Отмена", tone = "danger", onCancel, onConfirm }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  const accent = tone === "danger" ? "#ef4444" : "#2563eb";
  const accentSoft = tone === "danger" ? "#fef2f2" : "#eff6ff";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(15, 30, 70, .42)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        style={{
          width: "min(92vw, 440px)",
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 28px 80px rgba(15, 30, 70, .28)",
          border: "1px solid rgba(226, 237, 248, .9)",
          overflow: "hidden",
          animation: "modalIn .18s ease",
        }}
      >
        <style>{`@keyframes modalIn { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:none; } }`}</style>
        <div style={{ padding: "24px 26px 18px", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: accentSoft,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-8 3 .7 8.2A2 2 0 0 0 9.7 20h4.6a2 2 0 0 0 2-1.8L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11.5v5M14 11.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="confirm-title" style={{ fontSize: 18, fontWeight: 750, color: "#1e3a6e", lineHeight: 1.25 }}>
              {title}
            </div>
            <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.55, marginTop: 8 }}>
              {message}
            </div>
            {itemTitle && (
              <div
                title={itemTitle}
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e8f1fd",
                  color: "#1e3a6e",
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {itemTitle}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: "16px 26px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f0f6ff" }}>
          <button
            onClick={onCancel}
            style={{ padding: "10px 18px", borderRadius: 11, border: "1.5px solid #e2edf8", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}
          >
            {cancelText}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            style={{ padding: "10px 20px", borderRadius: 11, border: "none", background: `linear-gradient(135deg, ${accent}, #dc2626)`, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 8px 18px rgba(239,68,68,.24)" }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => new Promise(resolve => {
    setRequest({ ...options, resolve });
  }), []);

  const close = useCallback((result) => {
    setRequest(current => {
      if (current) current.resolve(result);
      return null;
    });
  }, []);

  const dialog = request ? (
    <ConfirmDialog
      {...request}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return [confirm, dialog];
}
