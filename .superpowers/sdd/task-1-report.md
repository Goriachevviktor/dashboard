# Task 1 report: remove browser dependency visuals

## Status

Implemented with strict structural-test-first TDD. Browser dependency paths, endpoint bullets, legend/debug UI, neighbor highlighting, and visual-only utility exports/tests were removed. Dependency model, cycle prevention, scheduling, predecessor persistence, `handleLinkTasks`, and the `Связать` flow remain.

Print/PDF dependency rendering was preserved. Its local geometry/path functions and local endpoint flags were renamed so the browser structural markers are absent without changing print output behavior.

## RED evidence

Command:

```sh
cd frontend
node --test src/roadmapDependencyVisuals.test.js
```

Observed before production changes: exit 1, 0 pass / 1 fail. Expected assertion:

```text
AssertionError [ERR_ASSERTION]: legacy dependency visual remains: dependencyLines
```

## GREEN evidence

Command:

```sh
cd frontend
node --test src/roadmapDependencyVisuals.test.js src/utils/roadmapDependencies.test.js src/utils/timelineRowLayout.test.js
```

Observed: exit 0, 18 pass / 0 fail.

Command:

```sh
cd frontend
npx eslint src/roadmapDependencyVisuals.test.js src/sections/RoadmapsSection.jsx src/utils/roadmapDependencies.js src/utils/roadmapDependencies.test.js
```

Observed: exit 0 with no findings.

Additional review: `git diff --check` exited 0. Removed visual export names have no remaining references under `frontend/src`; required model exports and linking/scheduling code remain present.

## Concerns

None identified. Task 2 print/PDF visual removal was intentionally not performed.
