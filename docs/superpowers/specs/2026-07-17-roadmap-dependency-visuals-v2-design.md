# Roadmap Dependency Visuals V2

## Goal

Reintroduce task dependency visualization as a quiet, readable layer that does not compete with Gantt bars on dense roadmaps.

## Visual language

- Use orthogonal routes from the predecessor's right edge to the dependent task's left edge.
- Render every dependency as a dotted line with rounded caps and joins.
- Default connections use a thin neutral stroke at low opacity.
- Connections belonging to the active task use a slightly stronger neutral stroke; do not introduce a separate decorative color.
- Show small circular ports only on the active chain. Inactive connections have no visible ports.
- Bars, labels, milestones, and the today line remain visually dominant.
- Do not add a permanent dependency legend or debug block to the production timeline.

## Interaction states

- Hovering a task temporarily activates its incoming and outgoing dependency chain.
- Selecting a source task in `Связать` mode activates that task's chain and ports.
- Moving or resizing an active or connected task updates attached routes continuously from the same preview percentages used by the bar.
- When hover/selection ends, routes return to their quiet state; dependency data is unchanged.
- The SVG overlay never intercepts pointer events.

## Geometry

- Calculate X coordinates from the measured rendered chart width, never only from the minimum chart width.
- Calculate Y coordinates from measured dynamic row centers.
- Start at the visual center of the predecessor's right port and end at the target's left port.
- Use a minimum 16 px horizontal shoulder from both endpoints to the vertical segment.
- Prefer the dependency direction; near chart boundaries, use the opposite in-chart elbow when it preserves both shoulders.
- For live drag/resize, incoming routes use `previewLeft`; outgoing routes use `previewLeft + previewWidth`.
- Route computation is pure and independent of DOM measurement.

## Layering

1. calendar grid and guides;
2. task bars;
3. dependency lines;
4. active ports and task interaction controls.

All dependency lines use `pointer-events: none`. Ports are visual-only and also do not capture input.

## Print/PDF

- Print all dependencies as the quiet dotted style without active ports.
- Use measured print row centers and rendered print chart width.
- Preserve font readiness, dynamic row measurement, timeout fallback, print invocation, and iframe cleanup.

## Preserve

- Existing `predecessors` data and database schema.
- `Связать`, cycle prevention, scheduling, persistence, import/export, drag/resize, dynamic rows, milestones, and roadmap privacy.
- The current one-task-to-one-roadmap behavior.

## Verification

- Unit-test normal, reverse, adjacent-date, left/right boundary, unequal-row, and full-width routes.
- Unit-test move, resize-start, resize-end, unrelated-task, and cancel preview anchors.
- Unit-test active versus quiet presentation state without relying on a large DOM snapshot.
- Browser-smoke a dense roadmap at narrow and wide widths, including live drag and resize.
- Verify print markup contains dotted paths without ports.
- Run the complete frontend tests, ESLint, XLSX verification, and production build.
