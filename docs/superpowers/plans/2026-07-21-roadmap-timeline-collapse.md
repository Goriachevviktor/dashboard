# Timeline Lane Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local UI controls that collapse and expand tasks per lane in the roadmap Timeline view.

**Architecture:** Keep collapse state inside `TimelineView` only. Derive visible lanes, bars, rows, dependencies, and drop zones from that state so hidden tasks do not render and hidden dependency lines do not float.

**Tech Stack:** React, existing roadmap state helpers, Node test runner, Vite build.

## Global Constraints

- Do not persist collapsed state to the backend or roadmap JSON.
- Preserve all roadmap data, dependency data, task order, lane order, drag behavior, and date behavior.
- In collapsed lanes, show the lane header row and hide task bars and dependency edges touching hidden tasks.
- Keep the interaction in the current dev branch only unless explicitly promoted later.

---

### Task 1: Timeline Collapse Behavior

**Files:**
- Modify: `frontend/src/roadmapVerticalReordering.test.js`
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: `TimelineView({ rm, members, onBarClick, onBarDrag, onMilestoneClick, onMilestoneDrag, linkMode, linkSourceId, onLinkTaskSelect, onReorder, reorderPending })`
- Produces: Local `collapsedLaneIds` state inside `TimelineView`, visible `timelineRows`, visible `dependencyEdges`, and per-lane toggle buttons.

- [ ] **Step 1: Write failing tests**

Add source-level tests that require `collapsedLaneIds`, visible bar filtering, dependency filtering by visible IDs, and toggle buttons with `aria-expanded`.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd frontend && node --test src/roadmapVerticalReordering.test.js`
Expected: FAIL before implementation because collapse symbols are absent.

- [ ] **Step 3: Implement minimal UI behavior**

In `TimelineView`, add `useState(() => new Set())`, `toggleLaneCollapsed(laneId)`, visible row/bar derivation, dependency filtering, and one button in each lane header.

- [ ] **Step 4: Run focused tests**

Run: `cd frontend && node --test src/roadmapVerticalReordering.test.js`
Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `cd frontend && node --test $(find src -name '*.test.js' -print | sort)`
Run: `cd frontend && npm run lint`
Run: `cd frontend && npm run build`
Run: `git diff --check`
Expected: all pass, allowing only existing Vite chunk-size warning.
