# Roadmap Dependency Drag Preview

## Problem

During task drag or resize, a Gantt bar and its circular dependency connectors use `barDrag.previewLeft` and `barDrag.previewWidth`, but dependency paths continue to use the task's persisted start and end dates. The connectors move while the paths remain at their old coordinates until the interaction finishes.

## Approved behavior

- Every dependency attached to the active task follows its connector continuously during move and resize.
- Incoming paths use the active task's preview left anchor.
- Outgoing paths use the active task's preview right anchor (`previewLeft + previewWidth`).
- Unrelated dependency paths remain unchanged.
- Persisted dates and dependency data are not mutated during preview.
- On pointer cancel, paths return to persisted anchors; on pointer release, existing save behavior supplies the final dates.
- Existing connector offsets, minimum 16 px shoulders, boundary-aware elbows, measured row centers, and layer ordering remain unchanged.
- Print/PDF is unchanged because drag preview exists only in the interactive browser timeline.

## Architecture

Add a pure helper that resolves a task's start and end percentages from its persisted dates and an optional active preview. `TimelineView` will use the resolved percentages when calculating dependency geometry. The existing `GanttBar` receives the same preview state, so bars, bullets, and paths share one source of transient X geometry.

## Verification

- Unit-test persisted fallback, task move, resize-start, and resize-end preview anchors.
- Unit-test that an active predecessor changes only an outgoing path start and an active target changes only an incoming path end.
- Verify the tests fail before production code and pass afterward.
- Run the complete frontend tests, ESLint, XLSX verification, and production build.
- In local dev, visually drag and resize both ends of a connected task and confirm the line stays attached throughout the interaction.
