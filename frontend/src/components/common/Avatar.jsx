import { userColor } from '../../utils.js';

export default function Avatar({ member, size = 28 }) {
  if (!member) return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#e2edf8", border: "1.5px dashed #94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 5a3 3 0 0 1 6 0" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round"/></svg>
    </div>
  );
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: member.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }} title={member.name}>
      {member.initials}
    </div>
  );
}
