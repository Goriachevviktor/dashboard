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
