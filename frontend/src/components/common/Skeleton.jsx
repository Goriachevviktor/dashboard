export function SkeletonLine({ width = "100%", height = 14, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: 6, ...style }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e2edf8", display: "flex", flexDirection: "column", gap: 10 }}>
      <SkeletonLine width="60%" height={16} />
      <SkeletonLine width="90%" height={12} />
      <SkeletonLine width="40%" height={12} />
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <SkeletonLine width={60} height={24} />
        <SkeletonLine width={80} height={24} />
      </div>
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
