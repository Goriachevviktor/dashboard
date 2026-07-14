# Actions and Frontend Dependency Maintenance Design

## Goal

Remove GitHub Actions Node.js 20 deprecation warnings and eliminate the two moderate frontend audit findings without regressing roadmap XLSX export or environment promotion.

## GitHub Actions

All workflow references to `actions/checkout@v4` become `actions/checkout@v6`. References to `actions/setup-node@v4` become `actions/setup-node@v6`. Deployment workflows replace `webfactory/ssh-agent@v0.9.0` with `webfactory/ssh-agent@v0.10.0`.

These versions use the Node.js 24 action runtime. The project uses GitHub-hosted `ubuntu-latest` runners, so no self-hosted runner compatibility work is required. Existing workflow inputs, permissions, caching, SHA validation, environment gates, and deployment behavior remain unchanged.

Workflow contract tests will require the new versions and reject the old versions. `actionlint` and real pull-request CI remain acceptance gates.

## Frontend dependency remediation

The audit findings form one chain: direct dependency `exceljs@4.4.0` includes a vulnerable `uuid` version below `11.1.1`. Downgrading ExcelJS to the npm audit suggestion is explicitly rejected because it is a breaking downgrade and may regress the existing workbook implementation.

Add an npm root-level `overrides` entry that resolves `uuid` to exactly `11.1.1`. Keep `exceljs` at its current compatible release. Regenerate `package-lock.json` through npm rather than editing the lockfile manually.

The override is accepted only if:

- `npm ls uuid` shows the intended resolved version without invalid peers;
- `npm audit` reports zero vulnerabilities;
- all frontend unit tests pass;
- the existing roadmap workbook verification script generates a valid XLSX workbook and reads its required sheets successfully;
- the production frontend build succeeds.

If ExcelJS is incompatible with `uuid@11.1.1`, do not weaken the audit gate or downgrade ExcelJS automatically. Stop and reassess replacement or a maintained fork as a separate design.

## Delivery

Changes are delivered through a pull request. All five required CI checks must pass. After merge, the exact `main` SHA must deploy automatically to test and return through public health. Production promotion uses the existing manual approval workflow, creates its backup, and must expose the same SHA.

## Acceptance criteria

- No workflow references the Node.js 20 action versions being replaced.
- GitHub runs no longer emit Node.js 20 warnings for checkout, setup-node, or ssh-agent.
- `npm audit` reports zero known vulnerabilities.
- XLSX export verification, frontend tests, build, actionlint, and complete CI pass.
- Test and production health responses identify the same promoted SHA.
