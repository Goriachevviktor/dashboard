import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar.jsx';

export default function AssigneePicker({ assigneeId, onChange, team = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = team.find(m => m.id === assigneeId) || null;

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={current ? "Сменить исполнителя" : "Назначить исполнителя"}
        style={{ display: "flex", alignItems: "center", gap: 6, background: open ? "#eff6ff" : "transparent", border: "1.5px solid " + (open ? "#93c5fd" : "#e2edf8"), borderRadius: 20, padding: "3px 10px 3px 4px", cursor: "pointer", outline: "none", transition: "all .15s", fontFamily: "Inter" }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.background = "#f0f6ff"; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = "#e2edf8"; e.currentTarget.style.background = "transparent"; } }}
      >
        <Avatar member={current} size={22} />
        <span style={{ fontSize: 12, color: current ? "#1e3a6e" : "#94a3b8", fontWeight: current ? 500 : 400, whiteSpace: "nowrap" }}>
          {current ? current.name : "Назначить"}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, opacity: .5 }}>
          <path d="M2 4l3 3 3-3" stroke="#64748b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(37,99,235,.14), 0 1px 4px rgba(0,0,0,.07)", padding: 6, minWidth: 180, border: "1px solid #e2edf8" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", letterSpacing: .8, textTransform: "uppercase", padding: "4px 10px 6px" }}>Исполнитель</div>
          {/* unassign option */}
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: assigneeId === null ? "#eff6ff" : "transparent", cursor: "pointer", fontFamily: "Inter", transition: "background .12s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f0f6ff"}
            onMouseLeave={e => e.currentTarget.style.background = assigneeId === null ? "#eff6ff" : "transparent"}
          >
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 9l6-6M9 9L3 3" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </div>
            <span style={{ fontSize: 13, color: "#64748b" }}>Снять исполнителя</span>
          </button>
          {team.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: assigneeId === m.id ? "#eff6ff" : "transparent", cursor: "pointer", fontFamily: "Inter", transition: "background .12s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f6ff"}
              onMouseLeave={e => e.currentTarget.style.background = assigneeId === m.id ? "#eff6ff" : "transparent"}
            >
              <Avatar member={m} size={24} />
              <span style={{ fontSize: 13, color: "#1e3a6e", fontWeight: assigneeId === m.id ? 600 : 400 }}>{m.name}</span>
              {assigneeId === m.id && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: "auto" }}>
                  <path d="M3 7l3 3 5-5" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
