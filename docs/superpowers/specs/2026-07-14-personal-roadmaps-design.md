# Personal Roadmaps Design

## Goal

Roadmaps must be the same for a signed-in user in every browser. The server, not browser storage, is the source of truth. Demonstration roadmaps must not reappear after deletion.

## Storage and Access

Add a `roadmaps` PostgreSQL table with a text roadmap ID, `owner_id`, JSONB payload, and timestamps. All roadmap endpoints use the authenticated user and only return or modify rows owned by that user. Administrators do not receive another user's private roadmap list.

## API

Provide `GET`, `POST`, `PATCH`, and `DELETE` routes under `/roadmaps`. Add a protected bulk-import route for legacy browser data. Imports insert only missing roadmap IDs, so a stale browser cannot overwrite newer server changes.

## Client Migration

On load, the frontend fetches `/roadmaps`. It may read the legacy `dashboard_roadmaps_v1` key only to import old user-created maps once. Known sample IDs are excluded. After the import attempt, the UI reloads from the API and no longer saves or renders from `localStorage`.

## Failure Handling

The page shows a loading or error state while maps are fetched. A failed migration leaves the browser data intact so retrying later cannot lose it. Normal create, edit, and delete operations update the server first and update the UI with the response.

## Verification

Server tests cover ownership, CRUD, duplicate-safe import, and payload validation. Frontend tests cover filtering legacy samples and normalizing API data. A production check confirms the current user's existing roadmaps migrate once and appear from a second browser.
