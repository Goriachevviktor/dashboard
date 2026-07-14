# Dashboard Backend

Self-hosted backend and web container for the Dashboard PWA.

CI/CD setup, environment promotion, rollback, and database recovery are documented in [`docs/operations/ci-cd-environments.md`](../docs/operations/ci-cd-environments.md).

Daily production backups, retention, monitoring, and isolated restore drills are documented in [`docs/operations/backup-and-restore.md`](../docs/operations/backup-and-restore.md).

## Stack

- `dashboard-db`: PostgreSQL 16 with seed data.
- `dashboard-api`: FastAPI on port `8000` inside Docker.
- `dashboard-web`: Caddy on port `80`, serves `dashboard.html` and proxies `/api/*`.
- PWA assets are served from the same web root:
  - `/manifest.webmanifest`
  - `/service-worker.js`
  - `/pwa-icon.svg`
  - `/pwa-maskable-icon.svg`
  - `/pwa-icon-192.png`, `/pwa-icon-512.png`
  - `/pwa-maskable-icon-192.png`, `/pwa-maskable-icon-512.png`
- Public access is expected through Nginx Proxy Manager:
  - `dashboard.goryachevviktor.crazedns.ru -> dashboard-web:80`
  - HTTPS is terminated by NPM.
  - NPM Basic Auth is disabled; access is protected by app login.

## Run

```bash
cd /home/viktor/Документы/Project/dashdoard/server
docker compose up -d --build
docker compose ps
```

After backend changes:

```bash
cd /home/viktor/Документы/Project/dashdoard/server
docker compose up -d --build dashboard-api
```

After `server/Caddyfile` changes:

```bash
cd /home/viktor/Документы/Project/dashdoard/server
docker compose restart dashboard-web
```

## Auth

Public auth endpoints:

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/invites/{token}`
- `POST /api/auth/register`

Dashboard endpoints require user auth:

```text
Authorization: Bearer <accessToken>
```

The frontend stores the short-lived access token in memory. The refresh token is stored as an HttpOnly Secure cookie. `DASHBOARD_API_TOKEN` is kept as an emergency service token and is not exposed in `dashboard-config.js`.

First admin is bootstrapped from compose env:

- `DASHBOARD_ADMIN_EMAIL`
- `DASHBOARD_ADMIN_PASSWORD`
- `DASHBOARD_ADMIN_NAME`

Invite registration:

- admin opens the `Пользователи` section;
- creates an invite for colleague email and role;
- colleague opens `/dashboard.html?invite=<token>`;
- colleague sets display name/password and receives a session.

Current local config is in `../dashboard-config.js`; template is in `../dashboard-config.example.js`.

## PWA

The web dashboard is installable as a Progressive Web App. The former iOS/Xcode client has been removed; the PWA is now the mobile app path.

- `manifest.webmanifest` defines standalone mode, app colors and icons.
- `service-worker.js` currently runs in rescue/no-cache mode: it does not intercept `fetch`, deletes old `dashboard-pwa-*` caches and lets the app always load fresh HTML.
- The service worker handles `push` and `notificationclick` events.
- `/api/*` requests are intentionally not cached.
- The top bar shows online/offline status, an install button when available, and a push enable button.
- Mobile PWA mode includes iPhone safe-area handling, compact top bar, bottom tab navigation and mobile-first layouts for the main sections.

On iPhone, web push works only for the installed PWA launched from the Home Screen, not from a normal Safari tab.

## Main Endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/users` admin only
- `GET/POST /api/auth/invites` admin only
- `GET /api/auth/invites/{token}`
- `POST /api/auth/register`
- `GET /api/bootstrap`
- `GET/POST/PATCH/DELETE /api/tasks`
- `GET/POST/PATCH/DELETE /api/events`
- `GET/POST/PATCH/DELETE /api/events/{event_id}/tasks`
- `GET/POST/PATCH/DELETE /api/sync-stickers`
- `GET/POST/PATCH/DELETE /api/ucp/tasks`
- `GET/POST/PATCH/DELETE /api/development-tasks`
- `GET/POST/PATCH/DELETE /api/ambp-topics`
- `GET /api/push/vapid-public-key`
- `POST /api/push/subscriptions`
- `DELETE /api/push/subscriptions`
- `POST /api/push/test`

## Payload Notes

UCP checkpoints include evidence materials:

```json
{
  "label": "Проверка результата",
  "date": "2026-05-12",
  "evidenceMaterials": "Ссылка на отчет, акт, скриншоты или файл"
}
```

Development plan tasks:

```json
{
  "title": "Наименование задачи",
  "description": "Описание задачи",
  "resultImage": "Образ результата",
  "successMetric": "Метрика успеха",
  "due": "2026-05-20",
  "status": "Свободный комментарий по текущему статусу"
}
```

AMBP topics:

```json
{
  "title": "Импортозамещение ЕСФМ",
  "description": "Описание темы бизнес-плана",
  "planRevenue": 45.0,
  "factRevenue": 1.2,
  "funnelLeads": 18,
  "funnelQualified": 11,
  "funnelProposals": 5,
  "funnelContracts": 1,
  "comment": "Комментарий по активности"
}
```

Push subscription:

```json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

## Secrets

Current compose file contains real deployment secrets. Before using git or sharing the project, move these values into an untracked `.env` file:

- `POSTGRES_PASSWORD`
- `DASHBOARD_API_TOKEN`
- `DASHBOARD_JWT_SECRET`
- `DASHBOARD_ADMIN_PASSWORD`
- `DASHBOARD_VAPID_PUBLIC_KEY`

`server/api/app/vapid_private.pem` is required for push notifications and must not be committed.

## Nginx Proxy Manager

Proxy host:

- Domain: `dashboard.goryachevviktor.crazedns.ru`
- Forward: `http://dashboard-web:80`
- Force SSL: enabled
- HTTP/2: enabled
- Access List: disabled (`access_list_id=0`)
- Block common exploits: enabled
- WebSocket support: enabled

Current state:

- `http://dashboard.goryachevviktor.crazedns.ru` redirects to HTTPS.
- `https://dashboard.goryachevviktor.crazedns.ru` returns the app without NPM Basic Auth.
- `/api/bootstrap` returns `401` without app session.
- `/api/auth/login` returns access token plus HttpOnly Secure refresh cookie.
