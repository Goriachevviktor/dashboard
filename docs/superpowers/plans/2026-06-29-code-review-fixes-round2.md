# Code Review Fixes — Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить четыре оставшихся уязвимости и баги после первого раунда ревью: мобильные auth-эндпоинты без rate limiting, `/auth/register` без rate limiting, UCP принимает пустой title, VAPID ключ не ротирован.

**Architecture:** Все изменения изолированы: Tasks 1–3 — точечные правки в `auth.py` и `ucp.py`, Task 4 — инструкция по ручной ротации секрета. Фронтенд-декомпозиция (RoadmapsSection, BlockDiagramSection, MindMapSection) вынесена в отдельный план из-за объёма.

**Tech Stack:** FastAPI + slowapi (уже в requirements) + psycopg + Python 3.12

---

## Файлы

| Файл | Изменение |
|------|-----------|
| `server/api/app/auth.py` | Добавить `@limiter.limit` на `mobile_login`, `mobile_refresh_session`, `register` |
| `server/api/app/ucp.py` | Добавить проверку непустого title в `create_ucp_task` |
| `server/api/app/vapid_private.pem` | Удалить из рабочего дерева (ключ скомпрометирован через git-историю) |
| `server/.env` | Обновить `DASHBOARD_VAPID_PUBLIC_KEY` (ручной шаг) |

---

## Task 1: Rate limit мобильные auth-эндпоинты

**Файлы:**
- Modify: `server/api/app/auth.py` — функции `mobile_login` (~строка 270) и `mobile_refresh_session` (~строка 288)

**Контекст:** `limiter` уже импортирован из `.rate_limiter` (строка 15 `auth.py`). `/auth/login` и `/auth/refresh` уже защищены декораторами `@limiter.limit`. Мобильные аналоги — нет. Обе функции уже принимают `request: Request` как первый параметр.

- [ ] **Шаг 1: Проверить текущее состояние**

```bash
grep -n "@limiter\|def mobile_login\|def mobile_refresh" server/api/app/auth.py
```

Ожидается: строки `def mobile_login` и `def mobile_refresh_session` без `@limiter.limit` над ними.

- [ ] **Шаг 2: Добавить декораторы**

Найти в `server/api/app/auth.py`:

```python
@router.post("/auth/mobile/login")
async def mobile_login(request: Request) -> dict[str, Any]:
```

Заменить на:

```python
@router.post("/auth/mobile/login")
@limiter.limit("10/minute")
async def mobile_login(request: Request) -> dict[str, Any]:
```

Найти:

```python
@router.post("/auth/mobile/refresh")
async def mobile_refresh_session(request: Request) -> dict[str, Any]:
```

Заменить на:

```python
@router.post("/auth/mobile/refresh")
@limiter.limit("20/minute")
async def mobile_refresh_session(request: Request) -> dict[str, Any]:
```

- [ ] **Шаг 3: Проверить что декораторы стоят в правильном порядке**

```bash
grep -n -A2 "@router.post.*mobile/login\|@router.post.*mobile/refresh" server/api/app/auth.py
```

Ожидается: `@router.post(...)` первый, `@limiter.limit(...)` второй, `async def` третий — именно такой порядок нужен slowapi.

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/auth.py
git commit -m "security: add rate limiting to mobile auth endpoints"
```

---

## Task 2: Rate limit `/auth/register`

**Файлы:**
- Modify: `server/api/app/auth.py` — функция `register` (~строка 472)

**Контекст:** Эндпоинт `/auth/register` принимает инвайт-токен + пароль. Без rate limit возможна автоматизированная атака. Функция уже принимает `request: Request`.

- [ ] **Шаг 1: Проверить текущее состояние**

```bash
grep -n "@router.post.*register\|def register" server/api/app/auth.py
```

Ожидается: строка `@router.post("/auth/register")` и `async def register(request: Request, ...)` без `@limiter.limit`.

- [ ] **Шаг 2: Добавить декоратор**

Найти в `server/api/app/auth.py`:

```python
@router.post("/auth/register")
async def register(request: Request, response: Response) -> dict[str, Any]:
```

Заменить на:

```python
@router.post("/auth/register")
@limiter.limit("5/minute")
async def register(request: Request, response: Response) -> dict[str, Any]:
```

- [ ] **Шаг 3: Проверить**

```bash
grep -n -A2 "@router.post.*register" server/api/app/auth.py
```

Ожидается: `@router.post("/auth/register")`, затем `@limiter.limit("5/minute")`, затем `async def register`.

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/auth.py
git commit -m "security: add rate limiting to /auth/register"
```

---

## Task 3: Валидация непустого title в `create_ucp_task`

**Файлы:**
- Modify: `server/api/app/ucp.py` — функция `create_ucp_task` (~строка 115)

**Контекст:** Все другие модули (tasks.py, development.py, ambp.py) проверяют что `title` непустой перед INSERT. UCP — единственное исключение. Сейчас пустая строка молча записывается в БД.

- [ ] **Шаг 1: Найти текущий код**

```bash
sed -n '114,124p' server/api/app/ucp.py
```

Ожидается что текущий код выглядит так:

```python
@router.post("/ucp/tasks")
async def create_ucp_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            "INSERT INTO ucp_tasks (title, description, done, owner_id) VALUES (%s, %s, %s, %s) RETURNING *",
            (payload.get("title", "").strip(), ...),
        ).fetchone()
```

- [ ] **Шаг 2: Добавить валидацию title перед `with db() as conn:`**

Заменить функцию `create_ucp_task` на:

