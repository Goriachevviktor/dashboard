from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth
from .db import db
from .utils import can_manage_owner_row, clean_bool, clean_date, iso, normalize_member_ids, resolve_owner_id

router = APIRouter()


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


def is_development_task_done(row: dict[str, Any]) -> bool:
    if row.get("done"):
        return True
    status = (row.get("status") or "").strip().lower()
    return any(marker in status for marker in ("заверш", "готов", "выполн", "done", "complete"))


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
        generated.append({
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
        })

    development_ids = {item["id"] for item in development_tasks}
    development_title_by_id = {item["id"]: item["title"] for item in development_tasks}

    for task in development_tasks:
        parts = roadmap_date_parts(task.get("due"))
        if not parts:
            continue
        generated.append({
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
        })

    for checkpoint in development_checkpoints or []:
        task_id = checkpoint["task_id"]
        if task_id not in development_ids:
            continue
        parts = roadmap_date_parts(checkpoint.get("date"))
        if not parts:
            continue
        label = (checkpoint.get("label") or "Контрольная точка").strip() or "Контрольная точка"
        task_title = development_title_by_id.get(task_id) or "План развития"
        generated.append({
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
        })

    return sorted(generated, key=lambda item: (item["month"], item["day"], str(item["id"])))


def save_development_relations(conn, task_id: int, member_ids: list[int], checkpoints: list[dict[str, Any]]) -> None:
    normalized = normalize_member_ids(conn, member_ids)
    conn.execute("DELETE FROM development_task_members WHERE task_id = %s", (task_id,))
    for member_id in normalized:
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
    checkpoints = conn.execute("SELECT * FROM development_task_checkpoints WHERE task_id = %s ORDER BY id", (task_id,)).fetchall()
    members = conn.execute("SELECT member_id FROM development_task_members WHERE task_id = %s ORDER BY member_id", (task_id,)).fetchall()
    return development_task_json(task, checkpoints, [item["member_id"] for item in members])


@router.get("/development-tasks")
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


@router.post("/development-tasks")
async def create_development_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    with db() as conn:
        row = conn.execute(
            "INSERT INTO development_tasks (title, description, result_image, success_metric, due, status, done, owner_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
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


@router.patch("/development-tasks/{task_id}")
async def update_development_task(task_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "title": "title", "description": "description",
        "resultImage": "result_image", "result_image": "result_image",
        "successMetric": "success_metric", "success_metric": "success_metric",
        "due": "due", "status": "status", "done": "done",
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
            existing_members = conn.execute("SELECT member_id FROM development_task_members WHERE task_id = %s ORDER BY member_id", (task_id,)).fetchall()
            existing_checkpoints = conn.execute("SELECT * FROM development_task_checkpoints WHERE task_id = %s ORDER BY id", (task_id,)).fetchall()
            save_development_relations(
                conn, task_id,
                payload.get("memberIds", [item["member_id"] for item in existing_members]),
                payload.get("checkpoints", [dict(item) for item in existing_checkpoints]),
            )
        return fetch_development_task(conn, task_id)


@router.delete("/development-tasks/{task_id}")
def delete_development_task(task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM development_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Development task not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Development task access denied")
        conn.execute("DELETE FROM development_tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        return {"ok": True}
