# Roadmap Dependency Source Bridge Design

## Goal

Remove the visible gap between a predecessor task bar and its outgoing dependency line without changing the already-correct attachment to the dependent task.

## Visual behavior

- The route keeps its existing outgoing anchor 8 px to the right of the predecessor's actual rendered edge.
- A short dotted horizontal bridge runs from the predecessor's rendered right edge to that outgoing anchor.
- From the outgoing anchor onward, the existing vertical-first obstacle-aware route is unchanged.
- The incoming segment continues to terminate at the dependent task's rendered left edge exactly as it does now.
- The active outgoing port remains centered on the outgoing anchor. No permanent port or dot is added.

## Geometry and data flow

`computeDependencyRoute` will retain both source coordinates:

- `sourceAttachX`: the predecessor's actual rendered right edge;
- `startX`: the existing chart-clamped anchor at `sourceAttachX + 8 px`.

`dependencyPathData` will serialize the source bridge before the existing route commands:

`M sourceAttachX sourceY H startX V ... H targetX`

The bridge is a presentation segment adjacent to the source rectangle. It does not participate in obstacle search; the searched route still begins at `startX`, so obstacle avoidance and endpoint exemptions remain unchanged.

The same shared route serializer is used by the browser SVG and the PDF runtime, preserving parity.

## Scope constraints

- Do not change the target-side attachment or its final horizontal segment.
- Do not change dependency records, scheduling behavior, drag behavior, colors, dash styles, opacity, or active-edge styling.
- Do not reintroduce blocked routes; `blocked: true` remains non-renderable.

## Verification

- A unit test must fail before implementation because the path currently starts at `startX` instead of `sourceAttachX`.
- The expected path starts at the source edge, includes the 8 px horizontal bridge, and then preserves the existing vertical-first commands.
- Existing target-coordinate, obstacle-routing, blocked-route, browser-consumer, and print-runtime tests must remain green.
- Browser smoke verifies: zero visible source gap, unchanged target attachment, outgoing port still centered at `startX`, and route movement during drag.
