# Mind Map: test and dev rollout

Use the same application commit in each target. Run the test target first, then dev.

## Update and build

```bash
git fetch origin
git checkout <mind-map-commit>
cd frontend
npm ci
npm run lint
node --test src/sections/mindMapState.test.js
npm run build
cd ../server
docker compose up -d --build
```

## Health check

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Manual acceptance check

1. Sign in as User A and open **Mind Map**. A new account must show an empty catalog, not sample maps.
2. Create a map, add a node, refresh the page, and sign in again. The map and node must remain.
3. Sign in as User B. User A's map must not be listed.
4. Delete User A's map, reload, and confirm the catalog is still empty.

Do not import `dashboard.mindmap.maps.v1` or `dashboard.mindmap.maps.v2` from browser storage. Server data is authoritative.
