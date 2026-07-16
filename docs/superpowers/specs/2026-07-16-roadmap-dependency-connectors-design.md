# Roadmap Dependency Connector Alignment

## Problem

Dependency paths can appear detached from the circular connectors on Gantt bars. When a predecessor ends immediately before its dependent task starts, the short path segment can also be hidden by a bar or connector.

## Approved behavior

- Keep the current blue/gray dotted orthogonal path and do not add arrows.
- Anchor the path to the center of the predecessor's right connector and the center of the dependent task's left connector.
- Render dependency paths above task bars but below the white circular connectors.
- Keep at least a 16 px horizontal shoulder between an anchor and the vertical segment. This shoulder must remain visible when the two anchor dates map to the same or adjacent timeline position.
- Preserve highlighted and inactive dependency colors.
- Use the measured dynamic row centers introduced by the dynamic-row-height work.
- Apply the same anchor and routing rules to browser and print/PDF output.

## Implementation boundary

The geometry helper will accept the visual connector offsets and return the complete orthogonal route. The browser and print renderers will consume the same route data. Task scheduling, dependency storage, drag behavior, bar sizing, and link creation are unchanged.

Layer order in the browser timeline:

1. grid and date guides;
2. task bars;
3. dependency paths;
4. circular dependency connectors and active interaction controls.

## Edge cases

- A target starts at the exact visual X coordinate where its predecessor ends.
- Source and target rows have different measured heights.
- The target is positioned to the left of the predecessor.
- A dependency crosses one or more intervening task rows.
- Print layout finishes after fonts or wrapped row heights change.

## Verification

- Add failing unit tests for connector offsets and a same-X/adjacent-date route with a 16 px visible shoulder.
- Run the focused dependency and row-layout tests.
- Run the full frontend test suite, ESLint, XLSX verification, and production build.
- In local dev, visually verify a normal dependency and an adjacent-date dependency at the roadmap's real rendered width.
- Verify print/PDF markup uses the same route and layer order.
