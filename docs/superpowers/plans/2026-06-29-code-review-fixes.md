# Code Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить все критические и важные проблемы безопасности, корректности и производительности, выявленные при code review.

**Architecture:** Правки вносятся по приоритету: сначала security (данные уже скомпрометированы), затем баги с потерей данных, затем performance и качество кода. Каждый таск — атомарный коммит.

**Tech Stack:** FastAPI + psycopg + PostgreSQL 16 (backend), React 19 + Vite 8 (frontend), Docker Compose + Caddy 2

---

## Фазы

- **Фаза 1 (Критические):** Безопасность и баги с потерей данных — Tasks 1–7
- **Фаза 2 (Важные):** Безопасность, валидация, quality — Tasks 8–13
- **Фаза 3 (Производительность):** Connection pool, индексы, кэш — Tasks 14–18
- **Фаза 4 (Минорные):** UX, cleanup — Tasks 19–20

---

## Фаза 1: Критические проблемы

---

### Task 1: Ротация секретов и безопасное хранение VAPID-ключа

**Files:**
- Modify: `server/.env`
- Modify: `server/docker-compose.yml`
- Modify: `server/api/app/config.py`
- Move: `server/api/app/vapid_private.pem` → вне репозитория
- Create: `server/.gitignore` (проверить/обновить)

**Контекст:** `vapid_private.pem` зафиксирован в git-истории и запекается в Docker-образ. Секреты в `.env` тоже были в ранних коммитах.

- [ ] **Шаг 1: Проверить, что именно в git-истории**

```bash
git log --all --full-history -- server/api/app/vapid_private.pem
git log --all --full-history -- server/.env
```

Ожидается: хотя бы один коммит для каждого файла.

- [ ] **Шаг 2: Сгенерировать новый VAPID-ключ**

```bash
cd server
pip install py-vapid 2>/dev/null || true
python3 -c "
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
v.save_key('/tmp/new_vapid_private.pem')
print('PUBLIC KEY:', v.public_key.public_bytes(
    __import__('cryptography.hazmat.primitives.serialization', fromlist=['Encoding','PublicFormat']).Encoding.X962,
    __import__('cryptography.hazmat.primitives.serialization', fromlist=['Encoding','PublicFormat']).PublicFormat.UncompressedPoint
).hex()
)
"
```

Или через docker:
```bash
docker run --rm python:3.12-slim bash -c "pip -q install py-vapid && python3 -c \"
from py_vapid import Vapid
import base64, cryptography.hazmat.primitives.serialization as s
v = Vapid(); v.generate_keys()
priv = v.private_key.private_bytes(s.Encoding.PEM, s.PrivateFormat.TraditionalOpenSSL, s.NoEncryption()).decode()
pub = base64.urlsafe_b64encode(v.public_key.public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint)).decode()
print('PRIVATE:\\n', priv)
print('PUBLIC:', pub)
\""
```

- [ ] **Шаг 3: Обновить `.env` с новыми секретами**

Сгенерировать новые значения:
```bash
# Новый JWT secret (32 байта)
python3 -c "import secrets; print(secrets.token_hex(32))"

# Новый API token
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Новый пароль БД
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

Обновить `server/.env` (не коммитить):
```
POSTGRES_PASSWORD=<новый_пароль_БД>
POSTGRES_DB=dashboard
POSTGRES_USER=dashboard
DATABASE_URL=postgresql://dashboard:<новый_пароль_БД>@dashboard-db:5432/dashboard

DASHBOARD_JWT_SECRET=<новый_jwt_secret>
DASHBOARD_API_TOKEN=<новый_api_token>
DASHBOARD_ADMIN_PASSWORD=<новый_admin_password>

DASHBOARD_VAPID_PUBLIC_KEY=<новый_vapid_public_key>
DASHBOARD_VAPID_CLAIMS_SUB=mailto:teplinkiy@gmail.com
VAPID_PRIVATE_KEY_FILE=/run/secrets/vapid_private_key
```

- [ ] **Шаг 4: Сохранить новый VAPID приватный ключ вне репозитория**

```bash
# Скопировать на сервер напрямую, не через git
cp /tmp/new_vapid_private.pem /path/on/server/vapid_private.pem
chmod 600 /path/on/server/vapid_private.pem
```

- [ ] **Шаг 5: Убедиться, что vapid_private.pem в .gitignore**

Открыть `server/.gitignore` (или создать если нет) и добавить:
```
api/app/vapid_private.pem
.env
*.pem
```

- [ ] **Шаг 6: Удалить vapid_private.pem из репозитория (если он там есть)**

```bash
git rm --cached server/api/app/vapid_private.pem 2>/dev/null || true
git rm server/api/app/vapid_private.pem 2>/dev/null || true
```

- [ ] **Шаг 7: Обновить `docker-compose.yml` — монтировать VAPID-ключ как volume, не копировать в образ**

В `server/docker-compose.yml` найти секцию `dashboard-api` и добавить volume-mount:
```yaml
  dashboard-api:
    volumes:
      - /path/on/server/vapid_private.pem:/run/secrets/vapid_private_key:ro
