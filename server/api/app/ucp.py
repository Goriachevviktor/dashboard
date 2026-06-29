from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth
from .db import db
from .utils import can_manage_owner_row, clean_bool, clean_date, iso, normalize_member_ids, resolve_owner_id

router = APIRouter()


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


def save_ucp_relations(conn, task_id: int, member_ids: list[int], checkpoints: list[dict[str, Any]]) -> None:
    normalized = normalize_member_ids(conn, member_ids)
    conn.execute("DELETE FROM ucp_task_members WHERE task_id = %s", (task_id,))
    for member_id in normalized:
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
    members = conn.execute("SELECT member_id FROM ucp_task_members WHERE task_id = %s ORDER BY member_id", (task_id,)).fetchall()
    checkpoints = conn.execute("SELECT * FROM ucp_checkpoints WHERE task_id = %s ORDER BY id", (task_id,)).fetchall()
    return ucp_task_json(task, checkpoints, [item["member_id"] for item in members])


@router.get("/ucp/tasks")
def list_ucp_tasks(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        tasks = visible_ucp_tasks(conn, user)
        task_ids = [item["id"] for item in tasks]
        members = conn.execute(
            "SELECT task_id, member_id FROM ucp_task_members WHERE task_id = ANY(%s) ORDER BY task_id, member_id",
            (task_ids or [0],),
        ).fetchall()
        checkpoints = conn.execute(
            "SELECT * FROM ucp_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
            (task_ids or [0],),
        ).fetchall()
        member_map: dict[int, list[int]] = {}
        for item in members:
            member_map.setdefault(item["task_id"], []).append(item["member_id"])
        checkpoint_map: dict[int, list[dict[str, Any]]] = {}
        for item in checkpoints:
            checkpoint_map.setdefault(item["task_id"], []).append(item)
        return [ucp_task_json(item, checkpoint_map.get(item["id"], []), member_map.get(item["id"], [])) for item in tasks]


@router.post("/ucp/tasks")
async def create_ucp_task(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    with db() as conn:
        row = conn.execute(
            "INSERT INTO ucp_tasks (title, description, done, owner_id) VALUES (%s, %s, %s, %s) RETURNING *",
            (title, (payload.get("description") or "").strip(), clean_bool(payload.get("done")), resolve_owner_id(conn, user)),
        ).fetchone()
        save_ucp_relations(conn, row["id"], payload.get("memberIds", []), payload.get("checkpoints", []))
        return fetch_ucp_task(conn, row["id"])


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
            "UPDATE ucp_tasks SET title = %s, description = %s, done = %s, updated_at = now() WHERE id = %s",
            (payload.get("title", existing["title"]).strip(), payload.get("description", existing["description"] or "").strip(), clean_bool(payload.get("done", existing["done"])), task_id),
        )
        # Only update relations when explicitly provided in payload
        member_ids = payload["memberIds"] if "memberIds" in payload else None
        checkpoints = payload["checkpoints"] if "checkpoints" in payload else None
        if member_ids is not None or checkpoints is not None:
            # Read current values for whichever was not provided
            current = fetch_ucp_task(conn, task_id)
            save_ucp_relations(
                conn,
                task_id,
                member_ids if member_ids is not None else current.get("memberIds", []),
                checkpoints if checkpoints is not None else current.get("checkpoints", []),
            )
        return fetch_ucp_task(conn, task_id)


@router.delete("/ucp/tasks/{task_id}")
def delete_ucp_task(task_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM ucp_tasks WHERE id = %s", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="UCP task not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="UCP task access denied")
        conn.execute("DELETE FROM ucp_tasks WHERE id = %s RETURNING id", (task_id,)).fetchone()
        return {"ok": True}
