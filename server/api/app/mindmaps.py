from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from psycopg.types.json import Jsonb

from .auth import require_auth
from .db import db
from .utils import iso

router = APIRouter()

VALID_STATUSES = {"active", "draft", "archived"}


def mind_map_json(row: dict[str, Any], owner_name: str = "") -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "desc": row["description"] or "",
        "tag": row["tag"] or "",
        "tagColor": row["tag_color"],
        "status": row["status"],
        "root": row["root"],
        "ownerName": owner_name,
        "createdAt": iso(row.get("created_at")),
        "updatedAt": iso(row.get("updated_at")),
    }


def validate_mind_map_node(node: Any) -> None:
    if not isinstance(node, dict):
        raise HTTPException(status_code=400, detail="Mind map node must be an object")
    if not str(node.get("id") or "").strip():
        raise HTTPException(status_code=400, detail="Mind map node id is required")
    if not str(node.get("label") or node.get("text") or "").strip():
        raise HTTPException(status_code=400, detail="Mind map node label is required")
    children = node.get("children", [])
    if not isinstance(children, list):
        raise HTTPException(status_code=400, detail="Mind map node children must be an array")
    for child in children:
        validate_mind_map_node(child)


def clean_mind_map_payload(payload: Any, *, partial: bool = False) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid mind map payload")

    cleaned: dict[str, Any] = {}
    if "title" in payload or not partial:
        title = str(payload.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        cleaned["title"] = title
    if "desc" in payload:
        cleaned["description"] = str(payload["desc"] or "").strip()
    elif not partial:
        cleaned["description"] = ""
    if "tag" in payload:
        cleaned["tag"] = str(payload["tag"] or "").strip()
    elif not partial:
        cleaned["tag"] = ""
    if "tagColor" in payload:
        cleaned["tag_color"] = str(payload["tagColor"] or "#3b6fe0").strip() or "#3b6fe0"
    elif not partial:
        cleaned["tag_color"] = "#3b6fe0"
    if "status" in payload or not partial:
        status = str(payload.get("status") or "draft").strip()
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid mind map status")
        cleaned["status"] = status
    if "root" in payload or not partial:
        root = payload.get("root")
        if not isinstance(root, dict):
            raise HTTPException(status_code=400, detail="Mind map root must be an object")
        validate_mind_map_node(root)
        cleaned["root"] = root
    return cleaned


def get_owned_mind_map(conn, map_id: int, user: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM mind_maps WHERE id = %s", (map_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Mind map not found")
    if int(row["owner_id"]) != int(user["id"]):
        raise HTTPException(status_code=403, detail="Mind map access denied")
    return row


@router.get("/mind-maps")
def list_mind_maps(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM mind_maps WHERE owner_id = %s ORDER BY updated_at DESC, id DESC",
            (user["id"],),
        ).fetchall()
        return [mind_map_json(row, user.get("display_name", "")) for row in rows]


@router.post("/mind-maps")
async def create_mind_map(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    values = clean_mind_map_payload(await request.json())
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO mind_maps (owner_id, title, description, tag, tag_color, status, root)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                user["id"], values["title"], values["description"], values["tag"],
                values["tag_color"], values["status"], Jsonb(values["root"]),
            ),
        ).fetchone()
        return mind_map_json(row, user.get("display_name", ""))


@router.patch("/mind-maps/{map_id}")
async def update_mind_map(map_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    values = clean_mind_map_payload(await request.json(), partial=True)
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    fields = []
    parameters = []
    for column, value in values.items():
        fields.append(f"{column} = %s")
        parameters.append(Jsonb(value) if column == "root" else value)
    parameters.append(map_id)
    with db() as conn:
        get_owned_mind_map(conn, map_id, user)
        row = conn.execute(
            f"UPDATE mind_maps SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            parameters,
        ).fetchone()
        return mind_map_json(row, user.get("display_name", ""))


@router.delete("/mind-maps/{map_id}")
def delete_mind_map(map_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        get_owned_mind_map(conn, map_id, user)
        conn.execute("DELETE FROM mind_maps WHERE id = %s", (map_id,))
        return {"ok": True}
