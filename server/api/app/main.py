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


def generate_temporary_password(length: int = 12) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


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
              last_login_at timestamptz,
              login_count integer NOT NULL DEFAULT 0,
              last_seen_at timestamptz,
              activity_count integer NOT NULL DEFAULT 0
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
        conn.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0")
        conn.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz")
        conn.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS activity_count integer NOT NULL DEFAULT 0")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_activity_daily (
              user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              activity_date date NOT NULL,
              activity_count integer NOT NULL DEFAULT 0,
              last_seen_at timestamptz NOT NULL DEFAULT now(),
              PRIMARY KEY (user_id, activity_date)
            )
            """
        )
        owner_scoped_tables = ("tasks", "event_tasks", "events", "sync_stickers", "ucp_tasks", "development_tasks", "ambp_topics")
        for table_name in owner_scoped_tables:
            conn.execute(f"ALTER TABLE IF EXISTS {table_name} ADD COLUMN IF NOT EXISTS owner_id integer REFERENCES users(id) ON DELETE SET NULL")
        conn.execute("ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS assignee_id integer")
        conn.execute("ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz")
        conn.execute("UPDATE tasks SET completed_at = COALESCE(completed_at, updated_at, now()) WHERE column_name IN ('Готов', 'Готово')")
        conn.execute("ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey")
        conn.execute("UPDATE tasks SET assignee_id = NULL WHERE assignee_id IS NOT NULL AND assignee_id NOT IN (SELECT id FROM users)")
        conn.execute("ALTER TABLE IF EXISTS tasks ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL")
        conn.execute("ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS tasks_column_name_check")
        conn.execute("ALTER TABLE IF EXISTS tasks ADD CONSTRAINT tasks_column_name_check CHECK (column_name IN ('Беклог', 'В работе', 'Готов', 'Готово', 'Архив'))")
        conn.execute("UPDATE tasks SET column_name = 'Готов' WHERE column_name = 'Готово'")
        conn.execute("UPDATE tasks SET column_name = 'Архив' WHERE column_name = 'Готов' AND completed_at <= now() - interval '7 days'")
        conn.execute("ALTER TABLE IF EXISTS event_tasks ADD COLUMN IF NOT EXISTS assignee_id integer")
        conn.execute("ALTER TABLE IF EXISTS event_tasks DROP CONSTRAINT IF EXISTS event_tasks_assignee_id_fkey")
        conn.execute("UPDATE event_tasks SET assignee_id = NULL WHERE assignee_id IS NOT NULL AND assignee_id NOT IN (SELECT id FROM users)")
        conn.execute("ALTER TABLE IF EXISTS event_tasks ADD CONSTRAINT event_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL")
        conn.execute("ALTER TABLE IF EXISTS ucp_task_members ADD COLUMN IF NOT EXISTS member_id integer")
        conn.execute("ALTER TABLE IF EXISTS ucp_task_members DROP CONSTRAINT IF EXISTS ucp_task_members_member_id_fkey")
        conn.execute("DELETE FROM ucp_task_members WHERE member_id IS NOT NULL AND member_id NOT IN (SELECT id FROM users)")
        conn.execute("ALTER TABLE IF EXISTS ucp_task_members ADD CONSTRAINT ucp_task_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE")
        conn.execute("ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS description text")
        conn.execute("ALTER TABLE IF EXISTS event_tasks ADD COLUMN IF NOT EXISTS description text")
        conn.execute("ALTER TABLE IF EXISTS ucp_tasks ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false")
        conn.execute("ALTER TABLE IF EXISTS ucp_checkpoints ADD COLUMN IF NOT EXISTS evidence_materials text NOT NULL DEFAULT ''")
        conn.execute("ALTER TABLE IF EXISTS ucp_checkpoints ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false")
        conn.execute("ALTER TABLE IF EXISTS development_tasks ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false")
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
              done boolean NOT NULL DEFAULT false,
              owner_id integer REFERENCES users(id) ON DELETE SET NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS development_task_checkpoints (
              id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              task_id integer NOT NULL REFERENCES development_tasks(id) ON DELETE CASCADE,
              label text NOT NULL DEFAULT '',
              date date,
              done boolean NOT NULL DEFAULT false
            )
            """
        )
        conn.execute("ALTER TABLE IF EXISTS development_task_checkpoints ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS development_task_members (
              task_id integer NOT NULL REFERENCES development_tasks(id) ON DELETE CASCADE,
              member_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              PRIMARY KEY (task_id, member_id)
            )
            """
        )
        conn.execute("ALTER TABLE IF EXISTS development_task_members ADD COLUMN IF NOT EXISTS member_id integer")
        conn.execute("ALTER TABLE IF EXISTS development_task_members DROP CONSTRAINT IF EXISTS development_task_members_member_id_fkey")
        conn.execute("DELETE FROM development_task_members WHERE member_id IS NOT NULL AND member_id NOT IN (SELECT id FROM users)")
        conn.execute("ALTER TABLE IF EXISTS development_task_members ADD CONSTRAINT development_task_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE")
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
              owner_id integer REFERENCES users(id) ON DELETE SET NULL,
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
        admin_owner = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").fetchone()
        if not admin_owner:
            admin_owner = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
        if admin_owner:
            for table_name in owner_scoped_tables:
                conn.execute(f"UPDATE {table_name} SET owner_id = %s WHERE owner_id IS NULL", (admin_owner["id"],))
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
        admin_owner = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").fetchone()
        if admin_owner:
            for table_name in owner_scoped_tables:
                conn.execute(f"UPDATE {table_name} SET owner_id = %s WHERE owner_id IS NULL", (admin_owner["id"],))


@app.on_event("startup")
def startup() -> None:
    migrate_auth_schema()


def record_user_activity(conn, user: dict[str, Any]) -> None:
    user_id = user.get("id")
    if not user_id:
        return
    conn.execute(
        "UPDATE users SET last_seen_at = now(), activity_count = activity_count + 1 WHERE id = %s",
        (user_id,),
    )
    conn.execute(
        """
        INSERT INTO user_activity_daily (user_id, activity_date, activity_count, last_seen_at)
        VALUES (%s, CURRENT_DATE, 1, now())
        ON CONFLICT (user_id, activity_date)
        DO UPDATE SET activity_count = user_activity_daily.activity_count + 1, last_seen_at = now()
        """,
        (user_id,),
    )


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
        record_user_activity(conn, user)
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


def clean_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "да", "готово", "done", "complete", "completed"}
    return bool(value)


def iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, date) else value


def normalize_task_column(value: Any) -> str:
    column = (value or "Беклог").strip()
    if column == "Готово":
        return "Готов"
    if column in ("Беклог", "В работе", "Готов", "Архив"):
        return column
    return "Беклог"


def is_done_column(column: Any) -> bool:
    return column in ("Готов", "Готово")


def archive_expired_done_tasks(conn) -> None:
    conn.execute(
        """
        UPDATE tasks
        SET column_name = 'Архив', updated_at = now()
        WHERE column_name IN ('Готов', 'Готово')
          AND completed_at IS NOT NULL
          AND completed_at <= now() - interval '7 days'
        """
    )


def task_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "priority": row["priority"],
        "column": row["column_name"],
        "due": iso(row["due"]) or "",
        "completedAt": row["completed_at"].isoformat() if row.get("completed_at") else None,
        "ownerId": row["owner_id"],
        "assigneeId": row["assignee_id"],
    }


def visible_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    archive_expired_done_tasks(conn)
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
    return conn.execute(
        "SELECT * FROM tasks WHERE owner_id = %s OR assignee_id = %s ORDER BY id",
        (user["id"], user["id"]),
    ).fetchall()


def visible_event_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM event_tasks ORDER BY event_id, id").fetchall()
    return conn.execute(
        "SELECT * FROM event_tasks WHERE owner_id = %s OR assignee_id = %s ORDER BY event_id, id",
        (user["id"], user["id"]),
    ).fetchall()


def can_edit_task(row: dict[str, Any], user: dict[str, Any]) -> bool:
    return user["role"] == "admin" or row["owner_id"] == user["id"] or row["assignee_id"] == user["id"]


def can_delete_task(row: dict[str, Any], user: dict[str, Any]) -> bool:
    return user["role"] == "admin" or row["owner_id"] == user["id"]


def resolve_owner_id(conn, user: dict[str, Any]) -> int | None:
    user_id = int(user.get("id") or 0)
    if user_id > 0:
        return user_id
    admin_owner = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").fetchone()
    if admin_owner:
        return admin_owner["id"]
    fallback_owner = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    return fallback_owner["id"] if fallback_owner else None


OWNER_SCOPED_TABLES = {"sync_stickers", "development_tasks", "ambp_topics"}
OWNER_SCOPED_ORDER = {
    "sync_stickers": "id",
    "development_tasks": "due NULLS LAST, id",
    "ambp_topics": "id",
}


def visible_owner_rows(conn, table: str, user: dict[str, Any]) -> list[dict[str, Any]]:
    if table not in OWNER_SCOPED_TABLES:
        raise ValueError(f"Unsupported owner-scoped table: {table}")
    order_by = OWNER_SCOPED_ORDER[table]
    if user["role"] == "admin":
        return conn.execute(f"SELECT * FROM {table} ORDER BY {order_by}").fetchall()
    return conn.execute(
        f"SELECT * FROM {table} WHERE owner_id = %s ORDER BY {order_by}",
        (user["id"],),
    ).fetchall()


def can_manage_owner_row(row: dict[str, Any], user: dict[str, Any]) -> bool:
    return user["role"] == "admin" or row["owner_id"] == user["id"]


def ensure_event_members_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS event_members (
          event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (event_id, user_id)
        )
        """
    )


