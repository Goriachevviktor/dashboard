# Task 4 report: regression verification and operator documentation

## Status

PARTIAL PASS: documentation and all automated regression/quality gates completed successfully. Browser smoke is BLOCKED because no controllable browser backend is available in this environment. No deployment was performed.

## Commit

- `9ab662ab2e69ed0ffec12941f1742eb9b3263a0a` — `docs: describe task roadmap synchronization`
- Committed files:
  - `docs/superpowers/specs/2026-07-16-task-roadmap-link-design.md`
  - `docs/TEST_DEV_ROADMAPS.md`
- Generated `frontend-dist` output was not committed; it is not tracked by repository policy and did not appear in `git status`.

## Documentation changes

- Corrected the approved canonical status mapping from stale `todo/active/done` to `planned/progress/done`.
- Corrected inverse mapping to `planned`/0% → `Беклог`, `progress`/1–99% → `В работе`, `done`/100% → `Готов`.
- Documented the final data flow: the ordinary task is authoritative; `linkedTaskId` and `linkedTaskSnapshot` live in the existing roadmap payload; one task can be linked once; task API writes precede roadmap API writes; unlink/delete never delete the ordinary task; missing tasks fall back to snapshots.
- Added exact local startup, health-check, browser-smoke, and automated regression commands to `docs/TEST_DEV_ROADMAPS.md`.
- Added the dated verification result and explicit browser-only blocker.

## Verification evidence

### Complete frontend tests

Command:

```bash
cd frontend && node --test $(find src -name '*.test.js' -print | sort)
```

Result: exit 0. Tests 32; pass 32; fail 0; skipped 0; cancelled 0; todo 0; suites 0.

### Lint

Command:

```bash
cd frontend && npm run lint
```

Result: exit 0. ESLint errors 0; warnings 0.

### XLSX verification

Command:

```bash
cd frontend && npm run verify:xlsx
```

Result: exit 0. `Workbook validation passed.` Sheets verified: `Timeline`, `Дорожки`, `Now-Next-Later`.

### Production build

Command:

```bash
cd frontend && npm run build
```

Result: exit 0. Vite 8.1.3 transformed 202 modules and completed in 442 ms. One non-fatal warning reported a minified chunk larger than 500 kB; main JS output was 1,771.49 kB (479.23 kB gzip).

### Local runtime health

Command:

```bash
curl -fsS -D - http://localhost:8080/api/health
```

Result: HTTP 200 with `{"status":"ok","version":"dev","environment":"local"}`. Docker reported `dashboard-api`, `dashboard-db`, and `dashboard-web` running; database healthy; web published on port 8080.

### Browser smoke

Result: BLOCKED (only this portion).

Exact evidence from the required in-app browser workflow:

- Selecting the browser for `http://localhost:8080/` returned `No browser is available`.
- Troubleshooting discovery returned an empty browser list: `[]`.

Consequently, authentication and the requested UI scenarios (link, field verification, roadmap-to-task edit, end-edge drag, unlink, relink/delete, refresh persistence, independent item create/edit/drag/export, and console-error inspection) were not executed and are not claimed as passing. The local service itself was independently confirmed healthy by HTTP 200.

## Concerns

- Browser smoke remains required in an environment with an available browser backend and safe test credentials.
- The Vite build succeeds but retains the pre-existing/non-blocking large-chunk warning; consider code splitting separately if bundle size becomes an acceptance criterion.
- No deploy, push, merge, or worktree cleanup was performed.
## Browser smoke fix: propagate linked task writes to App state

Browser smoke testing found that a successful linked roadmap edit updated the server task and roadmap but left `dashboardData.tasks` stale until reload. The roadmap transaction now accepts `onTaskUpdated(savedTask)` and invokes it only after both `patchTask` and `patchRoadmap` succeed. `App` immutably replaces the matching cached task, so navigating back to Tasks immediately shows the saved due date or column.

The callback is not invoked for start-only roadmap changes because those do not patch the ordinary task. It is also not invoked when either task or roadmap persistence fails, preserving local state on incomplete transactions. Modal saves and timeline drag/resize share this transaction path; roadmap return semantics remain unchanged for modal close behavior.

### TDD evidence

RED: the new successful-propagation test failed with `actual []` versus the expected saved task because `persistLinkedBarChange` had no callback contract.

GREEN: focused helper contracts now prove:

- the saved task is published only after successful roadmap persistence;
- start-only changes issue no task publication;
- failed linked transactions issue no task publication;
- the helper still returns the saved roadmap.

### Verification

- `node --test src/utils/taskRoadmapLinks.test.js src/sections/roadmapState.test.js` — 21/21 passed.
- `npx eslint src/App.jsx src/sections/RoadmapsSection.jsx src/utils/taskRoadmapLinks.js src/utils/taskRoadmapLinks.test.js` — exit 0, no errors.
- `npm run build` — exit 0; the existing large-chunk warning remains informational.

## Review follow-up: contain task publication failures

The completed API transaction is now independent from the optional UI publication callback. If `onTaskUpdated` throws after both writes succeed, `persistLinkedBarChange` still returns the saved roadmap, allowing the caller to update local roadmap state and close the modal normally.

`App` now uses the tested pure `replaceTaskById` helper. It creates a new task array, replaces IDs consistently across string/number representations, and preserves unrelated task object references.

### TDD and verification evidence

- RED: callback-throws regression rejected with `render callback failed`; the replacement-helper test failed because its module did not yet exist.
- GREEN: `node --test src/utils/taskRoadmapLinks.test.js src/utils/dashboardTasks.test.js src/sections/roadmapState.test.js` — 23/23 passed.
- Focused ESLint — exit 0, no errors or warnings.
- `npm run build` — exit 0; Vite transformed 203 modules. The existing large-chunk warning remains informational.

## Controller browser smoke update

The earlier `BLOCKED` browser entry above describes the first agent environment only and is superseded by this controller result.

### Confirmed manually

- Signed in through the in-app browser with a temporary local account.
- Created an ordinary task and a roadmap, then linked the task to the roadmap.
- Verified the linked title, owner, and status on the roadmap.
- Verified the roadmap badge in the ordinary-task modal.
- Changed status and due date from the roadmap modal; the roadmap displayed 50% progress.

### Defect found and fixed

The smoke pass exposed stale `App` task cache after the server task and roadmap had both been saved. Commit `f1137a8` (`fix: refresh tasks after linked roadmap edits`) adds post-transaction `onTaskUpdated` propagation into `dashboardData.tasks`. Its focused verification passed 21/21 tests, and reviewer approval was recorded.

The browser disconnected before a post-fix live retest, so the fix is automated-test verified but not manually reconfirmed in the browser.

### Still unverified manually

- end-edge drag and due-date propagation;
- unlink and ordinary-task retention;
- relink/delete and ordinary-task retention;
- refresh persistence;
- independent roadmap item create/edit/drag/export;
- final console-error inspection.

These scenarios remain unverified rather than failed. The temporary local user and all smoke-created data were cleaned up; the cleanup check returned zero remaining rows.
