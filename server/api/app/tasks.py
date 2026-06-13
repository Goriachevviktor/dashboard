from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth, utcnow
from .db import db
from .push import notify_task_created
from .utils import (
    can_change_owner, can_delete_task, can_edit_task,
    clean_date, is_done_column, normalize_task_column,
    resolve_active_user_id, resolve_owner_id,
)

router = APIRouter()


def task_json(row: dict[str, Any]) -> dict[str, Any]:
    from .utils import iso
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
    archive_expired_done_tasks(conn)
    if user["role"] == "admin":
        return conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
    return conn.execute(
        "SELECT * FROM tasks WHERE owner_id = %s OR assignee_id = %s ORDER BY id",
        (user["id"], user["id"]),
    ).fetchall()


@router.get("/tasks", dependencies=[Depends(require_auth)])
def list_tasks(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return [task_json(item) for item in visible_tasks(conn, user)]


@router.post("/tasks")
async def create_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        column = normalize_task_column(payload.get("column"))
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
                column,
                clean_date(payload.get("due")),
                utcnow() if is_done_column(column) else None,
                resolve_owner_id(conn, user),
                payload.get("assigneeId"),
            ),
        ).fetchone()
        task = task_json(row)
        notify_task_created(conn, task, user)
        return task


@router.patch("/tasks/{task_id}", dependencies=[Depends(require_auth)])
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
                if key == "ownerId":
                    if not can_change_owner(existing.get("owner_id"), payload[key], user):
                        raise HTTPException(status_code=403, detail="Only admin can change owner")
                    if user["role"] != "admin":
                        continue
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


@router.delete("/tasks/{task_id}", dependencies=[Depends(require_auth)])
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


@router.patch("/roadmap/generated-events", dependencies=[Depends(require_auth)])
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
