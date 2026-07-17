import { dependencyPathData } from '../utils/roadmapDependencyVisuals.js';

export function RoadmapDependencyPort({ side, left, width }) {
  const portLeft = side === 'incoming'
    ? `calc(${left}% - 4px)`
    : `calc(${left + width}% - 8px)`;

  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: portLeft,
        top: '50%',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#fff',
        border: '1px solid rgba(71, 85, 105, .7)',
        boxSizing: 'border-box',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}

export default function RoadmapDependencyOverlay({ width, height, edges }) {
  if (!width || !height || !edges.length) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height, overflow: "visible", pointerEvents: "none", zIndex: 4 }}
    >
      {edges.map(({ id, route, presentation }) => (
        <path
          key={id}
          d={dependencyPathData(route)}
          fill="none"
          stroke="currentColor"
          strokeWidth={presentation.strokeWidth}
          opacity={presentation.opacity}
          strokeDasharray={presentation.dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
