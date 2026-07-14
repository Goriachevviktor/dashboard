# Personal Roadmaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each user's roadmaps on the server so every browser shows the same private set of roadmaps and removed samples never return.

**Architecture:** Add an owner-scoped `roadmaps` JSONB table and FastAPI CRUD/import routes, following `mind_maps`. Replace the roadmap section's browser-storage state with API state, retaining browser storage only for a duplicate-safe legacy import that excludes known samples.

**Tech Stack:** React 19, Vite, FastAPI, psycopg/PostgreSQL JSONB, Python unittest, Node test runner.

## Global Constraints

- Roadmaps are visible and mutable only by their `owner_id`, including for administrators.
- `SAMPLE_ROADMAPS` must never be returned, seeded, or imported.
- Legacy import must use `INSERT ... ON CONFLICT DO NOTHING` so stale browser data cannot overwrite the server.
- Existing browser data remains untouched when import fails.
- All roadmap edits persist through the API before the UI is updated.

---

### Task 1: Server Roadmap Persistence

**Files:**
- Create: `server/api/app/roadmaps.py`
- Create: `server/api/tests/test_roadmaps.py`
- Modify: `server/api/app/db.py:211-225,444-445`
- Modify: `server/api/app/main.py:21,49`

**Interfaces:**
- Produces: `GET /roadmaps`, `POST /roadmaps`, `PATCH /roadmaps/{roadmap_id}`, `DELETE /roadmaps/{roadmap_id}`, `POST /roadmaps/import`.
- Produces: `clean_roadmap_payload(payload, partial=False)` and `get_owned_roadmap(conn, roadmap_id, user)`.

- [ ] **Step 1: Write failing API behavior tests**