def visible_events(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    ensure_event_members_table(conn)
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM events ORDER BY month, day, id").fetchall()
    return conn.execute(
        """
        SELECT DISTINCT events.*
        FROM events
        LEFT JOIN event_tasks ON event_tasks.event_id = events.id
        LEFT JOIN event_members ON event_members.event_id = events.id
        WHERE events.owner_id = %s
           OR event_tasks.owner_id = %s
           OR event_tasks.assignee_id = %s
           OR event_members.user_id = %s
        ORDER BY events.month, events.day, events.id
        """,
        (user["id"], user["id"], user["id"], user["id"]),
    ).fetchall()


def event_member_map(conn, event_ids: list[int]) -> dict[int, list[int]]:
    ensure_event_members_table(conn)
    if not event_ids:
        return {}
    rows = conn.execute(
        "SELECT event_id, user_id FROM event_members WHERE event_id = ANY(%s) ORDER BY event_id, user_id",
        (event_ids,),
    ).fetchall()
    result: dict[int, list[int]] = {}
    for row in rows:
        result.setdefault(row["event_id"], []).append(row["user_id"])
    return result


def clean_member_ids(conn, value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    ids = []
    for item in value:
        try:
            user_id = int(item)
        except (TypeError, ValueError):
            continue
        if user_id > 0 and user_id not in ids:
            ids.append(user_id)
    if not ids:
        return []
    rows = conn.execute(
        "SELECT id FROM users WHERE is_active = true AND id = ANY(%s) ORDER BY id",
        (ids,),
    ).fetchall()
    valid = {row["id"] for row in rows}
    return [user_id for user_id in ids if user_id in valid]


def sync_event_members(conn, event_id: int, member_ids: list[int]) -> list[int]:
    ensure_event_members_table(conn)
    conn.execute("DELETE FROM event_members WHERE event_id = %s", (event_id,))
    for member_id in member_ids:
        conn.execute(
            "INSERT INTO event_members (event_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (event_id, member_id),
        )
    return member_ids


def visible_ucp_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM ucp_tasks ORDER BY id").fetchall()
    return conn.execute(
        """
        SELECT DISTINCT ucp_tasks.*
        FROM ucp_tasks
        LEFT JOIN ucp_task_members ON ucp_task_members.task_id = ucp_tasks.id
        WHERE ucp_tasks.owner_id = %s OR ucp_task_members.member_id = %s
        ORDER BY ucp_tasks.id
        """,
        (user["id"], user["id"]),
    ).fetchall()


def can_view_ucp_task(conn, task_id: int, user: dict[str, Any]) -> bool:
    if user["role"] == "admin":
        return True
    row = conn.execute(
        """
        SELECT ucp_tasks.id
        FROM ucp_tasks
        LEFT JOIN ucp_task_members ON ucp_task_members.task_id = ucp_tasks.id
        WHERE ucp_tasks.id = %s AND (ucp_tasks.owner_id = %s OR ucp_task_members.member_id = %s)
        LIMIT 1
        """,
        (task_id, user["id"], user["id"]),
    ).fetchone()
    return bool(row)


def visible_development_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM development_tasks ORDER BY due NULLS LAST, id").fetchall()
    return conn.execute(
        """
        SELECT DISTINCT development_tasks.*
        FROM development_tasks
        LEFT JOIN development_task_members ON development_task_members.task_id = development_tasks.id
        WHERE development_tasks.owner_id = %s OR development_task_members.member_id = %s
        ORDER BY development_tasks.due NULLS LAST, development_tasks.id
        """,
        (user["id"], user["id"]),
    ).fetchall()


def can_view_development_task(conn, task_id: int, user: dict[str, Any]) -> bool:
    if user["role"] == "admin":
        return True
    row = conn.execute(
        """
        SELECT development_tasks.id
        FROM development_tasks
        LEFT JOIN development_task_members ON development_task_members.task_id = development_tasks.id
        WHERE development_tasks.id = %s AND (development_tasks.owner_id = %s OR development_task_members.member_id = %s)
        LIMIT 1
        """,
        (task_id, user["id"], user["id"]),
    ).fetchone()
    return bool(row)


def event_json(row: dict[str, Any], member_ids: list[int] | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row.get("description") or "",
        "month": row["month"],
        "day": row["day"],
        "type": row["type"],
        "done": row["done"],
        "ownerId": row.get("owner_id"),
        "memberIds": member_ids or [],
        "generated": bool(row.get("generated", False)),
        "source": row.get("source") or "events",
        "sourceKind": row.get("source_kind") or "event",
        "sourceTaskId": row.get("source_task_id"),
        "sourceCheckpointId": row.get("source_checkpoint_id"),
    }


def event_task_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row.get("description") or "",
        "ownerId": row["owner_id"],
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
        "ownerId": row.get("owner_id"),
    }


def ucp_task_json(row: dict[str, Any], checkpoints: list[dict[str, Any]], members: list[int]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "done": bool(row.get("done")),
        "ownerId": row.get("owner_id"),
        "memberIds": members,
        "checkpoints": [
            {
                "id": item["id"],
                "label": item["label"] or "",
                "date": iso(item["date"]) or "",
                "evidenceMaterials": item.get("evidence_materials") or "",
                "done": bool(item.get("done")),
            }
            for item in checkpoints
        ],
    }


def development_task_json(row: dict[str, Any], checkpoints: list[dict[str, Any]] | None = None, members: list[int] | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "resultImage": row["result_image"] or "",
        "successMetric": row["success_metric"] or "",
        "due": iso(row["due"]) or "",
        "status": row["status"] or "",
        "done": bool(row.get("done")),
        "ownerId": row.get("owner_id"),
        "memberIds": members or [],
        "checkpoints": [
            {
                "id": item["id"],
                "label": item["label"] or "",
                "date": iso(item["date"]) or "",
                "done": bool(item.get("done")),
            }
            for item in (checkpoints or [])
        ],
    }


def roadmap_date_parts(value: Any) -> tuple[int, int] | None:
    if not value:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.month - 1, value.day
    try:
        parsed = datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None
    return parsed.month - 1, parsed.day


def is_development_task_done(row: dict[str, Any]) -> bool:
    if row.get("done"):
        return True
    status = (row.get("status") or "").strip().lower()
    return any(marker in status for marker in ("заверш", "готов", "выполн", "done", "complete"))


def generated_roadmap_events(
    ucp_tasks: list[dict[str, Any]],
    ucp_checkpoints: list[dict[str, Any]],
    development_tasks: list[dict[str, Any]],
    development_checkpoints: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    ucp_ids = {item["id"] for item in ucp_tasks}
    ucp_title_by_id = {item["id"]: item["title"] for item in ucp_tasks}
    generated: list[dict[str, Any]] = []

    for checkpoint in ucp_checkpoints:
        task_id = checkpoint["task_id"]
        if task_id not in ucp_ids:
            continue
        parts = roadmap_date_parts(checkpoint.get("date"))
        if not parts:
            continue
        label = (checkpoint.get("label") or "Контрольная точка").strip() or "Контрольная точка"
        task_title = ucp_title_by_id.get(task_id) or "УПЦ"
        generated.append(
            {
                "id": f"ucp-checkpoint-{checkpoint['id']}",
                "title": f"{task_title}: {label}",
                "description": checkpoint.get("evidence_materials") or "Автоматически добавлено из раздела УПЦ",
                "month": parts[0],
                "day": parts[1],
                "type": "УПЦ",
                "done": bool(checkpoint.get("done")),
                "owner_id": next((item.get("owner_id") for item in ucp_tasks if item["id"] == task_id), None),
                "generated": True,
                "source": "ucp",
                "source_kind": "checkpoint",
                "source_task_id": task_id,
                "source_checkpoint_id": checkpoint["id"],
            }
        )

    development_ids = {item["id"] for item in development_tasks}
    development_title_by_id = {item["id"]: item["title"] for item in development_tasks}

    for task in development_tasks:
        parts = roadmap_date_parts(task.get("due"))
        if not parts:
            continue
        generated.append(
            {
                "id": f"development-task-{task['id']}",
                "title": task["title"],
                "description": task.get("description") or task.get("success_metric") or "Автоматически добавлено из раздела План развития",
                "month": parts[0],
                "day": parts[1],
                "type": "План развития",
                "done": is_development_task_done(task),
                "owner_id": task.get("owner_id"),
                "generated": True,
                "source": "development",
                "source_kind": "task",
                "source_task_id": task["id"],
                "source_checkpoint_id": None,
            }
        )

    for checkpoint in development_checkpoints or []:
        task_id = checkpoint["task_id"]
        if task_id not in development_ids:
            continue
        parts = roadmap_date_parts(checkpoint.get("date"))
        if not parts:
            continue
        label = (checkpoint.get("label") or "Контрольная точка").strip() or "Контрольная точка"
        task_title = development_title_by_id.get(task_id) or "План развития"
        generated.append(
            {
                "id": f"development-checkpoint-{checkpoint['id']}",
                "title": f"{task_title}: {label}",
                "description": "Автоматически добавлено из раздела План развития",
                "month": parts[0],
                "day": parts[1],
                "type": "План развития",
                "done": bool(checkpoint.get("done")),
                "owner_id": next((item.get("owner_id") for item in development_tasks if item["id"] == task_id), None),
                "generated": True,
                "source": "development",
                "source_kind": "checkpoint",
                "source_task_id": task_id,
                "source_checkpoint_id": checkpoint["id"],
            }
        )

    return sorted(generated, key=lambda item: (item["month"], item["day"], str(item["id"])))


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
        "ownerId": row.get("owner_id"),
    }


def fetch_all_data(conn, user: dict[str, Any]) -> dict[str, Any]:
    team = conn.execute(
        """
        SELECT id, email, display_name as name
        FROM users
        WHERE is_active = true
        ORDER BY display_name, id
        """
    ).fetchall()
    tasks = visible_tasks(conn, user)
    events = visible_events(conn, user)
    event_tasks = visible_event_tasks(conn, user)
    stickers = visible_owner_rows(conn, "sync_stickers", user)
    ucp_tasks = visible_ucp_tasks(conn, user)
    development_tasks = visible_development_tasks(conn, user)
    development_task_ids = [item["id"] for item in development_tasks]
    development_checkpoints = conn.execute(
        "SELECT * FROM development_task_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
        (development_task_ids or [0],),
    ).fetchall()
    development_members = conn.execute(
        "SELECT task_id, member_id FROM development_task_members WHERE task_id = ANY(%s) ORDER BY task_id, member_id",
        (development_task_ids or [0],),
    ).fetchall()
    ambp_topics = visible_owner_rows(conn, "ambp_topics", user)
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

    development_checkpoint_map: dict[int, list[dict[str, Any]]] = {}
    for item in development_checkpoints:
        development_checkpoint_map.setdefault(item["task_id"], []).append(item)

    development_member_map: dict[int, list[int]] = {}
    for item in development_members:
        development_member_map.setdefault(item["task_id"], []).append(item["member_id"])

    event_members = event_member_map(conn, [item["id"] for item in events])

    return {
        "team": team,
        "tasks": [task_json(item) for item in tasks],
        "events": [event_json(item, event_members.get(item["id"], [])) for item in events] + [event_json(item) for item in generated_roadmap_events(ucp_tasks, ucp_checkpoints, development_tasks, development_checkpoints)],
        "eventTasks": event_task_map,
        "syncStickers": [sticker_json(item) for item in stickers],
        "ucpTasks": [
            ucp_task_json(item, checkpoint_map.get(item["id"], []), member_map.get(item["id"], []))
            for item in ucp_tasks
        ],
        "developmentTasks": [development_task_json(item, development_checkpoint_map.get(item["id"], []), development_member_map.get(item["id"], [])) for item in development_tasks],
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
    recipient_ids = [user_id for user_id in {task.get("ownerId"), task.get("assigneeId")} if user_id is not None]
    if not recipient_ids:
        return
    subscriptions = conn.execute(
        "SELECT * FROM push_subscriptions WHERE user_id = ANY(%s) ORDER BY id",
        (recipient_ids,),
    ).fetchall()
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
        conn.execute("UPDATE users SET last_login_at = now(), login_count = login_count + 1 WHERE id = %s", (user["id"],))
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
        conn.execute("UPDATE users SET last_login_at = now(), login_count = login_count + 1 WHERE id = %s", (user["id"],))
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
            SELECT
              users.id,
              users.email,
              users.display_name,
              users.role,
              users.is_active,
              users.created_at,
              users.last_login_at,
              users.login_count,
              users.last_seen_at,
              users.activity_count,
              COALESCE(activity_7d.activity_count, 0) AS activity_7d_count
            FROM users
            LEFT JOIN (
              SELECT user_id, SUM(activity_count)::integer AS activity_count
              FROM user_activity_daily
              WHERE activity_date >= CURRENT_DATE - interval '6 days'
              GROUP BY user_id
            ) activity_7d ON activity_7d.user_id = users.id
            ORDER BY users.created_at DESC, users.id DESC
            """
        ).fetchall()
        return [
            {
                **user_json(row),
                "createdAt": row["created_at"].isoformat(),
                "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
                "loginCount": row.get("login_count") or 0,
                "lastSeenAt": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
                "activityCount": row.get("activity_count") or 0,
                "activity7dCount": row.get("activity_7d_count") or 0,
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
            "loginCount": row.get("login_count") or 0,
            "lastSeenAt": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
            "activityCount": row.get("activity_count") or 0,
            "activity7dCount": 0,
        }


@app.post("/auth/users/{user_id}/reset-password", dependencies=[Depends(require_admin)])
def reset_user_password(user_id: int, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    temporary_password = generate_temporary_password()
    with db() as conn:
        row = conn.execute(
            """
            UPDATE users
            SET password_hash = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, email, display_name, role, is_active, created_at, last_login_at, login_count, last_seen_at, activity_count
            """,
            (hash_password(temporary_password), user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (user_id,))
        return {
            "temporaryPassword": temporary_password,
            "user": {
                **user_json(row),
                "createdAt": row["created_at"].isoformat(),
                "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
                "loginCount": row.get("login_count") or 0,
                "lastSeenAt": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
                "activityCount": row.get("activity_count") or 0,
                "activity7dCount": 0,
            },
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
def bootstrap(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    with db() as conn:
        return fetch_all_data(conn, user)


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
def list_ambp_topics(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return [ambp_topic_json(item) for item in visible_owner_rows(conn, "ambp_topics", user)]


@app.post("/ambp-topics", dependencies=[Depends(require_auth)])
async def create_ambp_topic(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO ambp_topics (
              title, description, plan_revenue, fact_revenue,
              funnel_leads, funnel_qualified, funnel_proposals, funnel_contracts, comment, owner_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (*ambp_payload(payload), resolve_owner_id(conn, user)),
        ).fetchone()
        return ambp_topic_json(row)


@app.patch("/ambp-topics/{topic_id}", dependencies=[Depends(require_auth)])
async def update_ambp_topic(topic_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
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
        existing = conn.execute("SELECT * FROM ambp_topics WHERE id = %s", (topic_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AMBP topic not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="AMBP topic access denied")
        row = conn.execute(
            f"UPDATE ambp_topics SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        return ambp_topic_json(row)


@app.delete("/ambp-topics/{topic_id}", dependencies=[Depends(require_auth)])
def delete_ambp_topic(topic_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM ambp_topics WHERE id = %s", (topic_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AMBP topic not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="AMBP topic access denied")
        conn.execute("DELETE FROM ambp_topics WHERE id = %s RETURNING id", (topic_id,)).fetchone()
        return {"ok": True}


def normalize_development_member_ids(conn, member_ids: list[int]) -> list[int]:
    if not member_ids:
        return []
    rows = conn.execute(
        "SELECT id FROM users WHERE is_active = true AND id = ANY(%s) ORDER BY id",
        (member_ids,),
    ).fetchall()
    valid_ids = {row["id"] for row in rows}
    return [member_id for member_id in member_ids if member_id in valid_ids]


def save_development_relations(conn, task_id: int, member_ids: list[int], checkpoints: list[dict[str, Any]]) -> None:
    normalized_member_ids = normalize_development_member_ids(conn, member_ids)
    conn.execute("DELETE FROM development_task_members WHERE task_id = %s", (task_id,))
    for member_id in normalized_member_ids:
        conn.execute("INSERT INTO development_task_members (task_id, member_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (task_id, member_id))

    conn.execute("DELETE FROM development_task_checkpoints WHERE task_id = %s", (task_id,))
    for checkpoint in checkpoints:
        conn.execute(
            "INSERT INTO development_task_checkpoints (task_id, label, date, done) VALUES (%s, %s, %s, %s)",
            (
                task_id,
                (checkpoint.get("label") or "").strip(),
                clean_date(checkpoint.get("date")),
                clean_bool(checkpoint.get("done")),
            ),
        )


def fetch_development_task(conn, task_id: int) -> dict[str, Any]:
    task = conn.execute("SELECT * FROM development_tasks WHERE id = %s", (task_id,)).fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="Development task not found")
    checkpoints = conn.execute(
        "SELECT * FROM development_task_checkpoints WHERE task_id = %s ORDER BY id",
        (task_id,),
    ).fetchall()
    members = conn.execute(
        "SELECT member_id FROM development_task_members WHERE task_id = %s ORDER BY member_id",
        (task_id,),
    ).fetchall()
    return development_task_json(task, checkpoints, [item["member_id"] for item in members])



@app.get("/development-tasks", dependencies=[Depends(require_auth)])
def list_development_tasks(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        tasks = visible_development_tasks(conn, user)
        task_ids = [item["id"] for item in tasks]
        checkpoints = conn.execute(
            "SELECT * FROM development_task_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
            (task_ids or [0],),
        ).fetchall()
        members = conn.execute(
            "SELECT task_id, member_id FROM development_task_members WHERE task_id = ANY(%s) ORDER BY task_id, member_id",
            (task_ids or [0],),
        ).fetchall()
        checkpoint_map: dict[int, list[dict[str, Any]]] = {}
        for item in checkpoints:
            checkpoint_map.setdefault(item["task_id"], []).append(item)
        member_map: dict[int, list[int]] = {}
        for item in members:
            member_map.setdefault(item["task_id"], []).append(item["member_id"])
        return [development_task_json(item, checkpoint_map.get(item["id"], []), member_map.get(item["id"], [])) for item in tasks]


@app.post("/development-tasks", dependencies=[Depends(require_auth)])
async def create_development_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO development_tasks (title, description, result_image, success_metric, due, status, done, owner_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                title,
                (payload.get("description") or "").strip(),
                (payload.get("resultImage", payload.get("result_image", "")) or "").strip(),
                (payload.get("successMetric", payload.get("success_metric", "")) or "").strip(),
                clean_date(payload.get("due")),
                payload.get("status") or "",
                clean_bool(payload.get("done")),
                resolve_owner_id(conn, user),
            ),
        ).fetchone()
        save_development_relations(conn, row["id"], payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_development_task(conn, row["id"])


@app.patch("/development-tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_development_task(task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
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
        "done": "done",
    }
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            if key == "due":
                value = clean_date(payload[key])
            elif key == "done":
                value = clean_bool(payload[key])
            elif key == "status":
                value = payload[key] or ""
            else:
                value = (payload[key] or "").strip()
            fields.append(f"{column} = %s")
            values.append(value)
    has_checkpoints = "checkpoints" in payload
    has_members = "memberIds" in payload
    if not fields and not has_checkpoints and not has_members:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(task_id)
    with db() as conn:
        existing = conn.execute("SELECT * FROM development_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Development task not found")
        if not can_view_development_task(conn, task_id, user):
            raise HTTPException(status_code=403, detail="Development task access denied")
        if fields:
            conn.execute(
                f"UPDATE development_tasks SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
                values,
            ).fetchone()
        else:
            conn.execute("UPDATE development_tasks SET updated_at = now() WHERE id = %s", (task_id,))
        if has_checkpoints or has_members:
            existing_members = conn.execute(
                "SELECT member_id FROM development_task_members WHERE task_id = %s ORDER BY member_id",
                (task_id,),
            ).fetchall()
            existing_checkpoints = conn.execute(
                "SELECT * FROM development_task_checkpoints WHERE task_id = %s ORDER BY id",
                (task_id,),
            ).fetchall()
            save_development_relations(
                conn,
                task_id,
                payload.get("memberIds", [item["member_id"] for item in existing_members]),
                payload.get("checkpoints", [dict(item) for item in existing_checkpoints]),
            )
        return fetch_development_task(conn, task_id)


@app.delete("/development-tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_development_task(task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM development_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Development task not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Development task access denied")
        conn.execute("DELETE FROM development_tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        return {"ok": True}


@app.get("/tasks", dependencies=[Depends(require_auth)])
def list_tasks(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return [task_json(item) for item in visible_tasks(conn, user)]


@app.post("/tasks")
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO tasks (title, description, priority, column_name, due, completed_at, owner_id, assignee_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                payload.get("priority", "Средний"),
                normalize_task_column(payload.get("column")),
                clean_date(payload.get("due")),
                utcnow() if is_done_column(normalize_task_column(payload.get("column"))) else None,
                resolve_owner_id(conn, user),
                payload.get("assigneeId"),
            ),
        ).fetchone()
        task = task_json(row)
        notify_task_created(conn, task, user)
        return task


@app.patch("/tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_task(task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "title": "title",
        "description": "description",
        "priority": "priority",
        "column": "column_name",
        "due": "due",
        "assigneeId": "assignee_id",
    }
    fields = []
    values = []
    with db() as conn:
        existing = conn.execute("SELECT * FROM tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        if not can_edit_task(existing, user):
            raise HTTPException(status_code=403, detail="Task access denied")
        for key, column in allowed.items():
            if key in payload:
                fields.append(f"{column} = %s")
                if key == "due":
                    values.append(clean_date(payload[key]))
                elif key == "column":
                    next_column = normalize_task_column(payload[key])
                    values.append(next_column)
                    if is_done_column(next_column):
                        fields.append("completed_at = COALESCE(completed_at, now())")
                    elif next_column != "Архив":
                        fields.append("completed_at = NULL")
                else:
                    values.append(payload[key])
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        values.append(task_id)
        row = conn.execute(
            f"UPDATE tasks SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        return task_json(row)


@app.delete("/tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_task(task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        if not can_delete_task(existing, user):
            raise HTTPException(status_code=403, detail="Task access denied")
        deleted = conn.execute("DELETE FROM tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"ok": True}


@app.patch("/roadmap/generated-events", dependencies=[Depends(require_auth)])
async def update_generated_roadmap_event(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    source = (payload.get("source") or "").strip()
    source_kind = (payload.get("sourceKind", payload.get("source_kind", "")) or "").strip()
    done = clean_bool(payload.get("done"))
    with db() as conn:
        if source == "ucp" and source_kind == "checkpoint":
            checkpoint_id = payload.get("sourceCheckpointId", payload.get("source_checkpoint_id"))
            checkpoint = conn.execute("SELECT * FROM ucp_checkpoints WHERE id = %s", (checkpoint_id,)).fetchone()
            if not checkpoint:
                raise HTTPException(status_code=404, detail="UCP checkpoint not found")
            if not can_view_ucp_task(conn, checkpoint["task_id"], user):
                raise HTTPException(status_code=403, detail="UCP checkpoint access denied")
            conn.execute("UPDATE ucp_checkpoints SET done = %s WHERE id = %s", (done, checkpoint["id"]))
            return {"source": source, "sourceKind": source_kind, "sourceTaskId": checkpoint["task_id"], "sourceCheckpointId": checkpoint["id"], "done": done}

        if source == "development" and source_kind == "task":
            task_id = payload.get("sourceTaskId", payload.get("source_task_id"))
            task = conn.execute("SELECT * FROM development_tasks WHERE id = %s", (task_id,)).fetchone()
            if not task:
                raise HTTPException(status_code=404, detail="Development task not found")
            if not can_view_development_task(conn, task["id"], user):
                raise HTTPException(status_code=403, detail="Development task access denied")
            conn.execute("UPDATE development_tasks SET done = %s, updated_at = now() WHERE id = %s", (done, task["id"]))
            return {"source": source, "sourceKind": source_kind, "sourceTaskId": task["id"], "sourceCheckpointId": None, "done": done}

        if source == "development" and source_kind == "checkpoint":
            checkpoint_id = payload.get("sourceCheckpointId", payload.get("source_checkpoint_id"))
            checkpoint = conn.execute("SELECT * FROM development_task_checkpoints WHERE id = %s", (checkpoint_id,)).fetchone()
            if not checkpoint:
                raise HTTPException(status_code=404, detail="Development checkpoint not found")
            task = conn.execute("SELECT * FROM development_tasks WHERE id = %s", (checkpoint["task_id"],)).fetchone()
            if not task:
                raise HTTPException(status_code=404, detail="Development task not found")
            if not can_view_development_task(conn, task["id"], user):
                raise HTTPException(status_code=403, detail="Development checkpoint access denied")
            conn.execute("UPDATE development_task_checkpoints SET done = %s WHERE id = %s", (done, checkpoint["id"]))
            return {"source": source, "sourceKind": source_kind, "sourceTaskId": checkpoint["task_id"], "sourceCheckpointId": checkpoint["id"], "done": done}

    raise HTTPException(status_code=400, detail="Unsupported generated roadmap source")


@app.get("/events", dependencies=[Depends(require_auth)])
def list_events(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        events = visible_events(conn, user)
        ucp_tasks = visible_ucp_tasks(conn, user)
        development_tasks = visible_development_tasks(conn, user)
        ucp_checkpoints = conn.execute("SELECT * FROM ucp_checkpoints ORDER BY task_id, id").fetchall()
        development_task_ids = [item["id"] for item in development_tasks]
        development_checkpoints = conn.execute(
            "SELECT * FROM development_task_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
            (development_task_ids or [0],),
        ).fetchall()
        members = event_member_map(conn, [item["id"] for item in events])
        return [event_json(item, members.get(item["id"], [])) for item in events] + [event_json(item) for item in generated_roadmap_events(ucp_tasks, ucp_checkpoints, development_tasks, development_checkpoints)]


@app.post("/events", dependencies=[Depends(require_auth)])
async def create_event(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO events (title, description, month, day, type, done, owner_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                payload.get("month"),
                payload.get("day"),
                payload.get("type", "Совещание"),
                payload.get("done", False),
                resolve_owner_id(conn, user),
            ),
        ).fetchone()
        members = sync_event_members(conn, row["id"], clean_member_ids(conn, payload.get("memberIds")))
        return event_json(row, members)


@app.patch("/events/{event_id}", dependencies=[Depends(require_auth)])
async def update_event(event_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {"title": "title", "description": "description", "month": "month", "day": "day", "type": "type", "done": "done"}
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            fields.append(f"{column} = %s")
            values.append(payload[key])
    with db() as conn:
        existing = conn.execute("SELECT * FROM events WHERE id = %s", (event_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Event access denied")
        row = existing
        if fields:
            values.append(event_id)
            row = conn.execute(
                f"UPDATE events SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
                values,
            ).fetchone()
        elif "memberIds" not in payload:
            raise HTTPException(status_code=400, detail="No fields to update")
        if "memberIds" in payload:
            members = sync_event_members(conn, event_id, clean_member_ids(conn, payload.get("memberIds")))
        else:
            members = event_member_map(conn, [event_id]).get(event_id, [])
        return event_json(row, members)


@app.delete("/events/{event_id}", dependencies=[Depends(require_auth)])
def delete_event(event_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM events WHERE id = %s", (event_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Event access denied")
        conn.execute("DELETE FROM events WHERE id = %s RETURNING id", (event_id,)).fetchone()
        return {"ok": True}


@app.post("/events/{event_id}/tasks", dependencies=[Depends(require_auth)])
async def create_event_task(event_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO event_tasks (event_id, title, description, owner_id, assignee_id, due, done)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                event_id,
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                resolve_owner_id(conn, user),
                payload.get("assigneeId"),
                clean_date(payload.get("due")),
                payload.get("done", False),
            ),
        ).fetchone()
        return event_task_json(row)


@app.patch("/events/{event_id}/tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_event_task(event_id: int, task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {"title": "title", "description": "description", "assigneeId": "assignee_id", "due": "due", "done": "done"}
    fields = []
    values = []
    with db() as conn:
        existing = conn.execute("SELECT * FROM event_tasks WHERE event_id = %s AND id = %s", (event_id, task_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event task not found")
        if not can_edit_task(existing, user):
            raise HTTPException(status_code=403, detail="Event task access denied")
        for key, column in allowed.items():
            if key in payload:
                fields.append(f"{column} = %s")
                if key == "due":
                    values.append(clean_date(payload[key]))
                elif key == "column":
                    next_column = normalize_task_column(payload[key])
                    values.append(next_column)
                    if is_done_column(next_column):
                        fields.append("completed_at = COALESCE(completed_at, now())")
                    elif next_column != "Архив":
                        fields.append("completed_at = NULL")
                else:
                    values.append(payload[key])
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        values.extend([event_id, task_id])
        row = conn.execute(
            f"UPDATE event_tasks SET {', '.join(fields)}, updated_at = now() WHERE event_id = %s AND id = %s RETURNING *",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event task not found")
        return event_task_json(row)


@app.delete("/events/{event_id}/tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_event_task(event_id: int, task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM event_tasks WHERE event_id = %s AND id = %s", (event_id, task_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event task not found")
        if not can_delete_task(existing, user):
            raise HTTPException(status_code=403, detail="Event task access denied")
        deleted = conn.execute(
            "DELETE FROM event_tasks WHERE event_id = %s AND id = %s RETURNING id",
            (event_id, task_id),
        ).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Event task not found")
        return {"ok": True}


@app.get("/sync-stickers", dependencies=[Depends(require_auth)])
def list_stickers(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return [sticker_json(item) for item in visible_owner_rows(conn, "sync_stickers", user)]


@app.post("/sync-stickers", dependencies=[Depends(require_auth)])
async def create_sticker(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO sync_stickers (speaker, topic, text, color_id, x, y, width, height, owner_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                resolve_owner_id(conn, user),
            ),
        ).fetchone()
        return sticker_json(row)


@app.patch("/sync-stickers/{sticker_id}", dependencies=[Depends(require_auth)])
async def update_sticker(sticker_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
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
        existing = conn.execute("SELECT * FROM sync_stickers WHERE id = %s", (sticker_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Sticker not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Sticker access denied")
        row = conn.execute(
            f"UPDATE sync_stickers SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        return sticker_json(row)


@app.delete("/sync-stickers/{sticker_id}", dependencies=[Depends(require_auth)])
def delete_sticker(sticker_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM sync_stickers WHERE id = %s", (sticker_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Sticker not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Sticker access denied")
        conn.execute("DELETE FROM sync_stickers WHERE id = %s RETURNING id", (sticker_id,)).fetchone()
        return {"ok": True}


def normalize_ucp_member_ids(conn, raw_member_ids: Any) -> list[int]:
    if not isinstance(raw_member_ids, list):
        return []
    member_ids: list[int] = []
    for raw_id in raw_member_ids:
        try:
            member_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if member_id not in member_ids:
            member_ids.append(member_id)
    if not member_ids:
        return []
    rows = conn.execute(
        "SELECT id FROM users WHERE is_active = true AND id = ANY(%s) ORDER BY id",
        (member_ids,),
    ).fetchall()
    valid_ids = {row["id"] for row in rows}
    return [member_id for member_id in member_ids if member_id in valid_ids]


def save_ucp_relations(conn, task_id: int, member_ids: list[int], checkpoints: list[dict[str, Any]]) -> None:
    normalized_member_ids = normalize_ucp_member_ids(conn, member_ids)
    conn.execute("DELETE FROM ucp_task_members WHERE task_id = %s", (task_id,))
    for member_id in normalized_member_ids:
        conn.execute("INSERT INTO ucp_task_members (task_id, member_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (task_id, member_id))

    conn.execute("DELETE FROM ucp_checkpoints WHERE task_id = %s", (task_id,))
    for checkpoint in checkpoints:
        conn.execute(
            "INSERT INTO ucp_checkpoints (task_id, label, date, evidence_materials, done) VALUES (%s, %s, %s, %s, %s)",
            (
                task_id,
                checkpoint.get("label", "").strip(),
                clean_date(checkpoint.get("date")),
                (checkpoint.get("evidenceMaterials", checkpoint.get("evidence_materials", "")) or "").strip(),
                clean_bool(checkpoint.get("done")),
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
def list_ucp_tasks(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return fetch_all_data(conn, user)["ucpTasks"]


@app.post("/ucp/tasks", dependencies=[Depends(require_auth)])
async def create_ucp_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            "INSERT INTO ucp_tasks (title, description, done, owner_id) VALUES (%s, %s, %s, %s) RETURNING *",
            (payload.get("title", "").strip(), payload.get("description", "").strip(), clean_bool(payload.get("done")), resolve_owner_id(conn, user)),
        ).fetchone()
        save_ucp_relations(conn, row["id"], payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_ucp_task(conn, row["id"])


@app.patch("/ucp/tasks/{task_id}", dependencies=[Depends(require_auth)])
async def update_ucp_task(task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        existing = conn.execute("SELECT * FROM ucp_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="UCP task not found")
        if not can_view_ucp_task(conn, task_id, user):
            raise HTTPException(status_code=403, detail="UCP task access denied")
        conn.execute(
            """
            UPDATE ucp_tasks
            SET title = %s, description = %s, done = %s, updated_at = now()
            WHERE id = %s
            RETURNING *
            """,
            (payload.get("title", "").strip(), payload.get("description", "").strip(), clean_bool(payload.get("done")), task_id),
        ).fetchone()
        save_ucp_relations(conn, task_id, payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_ucp_task(conn, task_id)


@app.delete("/ucp/tasks/{task_id}", dependencies=[Depends(require_auth)])
def delete_ucp_task(task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM ucp_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="UCP task not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="UCP task access denied")
        conn.execute("DELETE FROM ucp_tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        return {"ok": True}
