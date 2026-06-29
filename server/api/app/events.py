from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth
from .db import db
from .utils import (
    can_change_owner, can_delete_task, can_edit_task, can_manage_owner_row,
    clean_bool, clean_date, iso, normalize_member_ids,
    resolve_active_user_id, resolve_owner_id,
)

router = APIRouter()


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


def visible_events(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
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


def visible_event_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM event_tasks ORDER BY event_id, id").fetchall()
    return conn.execute(
        "SELECT * FROM event_tasks WHERE owner_id = %s OR assignee_id = %s ORDER BY event_id, id",
        (user["id"], user["id"]),
    ).fetchall()


def event_member_map(conn, event_ids: list[int]) -> dict[int, list[int]]:
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


def sync_event_members(conn, event_id: int, member_ids: list[int]) -> list[int]:
    conn.execute("DELETE FROM event_members WHERE event_id = %s", (event_id,))
    for member_id in member_ids:
        conn.execute(
            "INSERT INTO event_members (event_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (event_id, member_id),
        )
    return member_ids


@router.get("/events")
def list_events(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    from .ucp import visible_ucp_tasks
    from .development import visible_development_tasks, generated_roadmap_events
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


@router.post("/events")
async def create_event(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            "INSERT INTO events (title, description, month, day, type, done, owner_id) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
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
        members = sync_event_members(conn, row["id"], normalize_member_ids(conn, payload.get("memberIds")))
        return event_json(row, members)


@router.patch("/events/{event_id}")
async def update_event(event_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {"title": "title", "description": "description", "month": "month", "day": "day", "type": "type", "done": "done", "ownerId": "owner_id"}
    fields = []
    values = []
    with db() as conn:
        existing = conn.execute("SELECT * FROM events WHERE id = %s", (event_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Event access denied")
        for key, column in allowed.items():
            if key in payload:
                if key == "ownerId":
                    if not can_change_owner(existing.get("owner_id"), payload[key], user):
                        raise HTTPException(status_code=403, detail="Only admin can change owner")
                    if user["role"] != "admin":
                        continue
                    fields.append(f"{column} = %s")
                    values.append(resolve_active_user_id(conn, payload[key]))
                    continue
                fields.append(f"{column} = %s")
                values.append(payload[key])
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
            members = sync_event_members(conn, event_id, normalize_member_ids(conn, payload.get("memberIds")))
        else:
            members = event_member_map(conn, [event_id]).get(event_id, [])
        return event_json(row, members)


@router.delete("/events/{event_id}")
def delete_event(event_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM events WHERE id = %s", (event_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Event access denied")
        conn.execute("DELETE FROM events WHERE id = %s RETURNING id", (event_id,)).fetchone()
        return {"ok": True}


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


@router.patch("/events/{event_id}/tasks/{task_id}")
async def update_event_task(event_id: int, task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    from .utils import is_done_column, normalize_task_column
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
                elif key == "done":
                    values.append(clean_bool(payload[key]))
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


@router.delete("/events/{event_id}/tasks/{task_id}")
def delete_event_task(event_id: int, task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM event_tasks WHERE event_id = %s AND id = %s", (event_id, task_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event task not found")
        if not can_delete_task(existing, user):
            raise HTTPException(status_code=403, detail="Event task access denied")
        deleted = conn.execute("DELETE FROM event_tasks WHERE event_id = %s AND id = %s RETURNING id", (event_id, task_id)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Event task not found")
        return {"ok": True}
