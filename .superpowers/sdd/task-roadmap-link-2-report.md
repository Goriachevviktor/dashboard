# Task 2 report: roadmap linking and normalization UI

## Scope completed

- Passed ordinary tasks and the roadmap-link index callback through `App`.
- Normalized loaded roadmaps against current tasks before roadmap recalculation and published a link index whenever roadmap state changes.
- Added searchable ordinary-task linking UI, linked marker, locked task-owned title/owner controls, and unlink action.
- Added ordered linked writes for modal save and timeline drag/resize: task patch first, then roadmap patch with refreshed snapshot.
- Preserved independent roadmap behavior; linked deletion and unlinking only persist the roadmap.

## TDD evidence

### Component/domain contract

Added `a newly linked bar resolves immediately from its task`, then ran:

`cd frontend && node --test src/utils/taskRoadmapLinks.test.js`

Result: immediate PASS (5/5). This is the explicitly permitted Task 1 contract case: the existing domain implementation already populated title, due/end date, owner, status, and progress.

### Transaction orchestration RED

Added tests for ordered task/roadmap persistence and stopping after a failed task patch. Before implementation:

- 7 tests run
- 5 passed
- 2 failed
- Both failures reported `persistLinkedBarChange` as `undefined`, confirming the new behavior was absent.

### Transaction orchestration GREEN

Implemented `persistLinkedBarChange` minimally, then reran the focused domain suite:

- 7 tests run
- 7 passed
- 0 failed

## Final verification

- Focused tests: `node --test src/utils/taskRoadmapLinks.test.js src/sections/roadmapState.test.js` — 13/13 passed.
- Lint: `npx eslint src/App.jsx src/sections/RoadmapsSection.jsx src/utils/taskRoadmapLinks.js src/utils/taskRoadmapLinks.test.js` — exit 0, no errors.
- Production build: `npm run build` — exit 0; Vite transformed 202 modules. Existing bundle-size warning remains informational.
- Whitespace validation: `git diff --check` — exit 0.

## Self-review

- Linked save failures do not mutate local roadmap state because replacement occurs only after both API writes succeed.
- End-date changes map to task `due`; status/progress changes map to task `column`; start-only drag/resize skips task patching and persists the roadmap.
- Link creation resolves immediately from the task and stores a snapshot; duplicate/missing links remain governed by Task 1 normalization.
- Linked delete and unlink paths never call `deleteTask` or `patchTask`.
- Task-owned assignment is adapted from domain `ownerId` to the roadmap UI's existing `owner` field without changing independent bars.

## Concerns

- No component renderer harness exists in this frontend, so UI wiring was verified with lint/build and transactional behavior was extracted into tested pure orchestration as required.
- Vite reports the pre-existing large-chunk warning (main bundle above 500 kB); this task does not change chunking.

## Review fix pass

### Corrections

- Replaced the non-canonical `todo` / `active` link mapping with the existing roadmap vocabulary `planned` / `progress` / `done`, while retaining the ordinary-task columns `Беклог` / `В работе` / `Готов`.
- Added changed-roadmap detection during link normalization. Repaired snapshots, duplicate links, missing links, and legacy bar aliases are now written back through `patchRoadmap`; each failed repair is reported without failing the full load.
- Added immediate global uniqueness revalidation in the link handler.
- Added a tested single-flight runner and disabled modal actions while linking, preventing repeated clicks from issuing duplicate writes.
- Made the bar editor await persistence, remain open after failure, and close only when a save returns successfully.
- Canonicalized persisted roadmap bars to `lane` and `owner`. Legacy `laneId` / `ownerId` bar aliases are accepted only at normalization boundaries and removed from normalized output; task snapshots retain task-domain `ownerId` as task data.

### RED evidence

Canonical mapping and normalization tests initially produced 4 expected failures: backlog returned `todo`, in-progress returned `active`, linked bars returned `ownerId`, and changed-normalization reporting was absent.

After that cycle, uniqueness, single-flight, and repair-persistence contracts initially produced 3 expected failures because `canLinkTaskToRoadmaps`, `createSingleFlight`, and `persistRoadmapRepairs` did not exist.

The first single-flight implementation exposed an additional expected behavioral RED: work started on a microtask, so the immediate call-count assertion was `0 !== 1`. The runner was corrected to invoke the operation synchronously while sharing its promise.

### GREEN evidence

- Focused domain tests after implementation: 11/11 passed.
- Combined focused suite: 17/17 passed.
- Touched-file ESLint: exit 0, no errors.

### Review notes

- The normalization repair path deliberately persists each roadmap independently so one failed repair cannot prevent other roadmaps from being repaired or displayed.
- UI renderer infrastructure remains unavailable; async UI behavior is implemented with the tested single-flight primitive and verified additionally by lint and production build.

## Modal race re-review fix

- `BarFormModal` now routes save, unlink, and delete through one shared single-flight mutation guard.
- While a mutation is pending, a disabled fieldset blocks every editable control plus unlink, delete, cancel, and submit, preventing edit/close races.
- Unlink and delete now await their persistence callbacks and close only after a truthy saved-roadmap result. Failed writes leave the modal open and restore controls for retry.
- `handleUnlinkBar` and `handleDeleteBar` now return the saved roadmap or `null` consistently through `updateOpenRoadmap`.

TDD evidence: added a rejection/retry contract for the shared single-flight helper. It passed immediately because the previously corrected helper already cleared its guard on both resolve and reject; this test records the modal retry contract explicitly.

Verification:

- `node --test src/utils/taskRoadmapLinks.test.js src/sections/roadmapState.test.js` — 18/18 passed.
- `npx eslint src/sections/RoadmapsSection.jsx src/utils/taskRoadmapLinks.js src/utils/taskRoadmapLinks.test.js` — exit 0, no errors.