```python
def test_list_queries_only_current_users_roadmaps(self):
    result = roadmaps.list_roadmaps({"id": 42, "role": "member"})
    self.assertEqual((42,), connection.calls[0][1])
    self.assertIn("WHERE owner_id = %s", connection.calls[0][0])

def test_foreign_roadmap_is_forbidden_even_for_admin(self):
    with self.assertRaises(HTTPException) as error:
        roadmaps.get_owned_roadmap(connection, "rm-17", {"id": 7, "role": "admin"})
    self.assertEqual(403, error.exception.status_code)

def test_payload_requires_id_title_and_object_collections(self):
    with self.assertRaises(HTTPException):
        roadmaps.clean_roadmap_payload({"id": "", "title": "Карта"})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `PYTHONPATH=server/api python3 -m unittest server/api/tests/test_roadmaps.py -v`  
Expected: FAIL because `app.roadmaps` does not exist.

- [ ] **Step 3: Implement the schema and route module**

```python
CREATE TABLE IF NOT EXISTS roadmaps (
  id text PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

Use `Jsonb(values)` for the payload. Require a non-empty `id`, `title`, list `lanes`, list `bars`, and list `milestones`. Implement import with `ON CONFLICT (id) DO NOTHING`; return the current owner's inserted/existing rows only. Register the router in `main.py`.

- [ ] **Step 4: Run the focused server test**

Run: `PYTHONPATH=server/api python3 -m unittest server/api/tests/test_roadmaps.py -v`  
Expected: PASS for list ownership, foreign access rejection, validation, and duplicate-safe import.

- [ ] **Step 5: Commit the server persistence layer**

```bash
git add server/api/app/roadmaps.py server/api/app/db.py server/api/app/main.py server/api/tests/test_roadmaps.py
git commit -m "feat: persist personal roadmaps"
```

### Task 2: Client API and Legacy Migration Helpers

**Files:**
- Create: `frontend/src/sections/roadmapState.js`
- Create: `frontend/src/sections/roadmapState.test.js`
- Modify: `frontend/src/api.js:47-50`

**Interfaces:**
- Produces: `normalizeRoadmaps(maps, recalc)`, `legacyUserRoadmaps(raw, sampleIds, recalc)`.
- Produces: `listRoadmaps`, `createRoadmap`, `patchRoadmap`, `deleteRoadmap`, and `importRoadmaps` API methods.

- [ ] **Step 1: Write failing client migration tests**

```javascript
test('legacy migration excludes known sample ids', () => {
  const maps = legacyUserRoadmaps(JSON.stringify([
    { id: 'rm-ai-initiatives-2026', title: 'Sample' },
    { id: 'rm-personal', title: 'Personal', lanes: [], bars: [], milestones: [] },
  ]), new Set(['rm-ai-initiatives-2026']), value => value);
  assert.deepEqual(maps.map(map => map.id), ['rm-personal']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/sections/roadmapState.test.js`  
Expected: FAIL because `roadmapState.js` does not exist.

- [ ] **Step 3: Implement the narrow helper and API calls**

```javascript
export function legacyUserRoadmaps(raw, sampleIds, normalize) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(map => map?.id && !sampleIds.has(map.id)).map(normalize)
      : [];
  } catch {
    return [];
  }
}
```

Add the five API methods under the existing Mind Map methods in `api.js`. Do not persist new state to `localStorage`.

- [ ] **Step 4: Run the focused client test**

Run: `node --test frontend/src/sections/roadmapState.test.js`  
Expected: PASS and sample IDs are absent from the import list.

- [ ] **Step 5: Commit the migration boundary**

```bash
git add frontend/src/api.js frontend/src/sections/roadmapState.js frontend/src/sections/roadmapState.test.js
git commit -m "feat: add roadmap api migration helpers"
```

### Task 3: Replace Browser State with Server State

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx:2578-2618,3119-3269`

**Interfaces:**
- Consumes: `api.listRoadmaps`, `api.importRoadmaps`, `api.createRoadmap`, `api.patchRoadmap`, `api.deleteRoadmap`.
- Consumes: `normalizeRoadmaps` and `legacyUserRoadmaps`.
- Produces: a roadmap catalog and detail view that reload from the server after mutations.

- [ ] **Step 1: Add a failing state test for API-shaped data**

```javascript
test('normalizes API roadmaps without browser sample fallback', () => {
  const maps = normalizeRoadmaps([
    { id: 'rm-server', title: 'Server map', lanes: [], bars: [], milestones: [] },
  ], value => ({ ...value, normalized: true }));
  assert.deepEqual(maps, [{ id: 'rm-server', title: 'Server map', lanes: [], bars: [], milestones: [], normalized: true }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/sections/roadmapState.test.js`  
Expected: FAIL because `normalizeRoadmaps` is not exported.

- [ ] **Step 3: Implement API-first React state**

Initialize `roadmaps` as `[]` and add `loading`/`loadError` state. On mount:

```javascript
const serverRoadmaps = await api.listRoadmaps();
const legacy = legacyUserRoadmaps(localStorage.getItem(LS_KEY), SAMPLE_ID_SET, recalc);
if (legacy.length) await api.importRoadmaps(legacy);
setRoadmaps(normalizeRoadmaps(await api.listRoadmaps(), recalc));
```

Remove `mergeRoadmapsWithSamples`, `seedAutoAddedRoadmaps`, `loadRoadmaps`, and the effect that writes `LS_KEY`. Replace each `setRoadmaps` mutation with an async API mutation that receives or refetches the changed roadmap. Keep optimistic UI only after a successful API response. Use `onError` where available or render a concise error/retry state.

- [ ] **Step 4: Run client tests, lint, and build**

Run: `node --test frontend/src/sections/mindMapState.test.js frontend/src/sections/roadmapState.test.js && cd frontend && npm run lint && npm run build`  
Expected: all tests pass, ESLint exits 0, and Vite produces `frontend/dist`.

- [ ] **Step 5: Commit the API-first UI**

```bash
git add frontend/src/sections/RoadmapsSection.jsx frontend/src/sections/roadmapState.js frontend/src/sections/roadmapState.test.js
git commit -m "feat: sync roadmaps across browsers"
```

### Task 4: Deploy and Verify Production

**Files:**
- Modify: `/root/Project/dashboad/dashboard` deployment checkout

**Interfaces:**
- Consumes: production Docker Compose services and `https://dashboard.138.16.178.245.sslip.io/`.
- Produces: a migrated personal roadmap list available to the same account in separate browsers.

- [ ] **Step 1: Create an on-server backup**

Run: `tar -C /root/Project/dashboad -czf /root/Project/dashboad/dashboard/backups/personal-roadmaps-$(date +%Y%m%d-%H%M%S).tgz dashboard`

- [ ] **Step 2: Deploy backend and frontend build**

Copy the reviewed source changes while preserving unrelated server work, rebuild `dashboard-api`, and install the Vite assets into `frontend-dist` according to the existing deployment layout.

- [ ] **Step 3: Verify the server and API**

Run: `curl -kfsS https://dashboard.138.16.178.245.sslip.io/api/health`  
Expected: `{"status":"ok"}`.

Run focused API tests in the API container or server environment. Open Roadmaps in the browser containing the current user's legacy data, confirm it migrates, then open the same account in a second browser and confirm the same cards appear. Delete one test card and refresh both browsers to confirm it remains deleted.

- [ ] **Step 4: Record production rollout guidance**

Add a concise test/dev rollout note beside `docs/TEST_DEV_MINDMAPS.md` with table migration, API route, browser legacy-import behavior, and verification commands.

- [ ] **Step 5: Commit deployment guidance**

```bash
git add docs/TEST_DEV_ROADMAPS.md
git commit -m "docs: add roadmap rollout guide"
```
