
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth, utcnow
from .db import db
from .push import notify_task_created
from .utils import (
    can_change_owner, can_delete_task,
    clean_date, is_done_column, normalize_member_ids, normalize_task_column,
    resolve_active_user_id, resolve_owner_id,
)

router = APIRouter()


def task_json(row: dict[str, Any], member_ids: list[int] | None = None) -> dict[str, Any]:
    from .utils import iso
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "priority": row["priority"],
        "column": row["column_name"],
        "due": iso(row["due"]) or "",
        "completedAt": row["completed_at"].isoformat() if row.get("completed_at") else None,
        "creatorId": row.get("creator_id"),
        "ownerId": row["owner_id"],
        "assigneeId": row["assignee_id"],
        "memberIds": member_ids or [],
    }


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


def visible_tasks(conn, user: dict[str, Any]) -> list[dict[str, Any]]:
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
    return conn.execute(
        """
        SELECT DISTINCT tasks.*
        FROM tasks
        LEFT JOIN task_members ON task_members.task_id = tasks.id
        WHERE tasks.owner_id = %s OR tasks.assignee_id = %s OR task_members.member_id = %s
        ORDER BY tasks.id
        """,
        (user["id"], user["id"], user["id"]),
    ).fetchall()


def task_member_map(conn, task_ids: list[int]) -> dict[int, list[int]]:
    members = conn.execute(
        "SELECT task_id, member_id FROM task_members WHERE task_id = ANY(%s) ORDER BY task_id, member_id",
        (task_ids or [0],),
    ).fetchall()
    member_map: dict[int, list[int]] = {}
    for item in members:
        member_map.setdefault(item["task_id"], []).append(item["member_id"])
    return member_map


def sync_task_members(conn, task_id: int, owner_id: Any, assignee_id: Any, member_ids: Any) -> list[int]:
    normalized = normalize_member_ids(conn, member_ids)
    excluded_ids = set()
    for raw in (owner_id, assignee_id):
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            excluded_ids.add(value)
    filtered = [member_id for member_id in normalized if member_id not in excluded_ids]
    conn.execute("DELETE FROM task_members WHERE task_id = %s", (task_id,))
    for member_id in filtered:
        conn.execute(
            "INSERT INTO task_members (task_id, member_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (task_id, member_id),
        )
    return filtered


def fetch_task(conn, task_id: int) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM tasks WHERE id = %s", (task_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    member_map = task_member_map(conn, [task_id])
    return task_json(row, member_map.get(task_id, []))


def can_access_task(conn, task_id: int, user: dict[str, Any]) -> bool:
    if user["role"] == "admin":
        return True
    row = conn.execute(
        """
        SELECT tasks.id
        FROM tasks
        LEFT JOIN task_members ON task_members.task_id = tasks.id
        WHERE tasks.id = %s AND (
            tasks.owner_id = %s
            OR tasks.assignee_id = %s
            OR task_members.member_id = %s
        )
        LIMIT 1
        """,
        (task_id, user["id"], user["id"], user["id"]),
    ).fetchone()
    return bool(row)


@router.get("/tasks")
def list_tasks(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        tasks = visible_tasks(conn, user)
        member_map = task_member_map(conn, [item["id"] for item in tasks])
        return [task_json(item, member_map.get(item["id"], [])) for item in tasks]


@router.post("/tasks")
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        column = normalize_task_column(payload.get("column"))
        creator_id = resolve_owner_id(conn, user)
        row = conn.execute(
            """
            INSERT INTO tasks (title, description, priority, column_name, due, completed_at, creator_id, owner_id, assignee_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                payload.get("title", "").strip(),
                payload.get("description", "").strip(),
                payload.get("priority", "Средний"),
                column,
                clean_date(payload.get("due")),
                utcnow() if is_done_column(column) else None,
                creator_id,
                creator_id,
                payload.get("assigneeId"),
            ),
        ).fetchone()
        sync_task_members(conn, row["id"], row["owner_id"], row["assignee_id"], payload.get("memberIds", []))
        task = fetch_task(conn, row["id"])
        notify_task_created(conn, task, user)
        return task


@router.patch("/tasks/{task_id}")
async def update_task(task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "title": "title",
        "description": "description",
        "priority": "priority",
        "column": "column_name",
        "due": "due",
        "assigneeId": "assignee_id",
        "ownerId": "owner_id",
    }
    with db() as conn:
        existing = conn.execute("SELECT * FROM tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        if not can_access_task(conn, task_id, user):
            raise HTTPException(status_code=403, detail="Task access denied")
        fields = []
        values = []
        for key, column in allowed.items():
            if key in payload:
                if key == "ownerId":
                    if not can_change_owner(existing.get("owner_id"), payload[key], user, existing.get("creator_id")):
                        raise HTTPException(status_code=403, detail="Only task creator can change owner")
                    fields.append(f"{column} = %s")
                    values.append(resolve_active_user_id(conn, payload[key]))
                    continue
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
        has_members = "memberIds" in payload
        if not fields and not has_members:
            raise HTTPException(status_code=400, detail="No fields to update")
        row = existing
        if fields:
            values.append(task_id)
            row = conn.execute(
                f"UPDATE tasks SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
                values,
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
        if has_members:
            sync_task_members(conn, task_id, row.get("owner_id"), row.get("assignee_id"), payload.get("memberIds", []))
        return fetch_task(conn, task_id)


@router.delete("/tasks/{task_id}")
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


@router.patch("/roadmap/generated-events")
async def update_generated_roadmap_event(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    from .ucp import can_view_ucp_task
    from .development import can_view_development_task
    payload = await request.json()
    source = (payload.get("source") or "").strip()
    source_kind = (payload.get("sourceKind", payload.get("source_kind", "")) or "").strip()
    from .utils import clean_bool
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
