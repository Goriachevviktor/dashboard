# Roadmap Milestone Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow milestones in the roadmap timeline to be dragged with the left mouse button and saved on release.

**Architecture:** Extend the existing `TimelineView` milestone rendering with pointer-based drag state. Keep normal click-to-edit behavior for short clicks, and only persist a new milestone date after the pointer is released and the drag threshold was exceeded.

**Tech Stack:** React, Vite, existing roadmap timeline helpers, pointer events.

## Global Constraints

- Drag applies only to roadmap milestones in `Timeline`.
- Milestone position moves freely while dragging and rounds to the nearest day only on pointer release.
- Short click must keep opening the existing milestone edit modal.
- Validation loop is `npx eslint src/sections/RoadmapsSection.jsx` and `npm run build` from `frontend/`.

---

### Task 1: Add timeline drag state and date conversion

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: `TimelineView({ rm, members, onBarClick, onMilestoneClick })`, `percentFromTimelineDate(...)`, `parseIsoDate(...)`, `toIsoDate(...)`.
- Produces: `TimelineView({ rm, members, onBarClick, onMilestoneClick, onMilestoneDrag })`.

- [ ] Add local pointer drag state for milestones.
- [ ] Compute temporary `left%` during drag without mutating roadmap data.
- [ ] Convert final dropped position into a rounded ISO date on pointer release.

### Task 2: Preserve click-to-edit and persist drag result

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

**Interfaces:**
- Consumes: milestone modal state setters and existing roadmap save handlers.
- Produces: drag persistence path that reuses existing milestone update flow.

- [ ] Add a small movement threshold so click still opens edit modal.
- [ ] Persist dragged milestone date through the existing save/update path.
- [ ] Prevent drag from moving outside the roadmap timeline bounds.

### Task 3: Verify behavior

**Files:**
- Modify: none required unless fixes are needed.

**Interfaces:**
- Consumes: built UI on `http://localhost:8080`.
- Produces: verified drag behavior for milestones.

- [ ] Run `npx eslint src/sections/RoadmapsSection.jsx`.
- [ ] Run `npm run build`.
- [ ] Verify in the live UI that dragging changes milestone date and click still opens edit.
