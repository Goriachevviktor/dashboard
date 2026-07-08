import { PASTELS, FONT_STACK } from '../../theme.js';

export default function StatCard({ label, value, sub, color, compact = false, onClick = null, active = false, pastel = null }) {
  const interactive = typeof onClick === "function";
  const tone = pastel ? (PASTELS[pastel] || PASTELS.blue) : null;

  const baseStyle = tone
    ? { background: tone.surface, borderRadius: 16, padding: compact ? "9px 10px" : "12px 14px", flex: 1, minWidth: compact ? 0 : 140, border: active ? "1.5px solid " + tone.value : "1.5px solid transparent", cursor: interactive ? "pointer" : "default", fontFamily: FONT_STACK }
    : { background: active ? "#eff6ff" : "#fff", borderRadius: compact ? 10 : 14, padding: compact ? "9px 10px" : "20px 22px", flex: 1, minWidth: compact ? 0 : 180, border: active ? "1.5px solid #2563eb" : "1.5px solid transparent", boxShadow: compact ? "0 1px 3px rgba(37,99,235,.05)" : "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", cursor: interactive ? "pointer" : "default" };

  const labelColor = tone ? tone.label : (active ? "#2563eb" : "#94a3b8");
  const valueColor = tone ? tone.value : (color || "#1e3a6e");
  const subColor = tone ? tone.label : (active ? "#2563eb" : "#64748b");

  return (
    <div
      onClick={onClick || undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={baseStyle}
    >
      <div style={{ fontSize: compact ? 8 : (tone ? 9 : 11), fontWeight: 700, color: labelColor, letterSpacing: compact ? .35 : .6, textTransform: "uppercase", marginBottom: compact ? 4 : (tone ? 2 : 8), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: compact ? 20 : (tone ? 24 : 32), fontWeight: 800, color: valueColor, lineHeight: 1, letterSpacing: tone ? -.5 : 0 }}>{value}</div>
      {sub && <div style={{ fontSize: compact ? 9 : (tone ? 10 : 12), color: subColor, marginTop: compact ? 3 : (tone ? 2 : 5), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}
