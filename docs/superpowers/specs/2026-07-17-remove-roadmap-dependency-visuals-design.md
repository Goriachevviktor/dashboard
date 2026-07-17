# Remove Roadmap Dependency Visuals

## Goal

Remove the current roadmap dependency visualization so it can be redesigned from scratch later, while preserving dependency data and behavior.

## Remove

- Browser SVG dependency paths.
- Incoming and outgoing circular connector bullets on Gantt bars.
- Dependency path and connector rendering from print/PDF output.
- The dependency item in the timeline legend.
- The temporary `Debug связей` display.
- Visual-only geometry, width-measurement, drag-preview, layer, path-serialization helpers, constants, hooks, and tests that become unused after removal.
- Documentation checklist items that describe the removed visual implementation.

## Preserve

- `predecessors` in roadmap payloads and all existing database data.
- Dependency normalization, validation, cycle prevention, and scheduling.
- The `Связать` action and source/target selection workflow.
- Automatic date shifting based on predecessors.
- Dependency import/export fields unless they are purely visual.
- Task drag, resize, persistence, dynamic row heights, milestones, and unrelated roadmap behavior.

## Compatibility

No migration or data rewrite is performed. Existing dependencies remain stored and continue affecting scheduling. Opening and saving a roadmap must not erase predecessor IDs.

## Verification

- Add a structural regression proving the timeline and print output no longer contain dependency SVG paths, connector bullets, the dependency legend, or debug display.
- Keep and run dependency model/scheduling tests to prove dependencies remain functional.
- Run the complete frontend tests, ESLint, XLSX verification, and production build.
- In local dev, verify there are no lines or bullets, while `Связать` still creates a predecessor relationship and schedule recalculation still occurs.
