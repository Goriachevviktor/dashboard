import os
import json
import hashlib
import secrets
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any

import bcrypt
import jwt
import psycopg
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from pywebpush import WebPushException, webpush


DATABASE_URL = os.getenv("DASHBOARD_DATABASE_URL", "postgresql://dashboard:dashboard@localhost:5432/dashboard")
API_TOKEN = os.getenv("DASHBOARD_API_TOKEN", "")
JWT_SECRET = os.getenv("DASHBOARD_JWT_SECRET", "")
ACCESS_TOKEN_TTL_MINUTES = int(os.getenv("DASHBOARD_ACCESS_TOKEN_TTL_MINUTES", "15"))
REFRESH_TOKEN_TTL_DAYS = int(os.getenv("DASHBOARD_REFRESH_TOKEN_TTL_DAYS", "30"))
COOKIE_SECURE = os.getenv("DASHBOARD_COOKIE_SECURE", "true").lower() == "true"
ADMIN_EMAIL = os.getenv("DASHBOARD_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("DASHBOARD_ADMIN_PASSWORD", "")
ADMIN_NAME = os.getenv("DASHBOARD_ADMIN_NAME", "Администратор")
REFRESH_COOKIE_NAME = "dashboard_refresh_token"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("DASHBOARD_CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
    if origin.strip()
]
VAPID_PUBLIC_KEY = os.getenv("DASHBOARD_VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY_FILE = os.getenv("DASHBOARD_VAPID_PRIVATE_KEY_FILE", "")
VAPID_CLAIMS_SUB = os.getenv("DASHBOARD_VAPID_CLAIMS_SUB", "mailto:admin@example.local")

app = FastAPI(title="Dashboard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def db():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


def utcnow() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def ensure_auth_config() -> None:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="DASHBOARD_JWT_SECRET is not configured")


def user_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "role": row["role"],
        "isActive": row.get("is_active", True),
    }


def invite_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "expiresAt": row["expires_at"].isoformat(),
        "usedAt": row["used_at"].isoformat() if row["used_at"] else None,
        "createdAt": row["created_at"].isoformat(),
    }


def create_access_token(user: dict[str, Any]) -> str:
    ensure_auth_config()
    now = utcnow()
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
        path="/api",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api", samesite="lax")


def create_refresh_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    conn.execute(
        """
        INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
        VALUES (%s, %s, %s)
        """,
        (user_id, hash_token(token), utcnow() + timedelta(days=REFRESH_TOKEN_TTL_DAYS)),
    )
    return token


def issue_auth_response(conn, response: Response, user: dict[str, Any]) -> dict[str, Any]:
    refresh_token = create_refresh_session(conn, user["id"])
    set_refresh_cookie(response, refresh_token)
    return {
        "accessToken": create_access_token(user),
        "user": user_json(user),
    }


def issue_mobile_auth_response(conn, user: dict[str, Any]) -> dict[str, Any]:
    refresh_token = create_refresh_session(conn, user["id"])
    return {
        "accessToken": create_access_token(user),
        "refreshToken": refresh_token,
        "tokenType": "Bearer",
        "expiresIn": ACCESS_TOKEN_TTL_MINUTES * 60,
        "user": user_json(user),
    }


