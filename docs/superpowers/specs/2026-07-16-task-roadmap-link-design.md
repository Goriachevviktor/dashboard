# Task to Roadmap Link Design

## Goal

Allow one ordinary dashboard task to appear as one linked item in one roadmap. The ordinary task remains the primary object, while the roadmap adds planning-only placement, lane, dependency, and timeline information.

## User Experience

When adding an item to a roadmap, the user chooses one of two actions:

- **New roadmap item** — keep the existing independent roadmap-item flow.
- **Link ordinary task** — open a searchable/selectable list of ordinary tasks that are not linked to any roadmap.

After selection, the roadmap item shows the ordinary task's title, responsible person, due date, and status. The ordinary task remains visible and editable in the Tasks section. A linked marker identifies the roadmap item and the ordinary task modal shows the roadmap title.

Only one roadmap item may link to a given ordinary task. Moving a task to a different roadmap requires unlinking it from the current roadmap first.

## Data Model

The existing roadmap bar object gains these optional fields:

```js
{
  linkedTaskId: 42,
  linkedTaskSnapshot: {
    title: "Подготовить отчёт",
    due: "2026-07-20",
    column: "В работе",
    ownerId: 7,
    assigneeId: 9
  }
}
```

`linkedTaskId` is the relationship. `linkedTaskSnapshot` preserves the last visible ordinary-task values if the ordinary task is later deleted. Existing roadmap items have neither field and continue to behave exactly as before.

The relationship is stored inside the existing roadmap payload through the existing roadmap persistence API. No new backend table or API endpoint is introduced in this version. Browser local storage remains only a legacy-import source and is not the active roadmap store.

## Source of Truth and Derived Values

While `linkedTaskId` resolves to an ordinary task, these roadmap values are derived from that task:

- `title` from `task.title`;
- `endDate` from `task.due` when a due date exists;
- `owner` from `task.assigneeId`, falling back to `task.ownerId`;
- roadmap status from the task column;
- progress from the task column.

Column mapping is explicit:

| Ordinary task column | Roadmap status | Progress |
|---|---|---:|
| `Беклог` | `planned` | 0% |
| `В работе` | `progress` | 50% |
| `Готов` | `done` | 100% |
| `Архив` | `done` | 100% |

The roadmap continues to own:

- item id;
- lane;
- `startDate`;
- predecessors and dependency layout;
- roadmap-only visual metadata.

## Synchronization

### Ordinary task to roadmap

Whenever the Tasks data passed to `RoadmapsSection` changes, linked bars are normalized from the current ordinary tasks before recalculation and rendering. The local snapshot is refreshed at the same time.

Changing title, due date, assignee, owner, or column in the Tasks section is therefore reflected the next time the shared dashboard bootstrap data refreshes or the Roadmaps section remounts.

### Roadmap to ordinary task

For a linked item, the roadmap edit modal permits changes to:

- due date (`endDate`);
- status/progress through the mapped ordinary-task column;
- roadmap-owned lane, start date, and dependencies.

Saving calls `api.patchTask(linkedTaskId, patch)` for ordinary-task-owned values, then saves the roadmap-owned fields through `api.patchRoadmap`. Dragging or resizing a linked bar updates the ordinary task due date to the resulting `endDate`; moving only the start edge changes only the roadmap `startDate`.

The inverse status mapping is:

- first, `done` or progress ≥100% → `Готов`;
- otherwise, `progress` or progress >0% → `В работе`;
- otherwise → `Беклог`.

If the task API update fails, the roadmap change is not committed and the existing global error presentation is used.

## Linking and Unlinking

The link picker excludes task ids found in any roadmap bar's `linkedTaskId`. This enforces one task to one roadmap within the current roadmap store.

Unlinking converts the bar into an independent roadmap item using the current resolved values. It clears `linkedTaskId` and `linkedTaskSnapshot`, preserves lane, dates, predecessors, title, owner, status, and progress, and does not modify or delete the ordinary task.

Deleting a linked roadmap item removes only the item and its dependencies. The ordinary task is unchanged.

If an ordinary task no longer exists, normalization converts the linked bar to an independent item using `linkedTaskSnapshot`; no roadmap item disappears automatically.

## Components and Data Flow

- `App.jsx` passes `dashboardData.tasks` into `RoadmapsSection`.
- After a linked roadmap transaction successfully writes both APIs, `RoadmapsSection` publishes the saved ordinary task through `onTaskUpdated`; `App.jsx` immutably replaces that task in `dashboardData.tasks`, so Tasks and Roadmaps use the same live values without a reload.
- `RoadmapsSection.jsx` owns link uniqueness, task lookup, normalization, API patching, unlinking, and persistence through the existing roadmap API.
- `BarFormModal` receives the ordinary-task lookup and exposes linked-task status plus unlinking.
- A focused utility module owns pure mapping, resolution, snapshot, uniqueness, and unlink helpers so the behavior can be unit tested without rendering the large roadmap component.
- `TasksSection` and `TaskDetailModal` receive optional roadmap link metadata to display the linked roadmap title; ordinary task editing remains unchanged.

## Failure and Compatibility Behavior

- Existing stored roadmaps require no migration.
- Invalid or duplicate `linkedTaskId` values are resolved deterministically: the first roadmap/bar in stored order keeps the link; later duplicates become independent bars from their snapshots.
- Missing due dates do not erase a roadmap bar's existing `endDate` until the user explicitly sets a task due date from the roadmap.
- API failure leaves both the local roadmap and ordinary task display unchanged.
- Corrupt snapshots are ignored and the existing bar fields are used.

## Testing

Unit tests cover:

- task-column/status/progress mapping in both directions;
- resolution of a linked bar from a current ordinary task;
- snapshot refresh;
- one-task/one-roadmap availability filtering;
- deterministic duplicate cleanup;
- unlink conversion;
- deleted ordinary-task fallback;
- preservation of roadmap-owned lane, start date, and predecessors.

Integration and regression verification covers:

- link an existing task from the roadmap modal;
- task title, status, due date, and assignee rendering;
- roadmap edit and drag patch the ordinary task;
- API failure does not commit the roadmap edit;
- unlink and delete do not delete the ordinary task;
- existing independent roadmap items still create, edit, drag, export, and persist;
- full frontend lint, unit tests, workbook verification, and production build.

## Out of Scope

- A dedicated relationship table or new relationship API.
- Linking one ordinary task to multiple roadmaps.
- Linking event, UCP, or development-plan tasks.
- Portfolio reporting or cross-roadmap critical path.
- Background real-time synchronization while another browser tab or device is open.
