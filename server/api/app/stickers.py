from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth
from .db import db
from .utils import can_manage_owner_row, resolve_owner_id, visible_owner_rows

router = APIRouter()


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


@router.get("/sync-stickers")
def list_stickers(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return [sticker_json(item) for item in visible_owner_rows(conn, "sync_stickers", user)]


@router.post("/sync-stickers")
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


@router.patch("/sync-stickers/{sticker_id}")
async def update_sticker(sticker_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "speaker": "speaker", "topic": "topic", "text": "text",
        "colorId": "color_id", "x": "x", "y": "y", "width": "width", "height": "height",
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


@router.delete("/sync-stickers/{sticker_id}")
def delete_sticker(sticker_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM sync_stickers WHERE id = %s", (sticker_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Sticker not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="Sticker access denied")
        conn.execute("DELETE FROM sync_stickers WHERE id = %s RETURNING id", (sticker_id,)).fetchone()
        return {"ok": True}
