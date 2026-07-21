# Roadmap Vertical Reordering Design

## Goal

Allow users to reorder roadmap lanes and tasks interactively, including moving tasks between lanes, while preserving the existing horizontal date drag. The same roadmap must also support drag-and-drop ordering in the Swimlanes and Now · Next · Later views.

## Scope

The feature applies to one roadmap at a time and covers:

- vertical lane reordering in Timeline;
- vertical task reordering inside a lane in Timeline;
- moving a Timeline task to another lane;
- horizontal lane-column reordering in Swimlanes;
- vertical task reordering and cross-lane movement in Swimlanes;
- vertical task reordering and cross-column movement in Now · Next · Later;
- live dependency-line updates while Timeline rows are previewed;
- persistence, rollback, print, and export consistency.

The feature does not change task dates during a vertical reorder, does not change an ordinary linked task, and does not add a database migration or a drag-and-drop dependency.

## Existing Behavior

`RoadmapsSection.jsx` currently derives Timeline rows by iterating `rm.lanes` and then filtering `rm.bars` in their stored array order. The Timeline Gantt bar already supports pointer-based horizontal movement and edge resizing. Swimlanes uses the same lane and bar arrays but does not support reordering. Now · Next · Later is derived automatically from status and dates and has no persistent manual category or ordering.

Roadmaps are stored as JSON through the existing roadmap API. Adding fields to bar JSON requires no backend or database schema change.

## Canonical Ordering Model

The three ordering concerns remain independent:

1. `rm.lanes` is the canonical lane order for Timeline, Swimlanes, print, CSV, and XLSX.
2. `rm.bars` is the canonical task order within lanes for Timeline, Swimlanes, print, CSV, and XLSX. Tasks are grouped by `bar.lane`; their relative order is the order in `rm.bars`.
3. `bar.planningBucket` and `bar.planningRank` are the manual Now · Next · Later category and order.

`planningBucket` is either `"now"`, `"next"`, `"later"`, or absent. `planningRank` is a non-negative integer or absent. A manual NNL reorder updates only these planning fields and never changes status, progress, start date, or end date.

Existing bars without planning fields continue to use the current automatic grouping rules. When a user first reorders a source or target NNL column, the visible non-completed items in each affected column receive explicit `planningBucket` and contiguous `planningRank` values. This freezes the order the user saw before applying the requested move. Completed tasks remain excluded from NNL.

Malformed planning values are ignored. Duplicate or sparse ranks are normalized deterministically from the visible array order when a manual move is applied.

## Pure Ordering Operations

Ordering logic must live outside the React section in a focused utility module. It provides immutable operations for:

- moving a lane before or after another lane while retaining every lane exactly once;
- moving a bar to an insertion point inside the same lane;
- moving a bar to another lane and updating `bar.lane`;
- resolving automatic and explicit NNL groups;
- moving an NNL bar within or between planning buckets;
- returning the input unchanged for invalid source IDs, target IDs, lane IDs, or no-op moves.

Bar identity is based on the stable roadmap task `id`, never an array index. Lane identity is based on lane `id`. Existing dependencies, linked-task fields, dates, owners, and status values must be preserved byte-for-byte by reorder operations.

## Pointer Interaction

### Timeline tasks

The whole Gantt block remains the task drag target. A pointer session starts on pointer-down and waits until movement reaches 6 CSS pixels. The dominant axis is then locked for the remainder of the gesture:

- horizontal dominance selects the existing date-move behavior;
- vertical dominance selects task reordering;
- edge resize handles always select their current resize mode and never enter reorder mode.

A movement that never reaches the threshold remains a click and opens the edit modal. Direction does not switch after it is locked. Link-creation mode disables all date and reorder drag behavior.

### Timeline lanes

The lane header row is draggable. Moving it vertically reorders the whole lane as one unit; every task remains assigned to that lane. Task rows are not lane drag handles.

### Swimlanes

Lane columns are draggable horizontally from their headers. Task cards are draggable vertically and can cross into another lane column. A short click still opens the edit modal.

### Now · Next · Later

Task cards are draggable vertically inside a planning column and across all three columns. Empty columns remain valid drop targets.

### Cancellation and scrolling

`Escape`, `pointercancel`, unmount, or loss of a valid target cancels the preview without persistence. Pointer capture or window-level listeners ensure the session completes if the pointer leaves the card. Dragging near a scrollable container edge triggers bounded auto-scroll. All drag listeners and animation frames are removed on completion or cancellation.

## Visual Feedback

The dragged task or lane receives a raised, semi-transparent preview. A blue insertion line marks the exact destination. Cross-container moves also tint the target lane or planning column. The original position retains a placeholder so row height does not collapse.