```python
@router.post("/ucp/tasks")
async def create_ucp_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    with db() as conn:
        row = conn.execute(
            "INSERT INTO ucp_tasks (title, description, done, owner_id) VALUES (%s, %s, %s, %s) RETURNING *",
            (title, (payload.get("description") or "").strip(), clean_bool(payload.get("done")), resolve_owner_id(conn, user)),
        ).fetchone()
        save_ucp_relations(conn, row["id"], payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_ucp_task(conn, row["id"])
```

- [ ] **Шаг 3: Проверить**

```bash
grep -n "title\|HTTPException\|400" server/api/app/ucp.py | head -10
```

Ожидается: строки с `if not title:` и `raise HTTPException(status_code=400, ...)` до `with db() as conn:`.

- [ ] **Шаг 4: Коммит**

```bash
git add server/api/app/ucp.py
git commit -m "fix: validate non-empty title in create_ucp_task"
```

---

## Task 4: Ротация VAPID-ключа (ручные шаги)

**Файлы:**
- Delete: `server/api/app/vapid_private.pem` (из рабочего дерева)
- Update: `server/.env` — новый `DASHBOARD_VAPID_PUBLIC_KEY`
- Optional: очистка git-истории через `git filter-repo`

**Контекст:** `server/api/app/vapid_private.pem` зафиксирован в git-истории (коммит `97b6fc9`). Файл существует в рабочем дереве. Task 1 первого раунда добавил `.gitignore` и volume mount в docker-compose, но сам ключ не был ротирован. Текущий VAPID private key скомпрометирован — любой кто имел доступ к репозиторию мог его прочитать.

- [ ] **Шаг 1: Убедиться что файл в .gitignore**

```bash
cat server/.gitignore | grep pem
git check-ignore -v server/api/app/vapid_private.pem
```

Ожидается: `*.pem` в .gitignore и строка вида `server/.gitignore:3:*.pem	server/api/app/vapid_private.pem`.

- [ ] **Шаг 2: Сгенерировать новую пару VAPID-ключей**

```bash
docker run --rm python:3.12-slim bash -c "
pip -q install py-vapid && python3 -c \"
from py_vapid import Vapid
import base64
import cryptography.hazmat.primitives.serialization as s

v = Vapid()
v.generate_keys()

priv_pem = v.private_key.private_bytes(
    s.Encoding.PEM,
    s.PrivateFormat.TraditionalOpenSSL,
    s.NoEncryption()
).decode()

pub_bytes = v.public_key.public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint)
pub_b64 = base64.urlsafe_b64encode(pub_bytes).decode().rstrip('=')

print('=== PRIVATE KEY (сохранить в vapid_private.pem на сервере) ===')
print(priv_pem)
print('=== PUBLIC KEY (вставить в .env как DASHBOARD_VAPID_PUBLIC_KEY) ===')
print(pub_b64)
\""
```

Скопировать значения из вывода.

- [ ] **Шаг 3: Сохранить новый приватный ключ в server/vapid_private.pem (НЕ в api/app/)**

```bash
# Создать файл в server/ (там его монтирует docker-compose.yml как volume)
cat > server/vapid_private.pem << 'EOF'
<вставить новый приватный ключ из шага 2>
EOF
chmod 600 server/vapid_private.pem
```

- [ ] **Шаг 4: Обновить DASHBOARD_VAPID_PUBLIC_KEY в server/.env**

Открыть `server/.env` и заменить строку:
```
DASHBOARD_VAPID_PUBLIC_KEY=<старый_ключ>
```
на:
```
DASHBOARD_VAPID_PUBLIC_KEY=<новый публичный ключ из шага 2>
```

- [ ] **Шаг 5: Удалить старый файл из рабочего дерева**

```bash
rm server/api/app/vapid_private.pem
git status
```

Ожидается: `server/api/app/vapid_private.pem` не должен появиться в `git status` (он в .gitignore). Если появился — добавить в .gitignore явно.

- [ ] **Шаг 6: Очистить git-историю (опционально, но рекомендуется)**

**Предупреждение:** это переписывает историю. Все кто клонировал репозиторий должны будут сделать `git clone` заново.

```bash
# Установить git-filter-repo если нет
pip install git-filter-repo

# Удалить файл из всей истории
git filter-repo --path server/api/app/vapid_private.pem --invert-paths

# После этого нужно force-push (если есть remote):
# git push origin --force --all
```

Если очистка истории сейчас нецелесообразна — пропустить шаг 6. Приватный ключ уже ротирован, угроза снижена.

- [ ] **Шаг 7: Проверить что volume mount настроен корректно**

```bash
grep -A3 "vapid_private.pem" server/docker-compose.yml
```

Ожидается:
```yaml
volumes:
  - ./vapid_private.pem:/run/secrets/vapid_private_key:ro
```

Путь `./vapid_private.pem` — относительно `server/`, именно туда мы сохранили новый ключ в шаге 3.

- [ ] **Шаг 8: Проверить что push-уведомления работают после ротации**

```bash
# Перезапустить API с новыми секретами
cd server && docker compose up -d --build dashboard-api

# В браузере: перейти в настройки push, нажать "Тест уведомлений"
# Ожидается: уведомление приходит
```

---

## Итого

| Task | Сложность | Риск |
|------|-----------|------|
| Task 1: Rate limit mobile auth | Низкая — 2 декоратора | Нет |
| Task 2: Rate limit /register | Низкая — 1 декоратор | Нет |
| Task 3: UCP title validation | Низкая — 3 строки | Нет |
| Task 4: VAPID ротация | Средняя — ручные шаги | Требует перезапуска, очистка истории разрушительна |

**Не входит в этот план (отдельный):**
- Декомпозиция `RoadmapsSection.jsx` (2165 строк) → utils + subcomponents + views
- Декомпозиция `BlockDiagramSection.jsx` (1635 строк)
- Декомпозиция `MindMapSection.jsx` (1618 строк)
