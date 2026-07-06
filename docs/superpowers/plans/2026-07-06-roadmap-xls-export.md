# Roadmap XLS Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add XLS export for a roadmap so one file contains three visual sheets: Timeline, Swimlanes, and Now-Next-Later.

**Architecture:** Build an Excel-compatible workbook as a generated string from roadmap data, without adding a heavy spreadsheet dependency. Keep rendering logic in a dedicated helper module so the workbook generator can be validated separately from the React screen wiring.

**Tech Stack:** React, Vite, plain workbook-string generation, browser Blob download, node-based verification script.

## Global Constraints

- Real local target is `http://localhost:8080` via `frontend-dist`, not Vite dev.
- Validation commands are `npx eslint src/sections/RoadmapsSection.jsx` and `npm run build` from `frontend/`.
- XLS export must include three sheets in one file: `Timeline`, `Дорожки`, `Now-Next-Later`.
- Visual export should stay close to the current roadmap UI using colors, grouped blocks, month headers, and lane/task structure.

---

### Task 1: Extract workbook generator

**Files:**
- Create: `frontend/src/utils/roadmapWorkbook.js`
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: roadmap object with `timeline`, `lanes`, `bars`, `milestones`, and member registry array.
- Produces: `buildRoadmapWorkbookXls(roadmap, members)` returning workbook text.

- [ ] Add helper module with pure builders for workbook sheets.
- [ ] Keep sheet builders separate for `Timeline`, `Swimlanes`, and `NNL`.
- [ ] Wire the helper into `RoadmapsSection.jsx` without changing existing CSV/PDF behavior.

### Task 2: Add a lightweight verification script

**Files:**
- Create: `frontend/scripts/verify-roadmap-xls.mjs`
- Modify: `frontend/src/utils/roadmapWorkbook.js`

**Interfaces:**
- Consumes: `buildRoadmapWorkbookXls(roadmap, members)`.
- Produces: process exit 0 when workbook contains required sheet names and roadmap content.

- [ ] Write a script that builds a workbook from a sample roadmap payload.
- [ ] Make the script fail if required worksheets or key labels are missing.
- [ ] Run the script before and after implementation as the regression check.

### Task 3: Add the UI export action

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: `buildRoadmapWorkbookXls(roadmap, members)`, `downloadTextFile(...)`.
- Produces: `XLS` button in the roadmap detail header.

- [ ] Add `onExportXls` to `RoadmapDetail`.
- [ ] Add `XLS` button next to `PDF`, `CSV`, `Экспорт JSON`.
- [ ] Hook it to download `${safe-name}.xls` with Excel MIME type.

### Task 4: Verify end-to-end

**Files:**
- Modify: none required unless fixes are needed.

**Interfaces:**
- Consumes: browser UI on `http://127.0.0.1:8080`.
- Produces: working XLS export opened from roadmap detail.

- [ ] Run workbook verification script.
- [ ] Run `npx eslint src/sections/RoadmapsSection.jsx`.
- [ ] Run `npm run build`.
- [ ] Check export from the live roadmap UI and confirm all three sheets are present.
