# Roadmap Task Creation Date Default Design

## Goal

When a user creates a standalone task inside a roadmap in the dev environment, initialize both its start and end dates with the local calendar date on which the creation form was opened. Keep both fields editable.

## Scope

This change applies only to a new standalone roadmap bar created through `BarFormModal`.

It does not change:

- editing an existing roadmap bar;
- linking an ordinary dashboard task to a roadmap;
- ordinary task deadlines;
- event dates or event-task deadlines;
- roadmap milestone dates;
- UCP checkpoints;
- development-plan deadlines or checkpoints;
- normalization of legacy roadmap payloads that lack dates;
- existing records in dev, test, or production.

Implementation and validation occur in dev first. Test and production promotion require a later explicit decision.

## Date semantics

The default is the user's local browser calendar date at the moment the creation modal is opened.

The value is formatted as `YYYY-MM-DD` from local `getFullYear()`, `getMonth()`, and `getDate()` values. It must not use `toISOString().slice(0, 10)`, because UTC conversion can select the previous or following calendar day near midnight.

For a new standalone roadmap task:

- `startDate` defaults to the local creation date;
- `endDate` defaults to the same date;
- the user may change either field before saving;
- existing validation continues to reject an end date earlier than the start date.

For an existing task, saved `startDate` and `endDate` remain authoritative and must not be replaced with today's date.

## Architecture

Add a small pure date-default helper outside the large React section. The helper accepts an optional `Date` argument for deterministic tests and returns the local `YYYY-MM-DD` value.

`BarFormModal` computes the creation default once for a newly mounted modal and passes that same value to both date states. Existing `initBar` dates take precedence.

The legacy `monthValueToDate` fallback remains unchanged for payload normalization and historical compatibility, but it is no longer used as the default for a newly created standalone roadmap bar.

No backend or database change is required because the roadmap payload already stores explicit `startDate` and `endDate` values submitted by the form.

## Validation and testing

Automated tests cover:

- local formatting with zero-padded month and day;
- a timestamp whose UTC date differs from its local-calendar components, without relying on the machine timezone;
- new `BarFormModal` initialization uses one shared creation date for both fields;
- existing roadmap bars preserve their saved dates;
- legacy normalization remains unchanged;
- linked-task creation behavior remains unchanged;
- full frontend tests, ESLint, workbook verification, and production build remain green.

Dev browser smoke verifies that opening a new roadmap-task form shows today's local date in both fields, both remain editable, cancel creates nothing, and editing an existing task keeps its saved dates.