Timeline preview ordering is used as the input to row layout and dependency routing. Therefore Gantt blocks and their dependency paths move together during vertical drag. Date geometry is unchanged in reorder mode.

Cursor states use `grab` before drag and `grabbing` after activation. Reorder mode suppresses hover-only controls that could compete with the gesture.

## React Boundaries

`RoadmapsSection.jsx` remains the composition layer but must not own the pure reorder algorithms. Two focused modules are introduced:

- `frontend/src/utils/roadmapOrdering.js` for immutable ordering and NNL grouping;
- `frontend/src/utils/roadmapDragIntent.js` for the 6 px activation threshold, axis lock, insertion targeting, and edge auto-scroll calculation.

Timeline, Swimlanes, and NNL keep view-local pointer state because their geometry differs, but they consume the same pure operations and emit one common `onReorder(nextRoadmap)` callback. Small view components may be extracted from `RoadmapsSection.jsx` if required to keep pointer effects isolated; unrelated roadmap code must not be refactored.

## Preview and Persistence Flow

1. Pointer-down records the source identity, pointer origin, and the immutable pre-drag roadmap.
2. After activation and axis lock, pointer moves resolve a target container and insertion index.
3. A pure ordering operation builds a preview roadmap.
4. The active view renders the preview; no API request is made during pointer movement.
5. Pointer-up with a changed order calls `onReorder(nextRoadmap)` exactly once.
6. The top-level section immediately installs the optimistic roadmap and locks further reorder operations for that roadmap.
7. One existing `PATCH /roadmaps/:id` request persists the complete roadmap JSON.
8. Success replaces the optimistic value with the normalized server response.
9. Failure restores the pre-drop roadmap and reports the error through the existing `onError` path.

A reorder of a linked roadmap bar patches only the roadmap JSON. It must not call the ordinary-task patch flow because lane, display order, and planning category are roadmap-owned fields.

## Derived Views, Print, and Export

Timeline and Swimlanes consume the same lane and bar order. Timeline print must use the same row construction. CSV and XLSX must iterate lanes and bars in canonical order.

The browser NNL view and workbook NNL sheet must share the same explicit-planning-first grouping rules. Legacy JSON exports preserve all new planning fields automatically. Manual NNL order must survive reload and must not affect Timeline or Swimlanes order.

## Error and Concurrency Rules

Only one reorder persistence request may be active for a roadmap. A new reorder cannot begin until the current request resolves. Other existing edit actions retain their current behavior.

Invalid or missing drag targets cancel safely. A server failure restores the exact pre-drop roadmap, including lane order, bar order, lane assignments, and planning fields. The existing global error presentation communicates failure; no new notification subsystem is introduced.

## Accessibility

This iteration supports pointer and touch interaction through Pointer Events. Drag targets expose descriptive titles or ARIA labels and active state through `aria-grabbed`. Drop targets expose their active state visually and through an accessible description. Full keyboard reordering is outside this iteration; existing click-to-edit behavior remains available.

## Testing Strategy

### Unit tests

Pure tests cover:

- lane reorder forward, backward, no-op, and invalid IDs;
- task reorder at first, middle, and last positions;
- task movement between non-empty and empty lanes;
- preservation of task fields and dependencies;
- independence of roadmap order and NNL order;
- legacy automatic NNL grouping;
- explicit planning category and stable rank normalization;
- movement between all NNL bucket pairs;
- 6 px threshold, dominant-axis lock, and non-switching intent;
- insertion targeting and bounded auto-scroll calculations.

### Component/source-contract tests

Tests confirm that:

- resize handles cannot initiate reorder;
- link mode disables drag;
- each drop emits one reorder callback;
- cancellation emits none;
- optimistic failure restores the previous roadmap;
- Timeline row layout and dependency rectangles consume the preview roadmap;
- browser and workbook NNL use the shared grouping helper;
- print and export follow canonical ordering.

### Browser smoke tests

On a roadmap with multiple lanes and dependencies:

- reorder two lanes in Timeline;
- reorder a task inside a lane;
- move a task to another lane without changing dates;
- confirm dependency lines follow the task during preview;
- resize and horizontally move a task to confirm regression safety;
- reorder lane columns and cards in Swimlanes;
- move cards within and across every NNL column, including an empty target;
- reload and confirm all three independent orders persist;
- simulate a failed PATCH and confirm rollback;
- confirm no console errors.

## Delivery Constraints

Implementation begins in the isolated dev branch `codex/roadmap-vertical-reordering`. No push, pull request, test deployment, or production deployment occurs until dev implementation, review, and browser validation are complete and the user explicitly approves promotion.
