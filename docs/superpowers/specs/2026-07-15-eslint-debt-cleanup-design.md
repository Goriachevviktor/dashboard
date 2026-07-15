# ESLint Debt Cleanup Design

## Goal

Reduce the existing frontend ESLint baseline from 52 errors and 17 warnings to zero without changing user-visible behavior, API contracts, stored data, or business rules. Once the baseline is clean, make the complete frontend lint command a required CI gate instead of linting only changed files.

## Current State

- `cd frontend && npx eslint src` reports 69 problems: 52 errors and 17 warnings.
- CI builds the frontend, runs unit tests, audits production dependencies, and lints only selected changed frontend files.
- The remaining findings include unused values, React Hooks correctness and dependency findings, render-time component creation, and large components whose local definitions make the rules harder to satisfy safely.

## Scope

### Included

- Remove every ESLint error and warning under `frontend/src`.
- Preserve current rendering, interaction, data flow, API requests, and persisted payload shapes.
- Replace render-time component definitions with module-level components or ordinary JSX helpers with explicit inputs.
- Stabilize Hook inputs and callbacks where required by the rules.
- Remove unused imports, variables, state, and dead local helpers only when they have no observable effect.
- Run the full frontend lint command in CI after the baseline reaches zero.
- Keep each review unit small and independently verifiable.

### Excluded

- New product features or visual redesign.
- Backend or database behavior changes.
- Broad component architecture redesign beyond extraction required to satisfy lint safely.
- Disabling ESLint rules globally or adding blanket `eslint-disable` comments.
- Opportunistic formatting or unrelated refactoring.

## Approach

Work by rule category rather than attempting one large rewrite:

1. **Mechanical cleanup:** unused imports, variables, state, and straightforward warnings.
2. **Hook correctness:** state initialization, effect dependencies, memoization, and callback stability.
3. **Static component boundaries:** move components created during render to module scope and pass all dependencies explicitly.
4. **CI enforcement:** replace changed-file linting with the full `npm run lint` gate.

Each category is delivered as a separate pull request when it produces a coherent reviewable change. A category may be split further if a component requires substantial extraction.

## Behavioral Safety

- Existing unit tests and production build must remain green after every category.
- Hook fixes must address the underlying unstable value or stale closure; dependency arrays must not be silenced to make lint pass.
- Extracted components receive explicit props for every value formerly captured from render scope.
- Removing a value requires confirming that it is not referenced by rendering, effects, callbacks, subscriptions, or persistence.
- No `eslint-disable` is introduced without a narrow rule name, a concise technical justification, and a dedicated review decision.

## Verification

Every pull request must run:

```bash
cd frontend
npm run lint
npm test
npm run build
```

The final acceptance criteria are:

- ESLint exits 0 with zero errors and zero warnings.
- Frontend unit tests pass.
- Production frontend build passes.
- Existing backend, Caddy, compose-build, and release-contract CI jobs remain green.
- CI runs `npm run lint` across the full frontend instead of a changed-file subset.
- No user-visible behavior or API contract changes are introduced.

## Delivery Sequence

1. Mechanical unused-code cleanup.
2. React Hooks correctness and stable dependencies.
3. Render-time component extraction.
4. Full lint CI gate and final regression verification.

This sequence keeps low-risk changes separate from closure-sensitive Hook work and structural component extraction, making regressions easier to identify and review.
