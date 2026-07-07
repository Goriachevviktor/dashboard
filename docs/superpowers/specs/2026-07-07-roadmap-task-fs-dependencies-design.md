# Roadmap Task FS Dependencies Design

Date: 2026-07-07
Scope: `frontend/src/sections/RoadmapsSection.jsx`
Status: Draft for user review

## Goal

Add task-to-task dependencies inside a single roadmap so that:

- roadmap tasks can reference predecessor tasks;
- only `Finish-to-Start` (`FS`) dependencies are supported in v1;
- dependency links are visible on the `Timeline` view;
- users can create links both from the task edit modal and from a quick link mode on the timeline;
- changing predecessor dates automatically shifts dependent tasks to the right;
- task statuses are not blocked by dependencies.

This design is limited to the Roadmaps section and does not introduce cross-roadmap links.

## Non-Goals

- No `SS`, `FF`, or `SF` dependency types in v1.
- No dependencies between different roadmaps.
- No status gating such as blocking `In progress` or `Done`.
- No drag-to-connect lines directly from one task bar to another.
- No dependency lines in `Дорожки` or `Now · Next · Later`.

## User Experience

### 1. Task Edit Modal

The task edit modal gains a new `Предшественники` block.

Behavior:

- show selected predecessor tasks as removable chips or rows;
- allow adding a predecessor from tasks in the current roadmap;
- exclude the current task itself from the list;
- disable tasks that would create a cycle;
- prevent duplicate predecessor links;
- show incoming and outgoing dependency summaries in text form when useful.

This modal remains the primary, precise editing surface for dependencies.

### 2. Timeline Quick Link Mode

The roadmap detail toolbar gains a `Связать` button on the timeline screen.

Behavior:

- clicking `Связать` enters dependency creation mode;
- first click selects the predecessor task;
- second click selects the dependent task;
- the system creates a `predecessor -> dependent` `FS` link;
- pressing `Esc`, re-clicking the toolbar button, or finishing the link exits the mode;
- invalid selections are ignored and explained inline if needed.

This mode is the fast workflow for bulk linking without opening modals.

### 3. Timeline Visualization

Dependencies are visible only in `Timeline`.

Behavior:

- draw a stepped line from the right edge of the predecessor bar to the left edge of the dependent bar;
- place an arrow marker near the dependent side;
- keep the line neutral by default so it does not overpower roadmap bars;
- on hover or selection, emphasize the active task and all directly related dependency lines;
- show a small indicator on tasks that participate in dependencies.

The intent is readability first, not diagram-editor density.

## Data Model

Each roadmap task (`bar`) must have a stable task identifier and predecessor list:

```js
{
  id: "bar-api-v3",
  lane: "platform",
  title: "API v3",
  startDate: "2026-05-01",
  endDate: "2026-08-16",
  status: "progress",
  progress: 30,
  owner: "user-1",
  memberIds: ["user-2"],
  predecessors: ["bar-redesign-dashboard"]
}
```

Rules:

- `id` must be stable inside the roadmap;
- `predecessors` contains only task ids from the same roadmap;
- `predecessors` is the only stored dependency field;
- `successors` are derived at runtime from `predecessors`;
- `predecessors` defaults to `[]`.

## Validation Rules

The dependency graph must reject:

- self-reference: `A -> A`;
- duplicate links;
- references to tasks outside the roadmap;
- cyclic chains such as `A -> B -> C -> A`.

Cycle detection must run:

- when saving the task modal;
- when creating a quick link from timeline mode;
- when importing or migrating old roadmap data if malformed links appear.

## Scheduling Rules

Only `FS` is supported:

- if `B` depends on `A`, then `B.startDate >= nextDay(A.endDate)`.

Auto-shift rules:

- when a predecessor moves right or gets extended, all dependents shift right automatically;
- the shift propagates transitively through the chain: `A -> B -> C`;
- dependent task duration is preserved;
- if a task has several predecessors, the earliest allowed start is based on the latest predecessor finish:
  - `max(nextDay(endDate of each predecessor))`.

Status rules:

- status changes remain editable regardless of dependencies;
- dependencies affect schedule recalculation only.

## Recalculation Algorithm

Roadmap recalculation should gain a dedicated dependency pass after direct task edits.

Suggested flow:

1. Normalize bars:
   - ensure each bar has `id`;
   - ensure each bar has `predecessors`.
2. Build graph structures:
   - `taskById`
   - `successorsById`
   - topological order
3. For each edited task or changed dependency:
   - traverse successors in topological order;
   - compute the minimum legal start from predecessor end dates;
   - if current start is earlier than allowed, shift the whole task window right;
   - keep task duration unchanged.
4. Return the updated roadmap through the existing `recalc(...)` pipeline.

The recalculation must be deterministic so repeated saves produce the same result.

## Component-Level Changes

### `BarModal`

Add:

- predecessor selection UI;
- removal controls for existing predecessors;
- local validation feedback for duplicates and cycles.

Save payload must include:

- `id`
- `predecessors`

### `TimelineView`

Add:

- dependency overlay layer for lines and arrows;
- quick link mode state;
- selected source task state for linking;
- hover highlighting for related tasks and links.

Must coexist safely with existing:

- task drag;
- task resize;
- double-click to edit task;
- milestone drag.

### Roadmap Save Handlers

`handleSaveBar` and related roadmap update paths should:

- preserve stable ids;
- preserve predecessor arrays;
- re-run dependency recalculation after direct date edits and dependency edits.

### Migration Helpers

Existing sample and stored roadmaps need a migration pass that:

- adds `id` to every task missing one;
- adds `predecessors: []` when absent;
- sanitizes malformed predecessor arrays.

## Technical Constraints

- Keep the implementation inside existing roadmap patterns where possible.
- Avoid introducing a second source of truth for task relations.
- Do not let dependency mode interfere with normal drag/resize mode.
- Keep export/import compatibility by including `id` and `predecessors` in exported roadmap JSON and derived exports where appropriate.

## Error Handling

When a dependency action is invalid:

- do not save partial graph changes;
- keep the current modal or timeline mode active;
- show concise inline feedback:
  - cycle detected;
  - task already linked;
  - invalid target.

No blocking browser alerts should be introduced.

## Testing Strategy

### Logic

Cover with focused tests where feasible:

- cycle detection;
- duplicate rejection;
- single-chain auto-shift;
- multi-predecessor auto-shift;
- duration preservation after cascade.

### UI / Manual Verification

Verify:

- create dependency from modal;
- create dependency from `Связать` mode on timeline;
- double click still opens task edit modal;
- drag and resize still work;
- changing predecessor dates shifts dependents;
- multiple predecessors use the latest predecessor finish;
- invalid cycle creation is blocked;
- dependency lines render in the correct positions after scroll and rerender.

## Risks

- visual clutter with many dependency lines;
- interaction conflicts between linking mode and task drag/resize;
- incorrect cascade order if graph processing is not topological;
- regressions in export/import if task ids are unstable.

## Delivery Plan

1. Add task id and predecessor migration helpers.
2. Add dependency graph validation and recalculation utilities.
3. Extend task modal with predecessor editing.
4. Add timeline quick link mode.
5. Add dependency line rendering and highlighting.
6. Verify manual interactions and roadmap recalculation behavior.

## Open Decisions Resolved In This Design

- Dependency type for v1: `FS` only.
- Scope: same roadmap only.
- Scheduling policy: automatic right-shift cascade.
- Status policy: no blocking.
- UX: task modal + timeline quick link mode.
- Visualization: dependency lines on timeline plus textual dependency editing in modal.
