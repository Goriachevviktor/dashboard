export default function StatCard({ label, value, sub, color, compact = false, onClick = null, active = false }) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick || undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{ background: active ? "#eff6ff" : "#fff", borderRadius: compact ? 10 : 14, padding: compact ? "9px 10px" : "20px 22px", flex: 1, minWidth: compact ? 0 : 180, border: active ? "1.5px solid #2563eb" : "1.5px solid transparent", boxShadow: compact ? "0 1px 3px rgba(37,99,235,.05)" : "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", cursor: interactive ? "pointer" : "default" }}
    >
      <div style={{ fontSize: compact ? 8 : 11, fontWeight: 700, color: active ? "#2563eb" : "#94a3b8", letterSpacing: compact ? .35 : .6, textTransform: "uppercase", marginBottom: compact ? 4 : 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: compact ? 20 : 32, fontWeight: 800, color: color || "#1e3a6e", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: compact ? 9 : 12, color: active ? "#2563eb" : "#64748b", marginTop: compact ? 3 : 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}