def migrate_auth_schema() -> None:
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              email text NOT NULL UNIQUE,
              password_hash text NOT NULL,
              display_name text NOT NULL,
              role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')) DEFAULT 'member',
              is_active boolean NOT NULL DEFAULT true,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now(),
              last_login_at timestamptz
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              refresh_token_hash text NOT NULL UNIQUE,
              expires_at timestamptz NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              revoked_at timestamptz
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(refresh_token_hash)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS invites (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              email text NOT NULL,
              token_hash text NOT NULL UNIQUE,
              role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')) DEFAULT 'member',
              created_by integer REFERENCES users(id) ON DELETE SET NULL,
              expires_at timestamptz NOT NULL,
              used_at timestamptz,
              created_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites(token_hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(lower(email))")
        conn.execute("ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS description text")
        conn.execute("ALTER TABLE IF EXISTS event_tasks ADD COLUMN IF NOT EXISTS description text")
        conn.execute("ALTER TABLE IF EXISTS ucp_checkpoints ADD COLUMN IF NOT EXISTS evidence_materials text NOT NULL DEFAULT ''")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS development_tasks (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              title text NOT NULL,
              description text NOT NULL DEFAULT '',
              result_image text NOT NULL DEFAULT '',
              success_metric text NOT NULL DEFAULT '',
              due date,
              status text NOT NULL DEFAULT '',
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        if not conn.execute("SELECT id FROM development_tasks LIMIT 1").fetchone():
            conn.execute(
                """
                INSERT INTO development_tasks (title, description, result_image, success_metric, due, status)
                VALUES
                  (%s, %s, %s, %s, %s, %s),
                  (%s, %s, %s, %s, %s, %s),
                  (%s, %s, %s, %s, %s, %s)
                """,
                (
                    "Сформировать единую рабочую доску для команды",
                    "Собрать ключевые процессы руководителя в одном dashboard и убрать ручное ведение разрозненных списков.",
                    "Команда видит задачи, события, УПЦ и план развития в едином интерфейсе.",
                    "Не менее 80% рабочих задач ведутся в dashboard.",
                    "2026-06-15",
                    "В работе: базовый backend и авторизация уже готовы.",
                    "Подготовить мобильный клиент",
                    "Сделать iOS-приложение для просмотра и обновления ключевых данных dashboard.",
                    "На iPhone доступен вход, обзор, задачи, события и УПЦ.",
                    "Приложение проходит smoke-test входа и загрузки данных.",
                    "2026-07-01",
                    "Начат SwiftUI-каркас.",
                    "Настроить командную работу",
                    "Добавить коллег через invite-ссылки и договориться о правилах заполнения разделов.",
                    "Каждый участник имеет доступ и понимает, где фиксировать свои изменения.",
                    "Все приглашённые пользователи вошли и обновили хотя бы одну задачу.",
                    "2026-07-15",
                    "Планируется.",
                ),
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ambp_topics (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              title text NOT NULL,
              description text NOT NULL DEFAULT '',
              plan_revenue numeric(14, 2) NOT NULL DEFAULT 0,
              fact_revenue numeric(14, 2) NOT NULL DEFAULT 0,
              funnel_leads integer NOT NULL DEFAULT 0,
              funnel_qualified integer NOT NULL DEFAULT 0,
              funnel_proposals integer NOT NULL DEFAULT 0,
              funnel_contracts integer NOT NULL DEFAULT 0,
              comment text NOT NULL DEFAULT '',
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        if not conn.execute("SELECT id FROM ambp_topics LIMIT 1").fetchone():
            conn.execute(
                """
                INSERT INTO ambp_topics (
                  title, description, plan_revenue, fact_revenue,
                  funnel_leads, funnel_qualified, funnel_proposals, funnel_contracts, comment
                )
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s),
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s),
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s),
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                ,
                (
                    "Импортозамещение ЕСФМ",
                    "Крупнейший резерв дополнительной выручки по бизнес-плану.",
                    45.0,
                    1.2,
                    18,
                    11,
                    5,
                    1,
                    "Требуется усилить роли и владельцев активностей для ускорения результата.",
                    "Проект Рейс контроль",
                    "Проектная тема с подтверждённой ответственностью и активной командой.",
                    35.67,
                    9.0,
                    22,
                    15,
                    8,
                    3,
                    "Работы ведутся, команда собрана, активность уже конвертируется в факт.",
                    "Ресурс для ЕМЦ",
                    "Потенциал дополнительной выручки через работу с ресурсной базой.",
                    17.49,
                    1.27,
                    12,
                    7,
                    3,
                    1,
                    "Нужна детализация ближайших действий и подтверждение клиентского контура.",
                    "Ресурс для ДЦО",
                    "Отдельный резерв по дополнительной выручке бизнес-плана.",
                    17.12,
                    2.57,
                    10,
                    6,
                    4,
                    2,
                    "Есть первичный факт, требуется довести активности до устойчивого темпа.",
                ),
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS push_subscriptions (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              user_id integer REFERENCES users(id) ON DELETE CASCADE,
              endpoint text NOT NULL UNIQUE,
              p256dh text NOT NULL,
              auth text NOT NULL,
              user_agent text NOT NULL DEFAULT '',
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)")
        if ADMIN_EMAIL and ADMIN_PASSWORD:
            existing = conn.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (ADMIN_EMAIL,)).fetchone()
            if not existing:
                conn.execute(
                    """
                    INSERT INTO users (email, password_hash, display_name, role)
                    VALUES (%s, %s, %s, 'admin')
                    """,
                    (ADMIN_EMAIL.lower(), hash_password(ADMIN_PASSWORD), ADMIN_NAME),
                )


@app.on_event("startup")
def startup() -> None:
    migrate_auth_schema()


def require_auth(
    authorization: str | None = Header(default=None),
    x_dashboard_token: str | None = Header(default=None, alias="X-Dashboard-Token"),
) -> dict[str, Any]:
    header_ok = x_dashboard_token == API_TOKEN
    if API_TOKEN and header_ok:
        return {"id": 0, "email": "system", "display_name": "System", "role": "admin", "is_active": True}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ").strip()
    if API_TOKEN and token == API_TOKEN:
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
        return user


def require_admin(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role is required")
    return user


def refresh_user_from_cookie(conn, refresh_token: str | None) -> dict[str, Any]:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh session is missing")
    session = conn.execute(
        """
        SELECT auth_sessions.*, users.email, users.display_name, users.role, users.is_active
        FROM auth_sessions
        JOIN users ON users.id = auth_sessions.user_id
        WHERE refresh_token_hash = %s
          AND revoked_at IS NULL
          AND expires_at > now()
          AND users.is_active = true
        """,
        (hash_token(refresh_token),),
    ).fetchone()
    if not session:
        raise HTTPException(status_code=401, detail="Refresh session is invalid")
    return {
        "id": session["user_id"],
        "email": session["email"],
        "display_name": session["display_name"],
        "role": session["role"],
        "is_active": session["is_active"],
    }


def refresh_user_from_token(conn, refresh_token: str | None) -> dict[str, Any]:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh session is missing")
    user = refresh_user_from_cookie(conn, refresh_token)
    conn.execute(
        "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
        (hash_token(refresh_token),),
    )
    return user


def clean_date(value: Any) -> str | None:
    if value in (None, "", "—"):
        return None
    return value


def iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, date) else value


def task_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "priority": row["priority"],
        "column": row["column_name"],
        "due": iso(row["due"]) or "",
        "assigneeId": row["assignee_id"],
    }


def event_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row.get("description") or "",
        "month": row["month"],
        "day": row["day"],
        "type": row["type"],
        "done": row["done"],
    }


def event_task_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row.get("description") or "",
        "assigneeId": row["assignee_id"],
        "due": iso(row["due"]) or "",
        "done": row["done"],
    }


def sticker_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "speaker": row["speaker"],
        "topic": row["topic"],
        "text": row["text"] or "",
        "colorId": row["color_id"],
        "x": row["x"],
        "y": row["y"],
        "width": row["width"],
        "height": row["height"],
    }


def ucp_task_json(row: dict[str, Any], checkpoints: list[dict[str, Any]], members: list[int]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "memberIds": members,
        "checkpoints": [
            {
                "id": item["id"],
                "label": item["label"] or "",
                "date": iso(item["date"]) or "",
                "evidenceMaterials": item.get("evidence_materials") or "",
            }
            for item in checkpoints
        ],
    }


def development_task_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "resultImage": row["result_image"] or "",
        "successMetric": row["success_metric"] or "",
        "due": iso(row["due"]) or "",
        "status": row["status"] or "",
    }


def ambp_topic_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "planRevenue": float(row["plan_revenue"] or 0),
        "factRevenue": float(row["fact_revenue"] or 0),
        "funnelLeads": row["funnel_leads"] or 0,
        "funnelQualified": row["funnel_qualified"] or 0,
        "funnelProposals": row["funnel_proposals"] or 0,
        "funnelContracts": row["funnel_contracts"] or 0,
        "comment": row["comment"] or "",
    }


def fetch_all_data(conn) -> dict[str, Any]:
    team = conn.execute(
        """
        SELECT id, email, display_name as name
        FROM users
        WHERE is_active = true
        ORDER BY display_name, id
        """
    ).fetchall()
    tasks = conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
    events = conn.execute("SELECT * FROM events ORDER BY month, day, id").fetchall()
    event_tasks = conn.execute("SELECT * FROM event_tasks ORDER BY event_id, id").fetchall()
    stickers = conn.execute("SELECT * FROM sync_stickers ORDER BY id").fetchall()
    ucp_tasks = conn.execute("SELECT * FROM ucp_tasks ORDER BY id").fetchall()
    development_tasks = conn.execute("SELECT * FROM development_tasks ORDER BY due NULLS LAST, id").fetchall()
    ambp_topics = conn.execute("SELECT * FROM ambp_topics ORDER BY id").fetchall()
    ucp_members = conn.execute("SELECT task_id, member_id FROM ucp_task_members ORDER BY task_id, member_id").fetchall()
    ucp_checkpoints = conn.execute("SELECT * FROM ucp_checkpoints ORDER BY task_id, id").fetchall()

    event_task_map: dict[str, list[dict[str, Any]]] = {}
    for item in event_tasks:
        event_task_map.setdefault(str(item["event_id"]), []).append(event_task_json(item))

    member_map: dict[int, list[int]] = {}
    for item in ucp_members:
        member_map.setdefault(item["task_id"], []).append(item["member_id"])

    checkpoint_map: dict[int, list[dict[str, Any]]] = {}
    for item in ucp_checkpoints:
        checkpoint_map.setdefault(item["task_id"], []).append(item)

    return {
        "team": team,
        "tasks": [task_json(item) for item in tasks],
        "events": [event_json(item) for item in events],
        "eventTasks": event_task_map,
        "syncStickers": [sticker_json(item) for item in stickers],
        "ucpTasks": [
            ucp_task_json(item, checkpoint_map.get(item["id"], []), member_map.get(item["id"], []))
            for item in ucp_tasks
        ],
        "developmentTasks": [development_task_json(item) for item in development_tasks],
        "ambpTopics": [ambp_topic_json(item) for item in ambp_topics],
    }


def push_is_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY_FILE and os.path.exists(VAPID_PRIVATE_KEY_FILE))


def send_push_notification(subscription: dict[str, Any], payload: dict[str, Any]) -> bool:
    if not push_is_configured():
        return False
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth": subscription["auth"],
                },
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=VAPID_PRIVATE_KEY_FILE,
            vapid_claims={"sub": VAPID_CLAIMS_SUB},
        )
    except WebPushException as error:
        status = getattr(getattr(error, "response", None), "status_code", None)
        if status in (404, 410):
            with db() as cleanup_conn:
                cleanup_conn.execute("DELETE FROM push_subscriptions WHERE endpoint = %s", (subscription["endpoint"],))
    except Exception:
        return


def notify_push_subscriptions(subscriptions: list[dict[str, Any]], payload: dict[str, Any]) -> int:
    if not push_is_configured() or not subscriptions:
        return 0
    sent = 0
    for subscription in subscriptions:
        if send_push_notification(subscription, payload):
            sent += 1
    return sent


def notify_task_created(conn, task: dict[str, Any], actor: dict[str, Any]) -> None:
    actor_name = actor.get("display_name") or actor.get("email") or "Пользователь"
    payload = {
        "title": "Новая задача",
        "body": f"{actor_name}: {task['title']}",
        "url": "/dashboard.html",
        "tag": f"task-{task['id']}",
    }
    subscriptions = conn.execute("SELECT * FROM push_subscriptions ORDER BY id").fetchall()
    notify_push_subscriptions(subscriptions, payload)


@app.post("/auth/login")
async def login(request: Request, response: Response) -> dict[str, Any]:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE lower(email) = lower(%s) AND is_active = true",
            (email,),
        ).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        conn.execute("UPDATE users SET last_login_at = now() WHERE id = %s", (user["id"],))
        return issue_auth_response(conn, response, user)


@app.post("/auth/refresh")
def refresh_session(
    response: Response,
    dashboard_refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> dict[str, Any]:
    with db() as conn:
        user = refresh_user_from_cookie(conn, dashboard_refresh_token)
        if dashboard_refresh_token:
            conn.execute(
                "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
                (hash_token(dashboard_refresh_token),),
            )
        return issue_auth_response(conn, response, user)


@app.post("/auth/logout")
def logout(
    response: Response,
    dashboard_refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> dict[str, bool]:
    if dashboard_refresh_token:
        with db() as conn:
            conn.execute(
                "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
                (hash_token(dashboard_refresh_token),),
            )
    clear_refresh_cookie(response)
    return {"ok": True}


@app.post("/auth/mobile/login")
async def mobile_login(request: Request) -> dict[str, Any]:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE lower(email) = lower(%s) AND is_active = true",
            (email,),
        ).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        conn.execute("UPDATE users SET last_login_at = now() WHERE id = %s", (user["id"],))
        return issue_mobile_auth_response(conn, user)


@app.post("/auth/mobile/refresh")
async def mobile_refresh_session(request: Request) -> dict[str, Any]:
    payload = await request.json()
    refresh_token = payload.get("refreshToken") or ""
    with db() as conn:
        user = refresh_user_from_token(conn, refresh_token)
        return issue_mobile_auth_response(conn, user)


@app.post("/auth/mobile/logout")
async def mobile_logout(request: Request) -> dict[str, bool]:
    payload = await request.json()
    refresh_token = payload.get("refreshToken") or ""
    if refresh_token:
        with db() as conn:
            conn.execute(
                "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
                (hash_token(refresh_token),),
            )
    return {"ok": True}


@app.get("/auth/me")
def me(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    return user_json(user)


@app.get("/auth/users", dependencies=[Depends(require_admin)])
def list_users() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT id, email, display_name, role, is_active, created_at, last_login_at
            FROM users
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
        return [
            {
                **user_json(row),
                "createdAt": row["created_at"].isoformat(),
                "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
            }
            for row in rows
        ]


@app.patch("/auth/users/{user_id}")
async def update_user(
    user_id: int,
    request: Request,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    payload = await request.json()
    fields = []
    values = []

    if "displayName" in payload:
        display_name = (payload.get("displayName") or "").strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name is required")
        fields.append("display_name = %s")
        values.append(display_name)

    if "role" in payload:
        role = payload.get("role")
        if role not in {"admin", "member", "viewer"}:
            raise HTTPException(status_code=400, detail="Invalid role")
        fields.append("role = %s")
        values.append(role)

    if "isActive" in payload:
        is_active = bool(payload.get("isActive"))
        if user_id == admin["id"] and not is_active:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        fields.append("is_active = %s")
        values.append(is_active)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(user_id)
    with db() as conn:
        row = conn.execute(
            f"""
            UPDATE users
            SET {', '.join(fields)}, updated_at = now()
            WHERE id = %s
            RETURNING id, email, display_name, role, is_active, created_at, last_login_at
            """,
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            **user_json(row),
            "createdAt": row["created_at"].isoformat(),
            "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
        }


@app.get("/auth/invites", dependencies=[Depends(require_admin)])
def list_invites() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM invites
            ORDER BY created_at DESC, id DESC
            LIMIT 50
            """
        ).fetchall()
        return [invite_json(row) for row in rows]


@app.post("/auth/invites")
async def create_invite(
    request: Request,
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    role = payload.get("role") or "member"
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if role not in {"admin", "member", "viewer"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    token = secrets.token_urlsafe(32)
    expires_at = utcnow() + timedelta(days=7)
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")
        row = conn.execute(
            """
            INSERT INTO invites (email, token_hash, role, created_by, expires_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (email, hash_token(token), role, user["id"], expires_at),
        ).fetchone()
    return {
        **invite_json(row),
        "token": token,
        "inviteUrl": f"/dashboard.html?invite={token}",
    }


@app.get("/auth/invites/{token}")
def get_invite(token: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM invites
            WHERE token_hash = %s
              AND used_at IS NULL
              AND expires_at > now()
            """,
            (hash_token(token),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Приглашение не найдено или истекло")
        return {"email": row["email"], "role": row["role"], "expiresAt": row["expires_at"].isoformat()}


@app.post("/auth/register")
async def register(request: Request, response: Response) -> dict[str, Any]:
    payload = await request.json()
    token = payload.get("token") or ""
    display_name = (payload.get("displayName") or "").strip()
    password = payload.get("password") or ""
    if not token or not display_name or len(password) < 10:
        raise HTTPException(status_code=400, detail="Укажите имя и пароль не короче 10 символов")

    with db() as conn:
        invite = conn.execute(
            """
            SELECT *
            FROM invites
            WHERE token_hash = %s
              AND used_at IS NULL
              AND expires_at > now()
            FOR UPDATE
            """,
            (hash_token(token),),
        ).fetchone()
        if not invite:
            raise HTTPException(status_code=404, detail="Приглашение не найдено или истекло")
        existing = conn.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (invite["email"],)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")
        user = conn.execute(
            """
            INSERT INTO users (email, password_hash, display_name, role)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (invite["email"].lower(), hash_password(password), display_name, invite["role"]),
        ).fetchone()
        conn.execute("UPDATE invites SET used_at = now() WHERE id = %s", (invite["id"],))
        return issue_auth_response(conn, response, user)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/bootstrap", dependencies=[Depends(require_auth)])
def bootstrap() -> dict[str, Any]:
    with db() as conn:
        return fetch_all_data(conn)


@app.get("/push/vapid-public-key", dependencies=[Depends(require_auth)])
def push_public_key() -> dict[str, Any]:
    return {"enabled": push_is_configured(), "publicKey": VAPID_PUBLIC_KEY}


@app.post("/push/subscriptions")
async def save_push_subscription(
    request: Request,
    user: dict[str, Any] = Depends(require_auth),
) -> dict[str, bool]:
    payload = await request.json()
    endpoint = payload.get("endpoint") or ""
    keys = payload.get("keys") or {}
    p256dh = keys.get("p256dh") or ""
    auth = keys.get("auth") or ""
    if not endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Invalid push subscription")
    user_agent = request.headers.get("user-agent", "")[:500]
    with db() as conn:
        conn.execute(
            """
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (endpoint) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              p256dh = EXCLUDED.p256dh,
              auth = EXCLUDED.auth,
              user_agent = EXCLUDED.user_agent,
              updated_at = now()
            """,
            (user["id"], endpoint, p256dh, auth, user_agent),
        )
    return {"ok": True}


@app.delete("/push/subscriptions")
async def delete_push_subscription(
    request: Request,
    user: dict[str, Any] = Depends(require_auth),
) -> dict[str, bool]:
    payload = await request.json()
    endpoint = payload.get("endpoint") or ""
    if endpoint:
        with db() as conn:
            conn.execute("DELETE FROM push_subscriptions WHERE endpoint = %s AND user_id = %s", (endpoint, user["id"]))
    return {"ok": True}


@app.post("/push/test")
def test_push_notification(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    with db() as conn:
        subscriptions = conn.execute(
            "SELECT * FROM push_subscriptions WHERE user_id = %s ORDER BY id",
            (user["id"],),
        ).fetchall()
    sent = notify_push_subscriptions(
        subscriptions,
        {
            "title": "Пуши включены",
            "body": "Тестовое уведомление Dashboard доставлено.",
            "url": "/dashboard.html",
            "tag": "dashboard-push-test",
        },
    )
    return {"ok": True, "subscriptions": len(subscriptions), "sent": sent, "enabled": push_is_configured()}


def ambp_payload(payload: dict[str, Any]) -> tuple[Any, ...]:
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    return (
        title,
        (payload.get("description") or "").strip(),
        payload.get("planRevenue", payload.get("plan_revenue", 0)) or 0,
        payload.get("factRevenue", payload.get("fact_revenue", 0)) or 0,
        payload.get("funnelLeads", payload.get("funnel_leads", 0)) or 0,
        payload.get("funnelQualified", payload.get("funnel_qualified", 0)) or 0,
        payload.get("funnelProposals", payload.get("funnel_proposals", 0)) or 0,
        payload.get("funnelContracts", payload.get("funnel_contracts", 0)) or 0,
        (payload.get("comment") or "").strip(),
    )


@app.get("/ambp-topics", dependencies=[Depends(require_auth)])
def list_ambp_topics() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM ambp_topics ORDER BY id").fetchall()
        return [ambp_topic_json(item) for item in rows]


@app.post("/ambp-topics", dependencies=[Depends(require_auth)])
async def create_ambp_topic(request: Request) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO ambp_topics (
              title, description, plan_revenue, fact_revenue,
              funnel_leads, funnel_qualified, funnel_proposals, funnel_contracts, comment
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            ambp_payload(payload),
        ).fetchone()
        return ambp_topic_json(row)


@app.patch("/ambp-topics/{topic_id}", dependencies=[Depends(require_auth)])
async def update_ambp_topic(topic_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "title": "title",
        "description": "description",
        "planRevenue": "plan_revenue",
        "plan_revenue": "plan_revenue",
        "factRevenue": "fact_revenue",
        "fact_revenue": "fact_revenue",
        "funnelLeads": "funnel_leads",
        "funnel_leads": "funnel_leads",
        "funnelQualified": "funnel_qualified",
        "funnel_qualified": "funnel_qualified",
        "funnelProposals": "funnel_proposals",
        "funnel_proposals": "funnel_proposals",
        "funnelContracts": "funnel_contracts",
        "funnel_contracts": "funnel_contracts",
        "comment": "comment",
    }
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            value = payload[key]
            if column in {"title", "description", "comment"}:
                value = (value or "").strip()
            else:
                value = value or 0
            fields.append(f"{column} = %s")
            values.append(value)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(topic_id)
    with db() as conn:
        row = conn.execute(
            f"UPDATE ambp_topics SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="AMBP topic not found")
        return ambp_topic_json(row)


@app.delete("/ambp-topics/{topic_id}", dependencies=[Depends(require_auth)])
def delete_ambp_topic(topic_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute("DELETE FROM ambp_topics WHERE id = %s RETURNING id", (topic_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="AMBP topic not found")
        return {"ok": True}


@app.get("/development-tasks", dependencies=[Depends(require_auth)])
def list_development_tasks() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM development_tasks ORDER BY due NULLS LAST, id").fetchall()
        return [development_task_json(item) for item in rows]


@app.post("/development-tasks", dependencies=[Depends(require_auth)])
async def create_development_task(request: Request) -> dict[str, Any]:
    payload = await request.json()
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO development_tasks (title, description, result_image, success_metric, due, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                title,
                (payload.get("description") or "").strip(),
                (payload.get("resultImage", payload.get("result_image", "")) or "").strip(),
                (payload.get("successMetric", payload.get("success_metric", "")) or "").strip(),
                clean_date(payload.get("due")),
                (payload.get("status") or "").strip(),
            ),
        ).fetchone()
        return development_task_json(row)


@app.patch("/development-tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_development_task(task_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "title": "title",
        "description": "description",
        "resultImage": "result_image",
        "result_image": "result_image",
        "successMetric": "success_metric",
        "success_metric": "success_metric",
        "due": "due",
        "status": "status",
    }
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            value = clean_date(payload[key]) if key == "due" else (payload[key] or "").strip()
            fields.append(f"{column} = %s")
            values.append(value)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(task_id)
    with db() as conn:
        row = conn.execute(
            f"UPDATE development_tasks SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Development task not found")
        return development_task_json(row)


@app.delete("/development-tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_development_task(task_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute("DELETE FROM development_tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Development task not found")
        return {"ok": True}


@app.get("/tasks", dependencies=[Depends(require_auth)])
def list_tasks() -> list[dict[str, Any]]:
    with db() as conn:
        return [task_json(item) for item in conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()]


@app.post("/tasks")
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO tasks (title, description, priority, column_name, due, assignee_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                payload.get("priority", "Средний"),
                payload.get("column", "Беклог"),
                clean_date(payload.get("due")),
                payload.get("assigneeId"),
            ),
        ).fetchone()
        task = task_json(row)
        notify_task_created(conn, task, user)
        return task


@app.patch("/tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_task(task_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    existing = {
        "title": payload.get("title"),
        "description": payload.get("description"),
        "priority": payload.get("priority"),
        "column_name": payload.get("column"),
        "due": clean_date(payload.get("due")) if "due" in payload else None,
        "assignee_id": payload.get("assigneeId") if "assigneeId" in payload else None,
    }
    fields = []
    values = []
    for column, value in existing.items():
        source_key = "column" if column == "column_name" else "assigneeId" if column == "assignee_id" else column
        if source_key in payload:
            fields.append(f"{column} = %s")
            values.append(value)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(task_id)
    with db() as conn:
        row = conn.execute(
            f"UPDATE tasks SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        return task_json(row)


@app.delete("/tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_task(task_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute("DELETE FROM tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"ok": True}


@app.get("/events", dependencies=[Depends(require_auth)])
def list_events() -> list[dict[str, Any]]:
    with db() as conn:
        return [event_json(item) for item in conn.execute("SELECT * FROM events ORDER BY month, day, id").fetchall()]


@app.post("/events", dependencies=[Depends(require_auth)])
async def create_event(request: Request) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO events (title, description, month, day, type, done)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                payload.get("month"),
                payload.get("day"),
                payload.get("type", "Совещание"),
                payload.get("done", False),
            ),
        ).fetchone()
        return event_json(row)


@app.patch("/events/{event_id}", dependencies=[Depends(require_auth)])
async def update_event(event_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    allowed = {"title": "title", "description": "description", "month": "month", "day": "day", "type": "type", "done": "done"}
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            fields.append(f"{column} = %s")
            values.append(payload[key])
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(event_id)
    with db() as conn:
        row = conn.execute(
            f"UPDATE events SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        return event_json(row)


@app.delete("/events/{event_id}", dependencies=[Depends(require_auth)])
def delete_event(event_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute("DELETE FROM events WHERE id = %s RETURNING id", (event_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Event not found")
        return {"ok": True}


@app.post("/events/{event_id}/tasks", dependencies=[Depends(require_auth)])
async def create_event_task(event_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO event_tasks (event_id, title, description, assignee_id, due, done)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                event_id,
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                payload.get("assigneeId"),
                clean_date(payload.get("due")),
                payload.get("done", False),
            ),
        ).fetchone()
        return event_task_json(row)


@app.patch("/events/{event_id}/tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_event_task(event_id: int, task_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    allowed = {"title": "title", "description": "description", "assigneeId": "assignee_id", "due": "due", "done": "done"}
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            fields.append(f"{column} = %s")
            values.append(clean_date(payload[key]) if key == "due" else payload[key])
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.extend([event_id, task_id])
    with db() as conn:
        row = conn.execute(
            f"UPDATE event_tasks SET {', '.join(fields)}, updated_at = now() WHERE event_id = %s AND id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event task not found")
        return event_task_json(row)


@app.delete("/events/{event_id}/tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_event_task(event_id: int, task_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute(
            "DELETE FROM event_tasks WHERE event_id = %s AND id = %s RETURNING id",
            (event_id, task_id),
        ).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Event task not found")
        return {"ok": True}


@app.get("/sync-stickers", dependencies=[Depends(require_auth)])
def list_stickers() -> list[dict[str, Any]]:
    with db() as conn:
        return [sticker_json(item) for item in conn.execute("SELECT * FROM sync_stickers ORDER BY id").fetchall()]


@app.post("/sync-stickers", dependencies=[Depends(require_auth)])
async def create_sticker(request: Request) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO sync_stickers (speaker, topic, text, color_id, x, y, width, height)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                payload.get("speaker", "Без спикера"),
                payload.get("topic", "").strip(),
                payload.get("text", ""),
                payload.get("colorId", "sky"),
                payload.get("x", 24),
                payload.get("y", 24),
                payload.get("width", 236),
                payload.get("height", 188),
            ),
        ).fetchone()
        return sticker_json(row)


@app.patch("/sync-stickers/{sticker_id}", dependencies=[Depends(require_auth)])
async def update_sticker(sticker_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "speaker": "speaker",
        "topic": "topic",
        "text": "text",
        "colorId": "color_id",
        "x": "x",
        "y": "y",
        "width": "width",
        "height": "height",
    }
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            fields.append(f"{column} = %s")
            values.append(payload[key])
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(sticker_id)
    with db() as conn:
        row = conn.execute(
            f"UPDATE sync_stickers SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Sticker not found")
        return sticker_json(row)


@app.delete("/sync-stickers/{sticker_id}", dependencies=[Depends(require_auth)])
def delete_sticker(sticker_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute("DELETE FROM sync_stickers WHERE id = %s RETURNING id", (sticker_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Sticker not found")
        return {"ok": True}


def save_ucp_relations(conn, task_id: int, member_ids: list[int], checkpoints: list[dict[str, Any]]) -> None:
    conn.execute("DELETE FROM ucp_task_members WHERE task_id = %s", (task_id,))
    for member_id in member_ids:
        conn.execute("INSERT INTO ucp_task_members (task_id, member_id) VALUES (%s, %s)", (task_id, member_id))

    conn.execute("DELETE FROM ucp_checkpoints WHERE task_id = %s", (task_id,))
    for checkpoint in checkpoints:
        conn.execute(
            "INSERT INTO ucp_checkpoints (task_id, label, date, evidence_materials) VALUES (%s, %s, %s, %s)",
            (
                task_id,
                checkpoint.get("label", "").strip(),
                clean_date(checkpoint.get("date")),
                (checkpoint.get("evidenceMaterials", checkpoint.get("evidence_materials", "")) or "").strip(),
            ),
        )


def fetch_ucp_task(conn, task_id: int) -> dict[str, Any]:
    task = conn.execute("SELECT * FROM ucp_tasks WHERE id = %s", (task_id,)).fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="UCP task not found")
    members = conn.execute(
        "SELECT member_id FROM ucp_task_members WHERE task_id = %s ORDER BY member_id",
        (task_id,),
    ).fetchall()
    checkpoints = conn.execute(
        "SELECT * FROM ucp_checkpoints WHERE task_id = %s ORDER BY id",
        (task_id,),
    ).fetchall()
    return ucp_task_json(task, checkpoints, [item["member_id"] for item in members])


@app.get("/ucp/tasks", dependencies=[Depends(require_auth)])
def list_ucp_tasks() -> list[dict[str, Any]]:
    with db() as conn:
        return fetch_all_data(conn)["ucpTasks"]


@app.post("/ucp/tasks", dependencies=[Depends(require_auth)])
async def create_ucp_task(request: Request) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            "INSERT INTO ucp_tasks (title, description) VALUES (%s, %s) RETURNING *",
            (payload.get("title", "").strip(), payload.get("description", "").strip()),
        ).fetchone()
        save_ucp_relations(conn, row["id"], payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_ucp_task(conn, row["id"])


@app.patch("/ucp/tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_ucp_task(task_id: int, request: Request) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            UPDATE ucp_tasks
            SET title = %s, description = %s, updated_at = now()
            WHERE id = %s
            RETURNING *
            """,
            (payload.get("title", "").strip(), payload.get("description", "").strip(), task_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="UCP task not found")
        save_ucp_relations(conn, task_id, payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_ucp_task(conn, task_id)


@app.delete("/ucp/tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_ucp_task(task_id: int) -> dict[str, bool]:
    with db() as conn:
        deleted = conn.execute("DELETE FROM ucp_tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="UCP task not found")
        return {"ok": True}
