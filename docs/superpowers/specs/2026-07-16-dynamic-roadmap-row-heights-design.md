# Dynamic Roadmap Row Heights Design

## Goal

Keep roadmap labels, Gantt bars, dependency lines, milestones, grid backgrounds, and the Today line vertically aligned when task or lane names wrap onto multiple lines.

## Root Cause

The timeline currently calculates every task row as `54px` and every lane row as `40px`. Gantt bars, dependency geometry, SVG height, and background rows use those constants. The label column uses `min-height` for task labels, so long text can make the left row taller while the right side and all calculated offsets remain fixed. Every following row then drifts out of alignment.

## Chosen Behavior

- Task rows have a minimum height of `54px` and expand to show the complete task title.
- Lane rows have a minimum height of `40px` and expand to show the complete lane name.
- No line clamp or maximum row height is applied.
- The Gantt bar remains vertically centered in its actual row.
- Resizing the viewport or changing text recalculates row geometry automatically.
- Large roadmaps remain vertically scrollable inside the existing timeline viewport.

## Layout Architecture

The timeline body renders each logical row as one shared CSS-grid row with two cells:

1. a sticky label cell with the task or lane text;
2. a chart cell for the corresponding Gantt background and bar.

Both cells participate in the same grid row, so browser layout gives them one shared height. The label is the natural source of extra height and the chart cell stretches with it. Existing minimum heights remain as density floors.

The left column remains `340px`, sticky during horizontal scrolling. The chart column retains its current minimum width derived from the number of timeline months.

## Measured Geometry

Each rendered logical row has a stable key:

- lane: `lane:<laneId>`;
- task: `task:<barId>`.

A focused hook observes the timeline body and row elements with `ResizeObserver`. It publishes an ordered layout array:

```js
[
  { key: "lane:structure", type: "lane", top: 0, height: 40 },
  { key: "task:bar-1", type: "bar", top: 40, height: 70, taskId: "bar-1" }
]
```

The hook batches observer notifications through one animation frame and updates React state only when the ordered `top` and `height` values actually change. It disconnects the observer and cancels a pending animation frame on cleanup.

Before the first measurement, the timeline uses the existing `40px` and `54px` minimums. This avoids an empty or collapsed first render.

## Geometry Consumers

All vertical geometry uses the measured layout rather than fixed row multiplication:

- dependency-line start and end Y coordinates use the measured center of each task row;
- the dependency SVG height uses the measured body height;
- bar cells use the actual grid-row height and center the `30px` bar;
- lane and task background cells stretch to the shared row height;
- milestone guides and the Today line span the measured body height;
- drag and resize remain horizontal operations and keep their existing date calculations.

The pure dependency geometry function accepts explicit source and target centers (or explicit row top and height pairs) so it remains unit-testable without a browser.

## Print and PDF

The generated print timeline uses the same two-cell CSS-grid row structure. Task and lane labels determine row height and their chart cells stretch in the same row. Gantt bars are vertically centered inside their row cells.

Print dependency geometry is calculated in the print document after fonts and layout are ready, using actual row element rectangles. The print action waits for this layout pass before invoking `print()`. If measurement is unavailable, the document falls back to the existing minimum row heights rather than omitting content.

CSV, JSON, and XLSX exports are unchanged because they do not depend on visual row coordinates.

## Compatibility

- Roadmap payloads and API contracts do not change.
- Task linking, drag/resize, dependency editing, milestones, filters, and roadmap persistence keep their current behavior.
- Existing short labels continue to render at `54px` for tasks and `40px` for lanes.
- The change applies to independent and ordinary-task-linked roadmap items equally.

## Failure Handling

- If `ResizeObserver` is unavailable, use a one-time layout measurement after render and on window resize.
- Invalid or missing row elements fall back to their minimum height.
- Measurement errors must not block roadmap interaction or persistence.
- Observer callbacks never write roadmap data; layout is presentation-only state.

## Testing

Unit tests cover:

- ordered dynamic row-layout normalization;
- fallback minimum heights;
- dependency centers for unequal row heights;
- unchanged geometry for standard `40px`/`54px` rows;
- stable equality detection that prevents observer update loops.

Integration and visual verification cover:

- multiple long task names in one lane;
- a long multi-line lane name;
- short and long rows mixed together;
- dependency lines between rows of different heights;
- milestones and Today line across the full measured height;
- horizontal and vertical scrolling;
- drag, resize, edit, link, and unlink behavior;
- print/PDF alignment;
- narrow and wide viewport widths;
- the copied roadmap `Первые 100 дней ЦАЗС` in dev.

Full frontend tests, ESLint, XLSX verification, and production build remain required.

## Out of Scope

- Truncating or line-clamping roadmap titles.
- Virtualizing large timelines.
- Changing horizontal timeline scale or zoom.
- Redesigning the roadmap header, legend, catalog, or non-timeline tabs.
- Changing roadmap data or backend persistence.