```

- [ ] **Шаг 8: Коммит**

```bash
git add server/.gitignore server/docker-compose.yml
git commit -m "security: rotate secrets, remove vapid key from repo"
```

---

### Task 2: Устранить timing attack на API-токен

**Files:**
- Modify: `server/api/app/auth.py:148,156`

**Контекст:** Сравнение `x_dashboard_token == API_TOKEN` и `token == API_TOKEN` через `==` уязвимо к атакам по времени. Нужно `secrets.compare_digest`.

- [ ] **Шаг 1: Проверить текущее состояние**

```bash
grep -n "API_TOKEN" server/api/app/auth.py
```

Ожидается строки вида: `if API_TOKEN and x_dashboard_token == API_TOKEN:` и `if API_TOKEN and token == API_TOKEN:`

- [ ] **Шаг 2: Обновить `require_auth` в `server/api/app/auth.py`**

Найти функцию `require_auth` (~строка 143) и заменить оба сравнения:

```python
def require_auth(
    authorization: str | None = Header(default=None),
    x_dashboard_token: str | None = Header(default=None, alias="X-Dashboard-Token"),
) -> dict[str, Any]:
    if API_TOKEN and x_dashboard_token and secrets.compare_digest(x_dashboard_token, API_TOKEN):
        return {"id": 0, "email": "system", "display_name": "System", "role": "admin", "is_active": True}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ").strip()
    if API_TOKEN and secrets.compare_digest(token, API_TOKEN):
        return {"id": 0, "email": "system", "display_name": "System", "role": "admin", "is_active": True}

    ensure_auth_config()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid session")

    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE id = %s AND is_active = true",
            (int(payload["sub"]),),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User is inactive")
        record_user_activity(conn, user)
        return user
