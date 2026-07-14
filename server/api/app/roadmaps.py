from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from psycopg.types.json import Jsonb

from .auth import require_auth
from .db import db
from .utils import iso

router = APIRouter()


def roadmap_json(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row["payload"] or {})
    payload["id"] = str(row["id"])
    payload["createdAt"] = iso(row.get("created_at"))
    payload["updatedAt"] = iso(row.get("updated_at"))
    return payload


def clean_roadmap_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid roadmap payload")

    cleaned = dict(payload)
    roadmap_id = str(cleaned.get("id") or "").strip()
    title = str(cleaned.get("title") or "").strip()
    if not roadmap_id:
        raise HTTPException(status_code=400, detail="Roadmap id is required")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    for field in ("lanes", "bars", "milestones"):
        if not isinstance(cleaned.get(field, []), list):
            raise HTTPException(status_code=400, detail=f"Roadmap {field} must be an array")
        cleaned[field] = cleaned.get(field, [])
    cleaned["id"] = roadmap_id
    cleaned["title"] = title
    return cleaned


def get_owned_roadmap(conn, roadmap_id: str, user: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM roadmaps WHERE id = %s", (roadmap_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    if int(row["owner_id"]) != int(user["id"]):
        raise HTTPException(status_code=403, detail="Roadmap access denied")
    return row


def import_roadmaps_payload(conn, owner_id: int, payloads: list[Any]) -> None:
    for payload in payloads:
        values = clean_roadmap_payload(payload)
        conn.execute(
            """
            INSERT INTO roadmaps (id, owner_id, payload)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (values["id"], owner_id, Jsonb(values)),
        )


@router.get("/roadmaps")
def list_roadmaps(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM roadmaps WHERE owner_id = %s ORDER BY updated_at DESC, id DESC",
            (user["id"],),
        ).fetchall()
        return [roadmap_json(row) for row in rows]


@router.post("/roadmaps")
async def create_roadmap(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    values = clean_roadmap_payload(await request.json())
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO roadmaps (id, owner_id, payload)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            RETURNING *
            """,
            (values["id"], user["id"], Jsonb(values)),
        ).fetchone()
        if not row:
            existing = get_owned_roadmap(conn, values["id"], user)
            raise HTTPException(status_code=409, detail=f"Roadmap already exists: {existing['id']}")
        return roadmap_json(row)


@router.post("/roadmaps/import")
async def import_roadmaps(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, int]:
    payloads = await request.json()
    if not isinstance(payloads, list):
        raise HTTPException(status_code=400, detail="Roadmap import must be an array")
    with db() as conn:
        import_roadmaps_payload(conn, int(user["id"]), payloads)
    return {"imported": len(payloads)}


@router.patch("/roadmaps/{roadmap_id}")
async def update_roadmap(roadmap_id: str, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    patch_payload = await request.json()
    if not isinstance(patch_payload, dict):
        raise HTTPException(status_code=400, detail="Invalid roadmap payload")
    with db() as conn:
        current = get_owned_roadmap(conn, roadmap_id, user)
        values = clean_roadmap_payload({**dict(current["payload"] or {}), **patch_payload, "id": roadmap_id})
        row = conn.execute(
            "UPDATE roadmaps SET payload = %s, updated_at = now() WHERE id = %s RETURNING *",
            (Jsonb(values), roadmap_id),
        ).fetchone()
        return roadmap_json(row)


@router.delete("/roadmaps/{roadmap_id}")
def delete_roadmap(roadmap_id: str, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        get_owned_roadmap(conn, roadmap_id, user)
        conn.execute("DELETE FROM roadmaps WHERE id = %s", (roadmap_id,))
        return {"ok": True}
