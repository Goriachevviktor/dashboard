from datetime import date, datetime
from typing import Any

from fastapi import HTTPException

from .db import db


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


def normalize_member_ids(conn, value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    ids: list[int] = []
    for item in value:
        try:
            uid = int(item)
        except (TypeError, ValueError):
            continue
        if uid > 0 and uid not in ids:
            ids.append(uid)
    if not ids:
        return []
    rows = conn.execute(
        "SELECT id FROM users WHERE is_active = true AND id = ANY(%s) ORDER BY id",
        (ids,),
    ).fetchall()
    valid = {row["id"] for row in rows}
    return [uid for uid in ids if uid in valid]


def normalize_task_column(value: Any) -> str:
    column = (value or "Беклог").strip()
    if column == "Готово":
        return "Готов"
    if column in ("Беклог", "В работе", "Готов", "Архив"):
        return column
    return "Беклог"


def is_done_column(column: Any) -> bool:
    return column in ("Готов", "Готово")


def resolve_owner_id(conn, user: dict[str, Any]) -> int | None:
    user_id = int(user.get("id") or 0)
    if user_id > 0:
        return user_id
    admin_owner = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").fetchone()
    if admin_owner:
        return admin_owner["id"]
    fallback_owner = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    return fallback_owner["id"] if fallback_owner else None


def resolve_active_user_id(conn, value: Any) -> int:
    try:
        user_id = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid owner")
    row = conn.execute("SELECT id FROM users WHERE id = %s AND is_active = true", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Owner not found")
    return row["id"]


def can_change_owner(existing_owner_id: Any, payload_owner_id: Any, user: dict[str, Any]) -> bool:
    if user["role"] == "admin":
        return True
    try:
        return int(payload_owner_id) == int(existing_owner_id)
    except (TypeError, ValueError):
        return False


def can_edit_task(row: dict[str, Any], user: dict[str, Any]) -> bool:
    return user["role"] == "admin" or row["owner_id"] == user["id"] or row["assignee_id"] == user["id"]


def can_delete_task(row: dict[str, Any], user: dict[str, Any]) -> bool:
    return user["role"] == "admin" or row["owner_id"] == user["id"]


def can_manage_owner_row(row: dict[str, Any], user: dict[str, Any]) -> bool:
    return user["role"] == "admin" or row["owner_id"] == user["id"]


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