```

`secrets` уже импортирован в файле (строка 1).

- [ ] **Шаг 3: Проверить вручную**

```bash
# Запустить сервер и проверить что авторизация работает
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"wrong"}' | python3 -m json.tool
# Ожидается: 401 или 403
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/auth.py
git commit -m "security: use secrets.compare_digest for API token comparison"
```

---

### Task 3: Устранить двойной вызов `require_auth`

**Files:**
- Modify: `server/api/app/tasks.py`
- Modify: `server/api/app/events.py`
- Modify: `server/api/app/main.py`
- Modify: `server/api/app/ucp.py`
- Modify: `server/api/app/development.py`
- Modify: `server/api/app/ambp.py`
- Modify: `server/api/app/stickers.py`
- Modify: `server/api/app/auth.py`

**Контекст:** Многие роуты объявляют `dependencies=[Depends(require_auth)]` И `user: dict = Depends(require_auth)` одновременно — это двойной вызов (2 DB-запроса, 2 записи активности). Нужно оставить только параметр `user`.

- [ ] **Шаг 1: Найти все роуты с двойным вызовом**

```bash
grep -n "dependencies=\[Depends(require_auth)\]" server/api/app/*.py
```

- [ ] **Шаг 2: Убрать `dependencies=[Depends(require_auth)]` везде, где рядом есть `user: dict = Depends(require_auth)`**

Паттерн для замены (пример из `tasks.py`):
```python
# БЫЛО:
@router.post("/tasks", dependencies=[Depends(require_auth)])
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:

# СТАЛО:
@router.post("/tasks")
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
```

Применить ко всем файлам: `tasks.py`, `events.py`, `main.py`, `ucp.py`, `development.py`, `ambp.py`, `stickers.py`, `auth.py`.

Для роутов, которые используют ТОЛЬКО `dependencies=[Depends(require_auth)]` без параметра `user` — оставить как есть (там нужен auth но user не используется).

- [ ] **Шаг 3: Проверить**

```bash
grep -n "dependencies=\[Depends(require_auth)\]" server/api/app/*.py
# Оставшиеся строки — это роуты без параметра user, они корректны
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/tasks.py server/api/app/events.py server/api/app/main.py \
        server/api/app/ucp.py server/api/app/development.py server/api/app/ambp.py \
        server/api/app/stickers.py server/api/app/auth.py
git commit -m "fix: remove duplicate require_auth dependencies"
```

---

### Task 4: Добавить авторизацию на `POST /events/{event_id}/tasks`

**Files:**
- Modify: `server/api/app/events.py:189-205`

**Контекст:** Любой авторизованный пользователь может добавлять задачи к любому событию. Нужно проверить, что `event_id` существует и пользователь имеет к нему доступ.

- [ ] **Шаг 1: Найти функцию `create_event_task`**

```bash
grep -n "create_event_task\|event_id.*tasks" server/api/app/events.py
```

- [ ] **Шаг 2: Добавить проверку прав перед INSERT**

Заменить функцию `create_event_task`:

```python
@router.post("/events/{event_id}/tasks")
async def create_event_task(event_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        event = conn.execute("SELECT * FROM events WHERE id = %s", (event_id,)).fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if not can_manage_owner_row(event, user):
            raise HTTPException(status_code=403, detail="Event access denied")
        row = conn.execute(
            "INSERT INTO event_tasks (event_id, title, description, owner_id, assignee_id, due, done) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (
                event_id,
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                resolve_owner_id(conn, user),
                payload.get("assigneeId"),
                clean_date(payload.get("due")),
                clean_bool(payload.get("done", False)),
            ),
        ).fetchone()
        return event_task_json(row)
```

Также добавить `clean_bool` для поля `done` в `update_event_task` — найти место где `done` попадает в SQL без `clean_bool` и обернуть.

- [ ] **Шаг 3: Проверить вручную**

```bash
# Попытка добавить задачу к чужому событию от non-admin пользователя
# должна вернуть 403
curl -s -X POST http://localhost:8080/api/events/1/tasks \
  -H "Authorization: Bearer <member_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"test"}' | python3 -m json.tool
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/events.py
git commit -m "security: add authorization check to POST /events/{id}/tasks"
```

---

### Task 5: Исправить утечку `ucp_checkpoints` и добавить фильтрацию

**Files:**
- Modify: `server/api/app/main.py:78`
- Modify: `server/api/app/events.py:107`

**Контекст:** `SELECT * FROM ucp_checkpoints ORDER BY task_id, id` возвращает все данные всем пользователям. Нужно фильтровать по видимым задачам.

- [ ] **Шаг 1: Найти запросы в `main.py` и `events.py`**

```bash
grep -n "ucp_checkpoints" server/api/app/main.py server/api/app/events.py
```

- [ ] **Шаг 2: Исправить запрос в `main.py`**

Найти строку `ucp_checkpoints = conn.execute("SELECT * FROM ucp_checkpoints ORDER BY task_id, id").fetchall()` и заменить:

```python
ucp_task_ids = [t["id"] for t in ucp_tasks]
ucp_checkpoints = conn.execute(
    "SELECT * FROM ucp_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
    (ucp_task_ids or [0],),
).fetchall()
```

- [ ] **Шаг 3: Найти и исправить аналогичный запрос в `events.py`**

Найти строку с `ucp_checkpoints` в `events.py` (около строки 107) и применить ту же фильтрацию — получить `ucp_task_ids` из `visible_ucp_tasks(conn, user)` перед этим запросом.

```python
ucp_tasks_for_events = visible_ucp_tasks(conn, user)
ucp_task_ids = [t["id"] for t in ucp_tasks_for_events]
ucp_checkpoints = conn.execute(
    "SELECT * FROM ucp_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
    (ucp_task_ids or [0],),
).fetchall()
```

- [ ] **Шаг 4: Проверить**

```bash
# Запустить bootstrap от non-admin пользователя и убедиться
# что возвращаются только его checkpoints
curl -s http://localhost:8080/api/bootstrap \
  -H "Authorization: Bearer <member_token>" | python3 -m json.tool | grep -A5 "ucpTasks"
```

- [ ] **Шаг 5: Коммит**

```bash
git add server/api/app/main.py server/api/app/events.py
git commit -m "security: scope ucp_checkpoints to visible tasks"
```

---

### Task 6: Исправить потерю checkpoints при частичном PATCH /ucp/tasks

**Files:**
- Modify: `server/api/app/ucp.py:139`

**Контекст:** Если клиент делает `PATCH /ucp/tasks/{id}` без поля `checkpoints`, `save_ucp_relations` получает `[]` и удаляет все существующие checkpoints. Нужно только обновлять checkpoints когда они явно переданы.

- [ ] **Шаг 1: Найти функцию `update_ucp_task`**

```bash
grep -n "update_ucp_task\|save_ucp_relations\|checkpoints" server/api/app/ucp.py
```

- [ ] **Шаг 2: Обновить `update_ucp_task` — проверять наличие ключа в payload**

Найти строку `save_ucp_relations(conn, task_id, payload.get("memberIds", []), payload.get("checkpoints", []))` и заменить функцию:

```python
@router.patch("/ucp/tasks/{task_id}")
async def update_ucp_task(task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        existing = conn.execute("SELECT * FROM ucp_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="UCP task not found")
        if not can_view_ucp_task(conn, task_id, user):
            raise HTTPException(status_code=403, detail="UCP task access denied")
        conn.execute(
            "UPDATE ucp_tasks SET title = %s, description = %s, done = %s, updated_at = now() WHERE id = %s RETURNING *",
            (payload.get("title", "").strip(), payload.get("description", "").strip(), clean_bool(payload.get("done")), task_id),
        ).fetchone()
        # Только обновлять members/checkpoints если они явно переданы
        member_ids = payload["memberIds"] if "memberIds" in payload else None
        checkpoints = payload["checkpoints"] if "checkpoints" in payload else None
        if member_ids is not None or checkpoints is not None:
            save_ucp_relations(
                conn,
                task_id,
                member_ids if member_ids is not None else [m["id"] for m in fetch_ucp_task(conn, task_id).get("memberIds", [])],
                checkpoints if checkpoints is not None else [],
            )
        return fetch_ucp_task(conn, task_id)
```

- [ ] **Шаг 3: Проверить**

```bash
# PATCH без checkpoints не должен удалять существующие
curl -s -X PATCH http://localhost:8080/api/ucp/tasks/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"обновлённый заголовок"}' | python3 -m json.tool
# checkpoints в ответе должны остаться теми же
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/ucp.py
git commit -m "fix: preserve ucp checkpoints on partial PATCH"
```

---

### Task 7: Убрать мутацию данных из read-пути `visible_tasks`

**Files:**
- Modify: `server/api/app/tasks.py:35-48`
- Modify: `server/api/app/main.py` (startup)

**Контекст:** `visible_tasks()` вызывает `archive_expired_done_tasks()` — мутация на каждом GET, при конкурентных запросах вызывает lock contention и потенциальный 500.

- [ ] **Шаг 1: Найти текущий код**

```bash
grep -n "archive_expired_done_tasks\|visible_tasks" server/api/app/tasks.py server/api/app/main.py
```

- [ ] **Шаг 2: Убрать вызов из `visible_tasks` в `tasks.py`**

Найти функцию `visible_tasks` и убрать первую строку `archive_expired_done_tasks(conn)`:

```python
def visible_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    # archive_expired_done_tasks вызывается при старте, не при каждом запросе
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
    return conn.execute(
        """
        SELECT DISTINCT tasks.*
        FROM tasks
        LEFT JOIN task_members ON task_members.task_id = tasks.id
        WHERE tasks.owner_id = %s OR task_members.member_id = %s
        ORDER BY tasks.id
        """,
        (user["id"], user["id"]),
    ).fetchall()
```

- [ ] **Шаг 3: Вызвать `archive_expired_done_tasks` при старте в `main.py`**

Найти `@app.on_event("startup")` в `main.py` и добавить вызов:

```python
@app.on_event("startup")
def startup():
    migrate_auth_schema()
    from .tasks import archive_expired_done_tasks
    with db() as conn:
        archive_expired_done_tasks(conn)
```

- [ ] **Шаг 4: Проверить**

```bash
# Перезапустить и убедиться что /bootstrap работает
docker compose restart dashboard-api 2>/dev/null || true
curl -s http://localhost:8080/api/bootstrap \
  -H "Authorization: Bearer <token>" | python3 -m json.tool | python3 -c "import sys,json; d=json.load(sys.stdin); print('tasks count:', len(d.get('tasks', [])))"
```

- [ ] **Шаг 5: Коммит**

```bash
git add server/api/app/tasks.py server/api/app/main.py
git commit -m "fix: move archive_expired_done_tasks from read path to startup"
```

---

## Фаза 2: Важные проблемы безопасности и валидации

---

### Task 8: Добавить rate limiting на auth endpoints

**Files:**
- Modify: `server/Caddyfile`

**Контекст:** Нет ограничений на `/auth/login` и `/auth/refresh` — открыто для brute-force.

- [ ] **Шаг 1: Проверить текущий Caddyfile**

```bash
cat server/Caddyfile
```

- [ ] **Шаг 2: Добавить rate limit директивы**

Найти блок `:80` в `server/Caddyfile` и добавить rate limiting для auth endpoint'ов перед основными правилами:

```caddyfile
:80 {
    # Rate limit auth endpoints: 10 запросов/минуту с одного IP
    @auth_endpoints {
        path /api/auth/login /api/auth/refresh /api/auth/register
    }
    rate_limit @auth_endpoints 10r/m

    # ... остальные правила без изменений
    handle /api/* {
        reverse_proxy dashboard-api:8000
    }
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
}
```

**Примечание:** директива `rate_limit` доступна через Caddy плагин `caddy-ratelimit`. Если используется стандартный образ без плагина, альтернатива — добавить middleware на уровне FastAPI.

- [ ] **Шаг 3: Если плагин недоступен — добавить rate limiting через `slowapi` в FastAPI**

Установить зависимость в `server/api/requirements.txt` (или аналог):
```
slowapi>=0.1.9
```

В `server/api/app/main.py` добавить:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

В `server/api/app/auth.py` — добавить декоратор на login и refresh:
```python
from .main import limiter
from fastapi import Request

@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, ...):
    ...

@router.post("/auth/refresh")
@limiter.limit("20/minute")
async def refresh_session(request: Request, ...):
    ...
```

- [ ] **Шаг 4: Проверить**

```bash
# Отправить 11+ запросов подряд и убедиться что 429 возвращается
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}'
done
# Ожидается: первые ~10 = 401/400, последние = 429
```

- [ ] **Шаг 5: Коммит**

```bash
git add server/Caddyfile server/api/app/main.py server/api/app/auth.py
git commit -m "security: add rate limiting to auth endpoints"
```

---

### Task 9: Добавить security headers в Caddyfile

**Files:**
- Modify: `server/Caddyfile`

**Контекст:** Нет ни одного security header. Нужны CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy.

- [ ] **Шаг 1: Добавить header-блок в Caddyfile**

В блоке `:80` добавить после `rate_limit`:

```caddyfile
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; worker-src 'self'"
    }
```

**Примечание по HSTS:** добавить только если сайт работает только по HTTPS. Если есть HTTP-доступ, пропустить `Strict-Transport-Security`.

- [ ] **Шаг 2: Перезапустить Caddy и проверить**

```bash
docker compose restart dashboard-web 2>/dev/null || true
curl -sI http://localhost:8080 | grep -E "X-Frame|X-Content|Referrer|Content-Security"
# Ожидается: все 4 заголовка присутствуют
```

- [ ] **Шаг 3: Коммит**

```bash
git add server/Caddyfile
git commit -m "security: add security headers (CSP, X-Frame-Options, etc)"
```

---

### Task 10: Добавить валидацию входных данных

**Files:**
- Modify: `server/api/app/utils.py`
- Modify: `server/api/app/tasks.py`
- Modify: `server/api/app/events.py`

**Контекст:** `priority`, `event.month`, `event.day`, `title`, `clean_date` не валидируются.

- [ ] **Шаг 1: Улучшить `clean_date` в `utils.py`**

Найти функцию `clean_date` и заменить:

```python
def clean_date(value: Any) -> str | None:
    if value in (None, "", "—"):
        return None
    from datetime import date as date_type
    if isinstance(value, date_type):
        return value
    try:
        from datetime import date as _date
        _date.fromisoformat(str(value))
        return str(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {value!r}")
```

- [ ] **Шаг 2: Добавить валидацию `priority` в `tasks.py`**

Найти `POST /tasks` (функция `create_task`) и добавить перед INSERT:

```python
VALID_PRIORITIES = {"low", "medium", "high", ""}
raw_priority = payload.get("priority", "")
if raw_priority not in VALID_PRIORITIES:
    raise HTTPException(status_code=400, detail=f"Invalid priority: {raw_priority!r}")
```

- [ ] **Шаг 3: Добавить валидацию `month` и `day` в `events.py`**

В функции `create_event` найти место где используются `month` и `day` и добавить:

```python
month = payload.get("month")
day = payload.get("day")
if not isinstance(month, int) or not (0 <= month <= 11):
    raise HTTPException(status_code=400, detail="month must be integer 0-11")
if not isinstance(day, int) or not (1 <= day <= 31):
    raise HTTPException(status_code=400, detail="day must be integer 1-31")
```

- [ ] **Шаг 4: Добавить проверку непустого title в `tasks.py`**

В `create_task` перед INSERT:

```python
title = payload.get("title", "").strip()
if not title:
    raise HTTPException(status_code=400, detail="title is required")
```

- [ ] **Шаг 5: Проверить**

```bash
# Невалидная дата
curl -s -X POST http://localhost:8080/api/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"test","due":"not-a-date"}' | python3 -m json.tool
# Ожидается: 400 с сообщением об ошибке

# Пустой title
curl -s -X POST http://localhost:8080/api/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"  "}' | python3 -m json.tool
# Ожидается: 400
```

- [ ] **Шаг 6: Коммит**

```bash
git add server/api/app/utils.py server/api/app/tasks.py server/api/app/events.py
git commit -m "fix: add input validation for date, priority, month/day, title"
```

---

### Task 11: Исправить миграции — добавить версионирование

**Files:**
- Modify: `server/api/app/db.py`

**Контекст:** Data migrations (UPDATE) в `migrate_auth_schema()` выполняются при каждом старте. Нужна таблица версий и пропуск уже выполненных миграций.

- [ ] **Шаг 1: Добавить таблицу `schema_migrations` в начало `migrate_auth_schema()`**

В начале функции `migrate_auth_schema()` добавить создание таблицы и хелпер:

```python
def migrate_auth_schema() -> None:
    from .auth import hash_password
    with db() as conn:
        # Таблица версий миграций — создаётся первой
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version text PRIMARY KEY,
                applied_at timestamptz DEFAULT now()
            )
        """)

        def applied(version: str) -> bool:
            row = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE version = %s", (version,)
            ).fetchone()
            return row is not None

        def mark_applied(version: str) -> None:
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING",
                (version,),
            )

        # DDL (CREATE TABLE IF NOT EXISTS, ALTER TABLE IF EXISTS) — идемпотентны, выполнять всегда
        conn.execute("CREATE TABLE IF NOT EXISTS users (...)")
        # ... все CREATE TABLE IF NOT EXISTS без изменений ...

        # Data migrations — выполнять только один раз
        if not applied("001_set_default_role"):
            conn.execute("UPDATE users SET role = 'member' WHERE role IS NULL")
            mark_applied("001_set_default_role")

        if not applied("002_archive_old_tasks"):
            conn.execute(
                "UPDATE tasks SET column_name = 'Архив' WHERE column_name = 'Готово' AND completed_at <= now() - interval '30 days'"
            )
            mark_applied("002_archive_old_tasks")

        # ... аналогично для всех других UPDATE-миграций
```

- [ ] **Шаг 2: Найти все UPDATE-миграции в `db.py` и обернуть в `if not applied(...)`**

```bash
grep -n "conn.execute.*UPDATE\|conn.execute.*INSERT.*ON CONFLICT" server/api/app/db.py
```

Каждый UPDATE получает уникальный идентификатор версии вида `"001_description"`.

- [ ] **Шаг 3: Проверить**

```bash
# Рестарт дважды — вторая миграция должна пройти быстрее и не трогать данные
docker compose restart dashboard-api
docker compose logs dashboard-api | tail -20
docker compose restart dashboard-api
docker compose logs dashboard-api | tail -20
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/db.py
git commit -m "fix: add migration versioning to prevent repeated data updates"
```

---

## Фаза 3: Производительность

---

### Task 12: Добавить connection pool для PostgreSQL

**Files:**
- Modify: `server/api/app/db.py`
- Modify: `server/api/app/main.py`

**Контекст:** Каждый запрос открывает новое TCP-соединение к PostgreSQL. Нужен `psycopg_pool.ConnectionPool`.

- [ ] **Шаг 1: Добавить зависимость**

В `server/api/requirements.txt` (или аналогичный файл):
```
psycopg[pool]>=3.1
```

- [ ] **Шаг 2: Обновить `db.py` — использовать пул**

```python
import logging
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import (
    ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, DATABASE_URL,
)

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def init_pool() -> None:
    global _pool
    _pool = ConnectionPool(
        DATABASE_URL,
        min_size=2,
        max_size=10,
        kwargs={"row_factory": dict_row},
    )


def close_pool() -> None:
    if _pool:
        _pool.close()


@contextmanager
def db():
    if _pool is None:
        # fallback для тестов / migrate — прямое соединение
        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
            with conn.transaction():
                yield conn
        return
    with _pool.connection() as conn:
        with conn.transaction():
            yield conn
```

- [ ] **Шаг 3: Инициализировать пул при старте в `main.py`**

```python
@app.on_event("startup")
def startup():
    from .db import init_pool
    init_pool()
    migrate_auth_schema()
    from .tasks import archive_expired_done_tasks
    with db() as conn:
        archive_expired_done_tasks(conn)

@app.on_event("shutdown")
def shutdown():
    from .db import close_pool
    close_pool()
```

- [ ] **Шаг 4: Проверить**

```bash
docker compose up -d --build
# Одновременно несколько запросов
for i in $(seq 1 5); do
  curl -s http://localhost:8080/api/bootstrap -H "Authorization: Bearer <token>" &
done
wait
echo "All done"
```

- [ ] **Шаг 5: Коммит**

```bash
git add server/api/app/db.py server/api/app/main.py
git commit -m "perf: add PostgreSQL connection pool (psycopg_pool)"
```

---

### Task 13: Добавить индексы на `task_id` в таблицах checkpoints

**Files:**
- Modify: `server/api/app/db.py`

**Контекст:** `ucp_checkpoints.task_id` и `development_task_checkpoints.task_id` используются в `WHERE task_id = ANY(...)` но индексов нет.

- [ ] **Шаг 1: Найти конец DDL в `db.py`**

```bash
grep -n "CREATE INDEX\|ucp_checkpoints\|development_task_checkpoints" server/api/app/db.py | tail -20
```

- [ ] **Шаг 2: Добавить CREATE INDEX в `migrate_auth_schema()`**

После создания таблиц добавить:

```python
conn.execute("""
    CREATE INDEX IF NOT EXISTS idx_ucp_checkpoints_task_id
    ON ucp_checkpoints (task_id)
""")
conn.execute("""
    CREATE INDEX IF NOT EXISTS idx_development_task_checkpoints_task_id
    ON development_task_checkpoints (task_id)
""")
conn.execute("""
    CREATE INDEX IF NOT EXISTS idx_event_tasks_event_id
    ON event_tasks (event_id)
""")
conn.execute("""
    CREATE INDEX IF NOT EXISTS idx_task_members_task_id
    ON task_members (task_id)
""")
```

- [ ] **Шаг 3: Проверить**

```bash
docker compose restart dashboard-api
# Проверить что индексы созданы в БД
docker compose exec dashboard-db psql -U dashboard -d dashboard -c "\di" | grep idx_ucp
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/db.py
git commit -m "perf: add missing indexes on checkpoint and member task_id columns"
```

---

### Task 14: Исправить перезагрузку данных при смене вкладки

**Files:**
- Modify: `frontend/src/App.jsx:137`

**Контекст:** `active` в зависимостях `useEffect` вызывает полный re-fetch при каждой смене вкладки. Данные нужно загружать один раз (при логине/инициализации), а не при навигации.

- [ ] **Шаг 1: Открыть `frontend/src/App.jsx` и найти useEffect загрузки данных**

```bash
grep -n "api.bootstrap\|active\|useEffect" frontend/src/App.jsx
```

- [ ] **Шаг 2: Убрать `active` из зависимостей useEffect**

Найти:
```javascript
  }, [api, onError, active, accessToken, currentUser]);
```

Заменить на:
```javascript
  }, [api, onError]);
```

`api` уже меняется при смене `accessToken` (через `useCallback`), поэтому данные будут перезагружены при логине. `currentUser` и `active` не должны триггерить re-fetch.

- [ ] **Шаг 3: Проверить в браузере**

```bash
npm run dev --prefix frontend
```

Открыть DevTools → Network → XHR. Переключаться между вкладками и убедиться, что `/api/bootstrap` не вызывается при каждом переключении.

- [ ] **Шаг 4: Коммит**

```bash
git add frontend/src/App.jsx
git commit -m "perf: stop re-fetching bootstrap on every tab switch"
```

---

### Task 15: Вынести push-уведомления за пределы транзакции

**Files:**
- Modify: `server/api/app/tasks.py:154-156`

**Контекст:** `notify_task_created` делает HTTP-запрос к push-серверу внутри DB-транзакции. Нужно вызывать после коммита.

- [ ] **Шаг 1: Найти вызов `notify_task_created` в `tasks.py`**

```bash
grep -n "notify_task_created\|push" server/api/app/tasks.py
```

- [ ] **Шаг 2: Перенести вызов за пределы `with db()` блока**

Найти функцию `create_task` и реструктурировать:

```python
@router.post("/tasks")
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    with db() as conn:
        # ... весь INSERT и fetch ...
        task = fetch_task(conn, row["id"])

    # Push-уведомление — ПОСЛЕ закрытия транзакции
    try:
        from .push import notify_task_created
        await notify_task_created(task, user)
    except Exception:
        logger.exception("Failed to send push notification for task %s", task["id"])

    return task
```

Если `notify_task_created` синхронная — обернуть в `asyncio.get_event_loop().run_in_executor(None, ...)` или сделать async.

- [ ] **Шаг 3: Проверить**

```bash
curl -s -X POST http://localhost:8080/api/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"test push"}' | python3 -m json.tool
# Задача должна создаться даже если push-сервер недоступен
```

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/tasks.py
git commit -m "fix: send push notifications after DB transaction, not inside"
```

---

## Фаза 4: Минорные улучшения

---

### Task 16: Убрать захардкоженный `ROADMAP_YEAR`

**Files:**
- Modify: `frontend/src/utils.js:3`

**Контекст:** `ROADMAP_YEAR = 2026` используется как fallback для парсинга дат. В 2027 всё сломается.

- [ ] **Шаг 1: Найти все использования `ROADMAP_YEAR` в `utils.js`**

```bash
grep -n "ROADMAP_YEAR" frontend/src/utils.js frontend/src/sections/*.jsx
```

- [ ] **Шаг 2: Заменить константу на динамическое значение**

В `frontend/src/utils.js`:

```javascript
// Было:
export const ROADMAP_YEAR = 2026;

// Стало:
export const ROADMAP_YEAR = new Date().getFullYear();
```

- [ ] **Шаг 3: Проверить в браузере что даты парсятся корректно**

```bash
npm run dev --prefix frontend
```

Открыть раздел Roadmaps и убедиться что даты отображаются правильно.

- [ ] **Шаг 4: Коммит**

```bash
git add frontend/src/utils.js
git commit -m "fix: use current year instead of hardcoded ROADMAP_YEAR"
```

---

### Task 17: Исправить 0-индексацию месяца в getRoadmapToday

**Files:**
- Modify: `frontend/src/utils.js:13-17`

**Контекст:** `getRoadmapToday()` использует `now.getMonth()` (0-indexed), но отображение ожидает 1-indexed. Нужно явно задокументировать контракт.

- [ ] **Шаг 1: Найти функцию `getRoadmapToday`**

```bash
grep -n "getRoadmapToday\|getMonth" frontend/src/utils.js
```

- [ ] **Шаг 2: Убедиться в консистентности**

Проверить все места использования `getRoadmapToday()` — что ожидают: 0-indexed или 1-indexed month?

```bash
grep -rn "getRoadmapToday\|\.month" frontend/src/sections/RoadmapsSection.jsx | head -20
```

Если везде 0-indexed — оставить как есть, добавить комментарий. Если есть смешение — привести к одному стандарту (0-indexed как у Date API).

- [ ] **Шаг 3: Добавить явный комментарий к функции**

```javascript
// Returns today as { month: 0-11 (JS Date convention), day: 1-31 }
export function getRoadmapToday() {
    const now = new Date();
    return { month: now.getMonth(), day: now.getDate() };
}
```

- [ ] **Шаг 4: Коммит**

```bash
git add frontend/src/utils.js
git commit -m "fix: document 0-indexed month convention in getRoadmapToday"
```

---

## Итого

| Фаза | Tasks | Приоритет |
|------|-------|-----------|
| Фаза 1 | 1–7 | Критические — выполнить сразу |
| Фаза 2 | 8–11 | Важные security/quality |
| Фаза 3 | 12–15 | Производительность |
| Фаза 4 | 16–17 | Минорные |

**Порядок выполнения:** строго по номерам в пределах фазы 1–2. Фазы 3–4 можно выполнять параллельно или после деплоя первых двух фаз.
