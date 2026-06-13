import { useRef, useEffect } from 'react';

export function KpiRadarChart({ items, size = 260 }) {
  const center = size / 2;
  const radius = size * 0.3;
  const rings = [0.25, 0.5, 0.75, 1];

  function pointAt(ratio, index) {
    const angle = -Math.PI / 2 + (index / items.length) * Math.PI * 2;
    const r = radius * ratio;
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    };
  }

  function toPolyline(points) {
    return points.map(p => `${p.x},${p.y}`).join(" ");
  }

  const actualPoints = items.map((item, index) => pointAt(Math.max(.18, Math.min(1, item.actual / item.target)), index));
  const labelPoints = items.map((_, index) => pointAt(1.22, index));

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0 2px" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" role="img" aria-label="Радарная диаграмма показателей">
        {rings.map(ring => (
          <polygon
            key={ring}
            points={toPolyline(items.map((_, index) => pointAt(ring, index)))}
            fill={ring === 1 ? "#f8fbff" : "none"}
            stroke="#d8e8fb"
            strokeWidth="1"
          />
        ))}
        {items.map((item, index) => {
          const axisEnd = pointAt(1, index);
          const label = labelPoints[index];
          return (
            <g key={item.label}>
              <line x1={center} y1={center} x2={axisEnd.x} y2={axisEnd.y} stroke="#d8e8fb" strokeWidth="1" />
              <text x={label.x} y={label.y} fill="#64748b" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
                {item.label}
              </text>
            </g>
          );
        })}
        <polygon points={toPolyline(actualPoints)} fill="rgba(37,99,235,.18)" stroke="#2563eb" strokeWidth="2.2" />
        {actualPoints.map((point, index) => (
          <circle key={items[index].label} cx={point.x} cy={point.y} r="4.5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
        ))}
        <circle cx={center} cy={center} r="3.5" fill="#1e3a6e" />
      </svg>
    </div>
  );
}

export function BurndownChart({ labels, planned, actual }) {
  const width = 620;
  const height = 170;
  const padding = 24;
  const maxValue = Math.max(...planned, ...actual);

  function toPath(values) {
    return values.map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / (values.length - 1);
      const y = height - padding - (value / maxValue) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  }

  return (
    <div style={{ marginTop: 2 }}>
      <svg width="100%" height="170" viewBox={`0 0 ${width} ${height}`} fill="none" preserveAspectRatio="none">
        {[0, .25, .5, .75, 1].map(level => {
          const y = height - padding - level * (height - padding * 2);
          return <line key={level} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e8f1fd" strokeWidth="1" />;
        })}
        <path d={toPath(planned)} stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 6" />
        <path d={toPath(actual)} stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {actual.map((value, index) => {
          const x = padding + (index * (width - padding * 2)) / (actual.length - 1);
          const y = height - padding - (value / maxValue) * (height - padding * 2);
          return <circle key={labels[index]} cx={x} cy={y} r="4.5" fill="#2563eb" stroke="#fff" strokeWidth="2" />;
        })}
        {labels.map((label, index) => {
          const x = padding + (index * (width - padding * 2)) / (labels.length - 1);
          return <text key={label} x={x} y={height - 6} fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="middle">{label}</text>;
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
          <span style={{ width: 18, height: 3, borderRadius: 3, background: "#2563eb" }}></span>
          Фактическое снижение
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
          <span style={{ width: 18, height: 3, borderRadius: 3, background: "#93c5fd" }}></span>
          Плановая траектория
        </div>
      </div>
    </div>
  );
}
