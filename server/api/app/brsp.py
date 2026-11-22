from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from psycopg.types.json import Jsonb

from .auth import require_auth
from .db import db

router = APIRouter()


def clean_meeting_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid meeting")
    try:
        meeting_date = date.fromisoformat(payload.get("date", ""))
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid meeting date") from None
    if meeting_date.isoformat() != payload.get("date"):
        raise HTTPException(400, "Invalid meeting date")
    status = payload.get("status", "draft")
    if status not in ("draft", "done"):
        raise HTTPException(400, "Invalid meeting status")
    note = payload.get("note", "")
    if not isinstance(note, str) or len(note) > 20000:
        raise HTTPException(400, "Invalid meeting note")
    topics = payload.get("topics", [])
    if not isinstance(topics, list) or len(topics) > 100:
        raise HTTPException(400, "Invalid topics")
    cleaned_topics = []
    ids = set()
    names = set()
    for topic in topics:
        if not isinstance(topic, dict):
            raise HTTPException(400, "Invalid topic")
        try:
            topic_id = str(UUID(topic.get("id", "")))
        except (TypeError, ValueError, AttributeError):
            raise HTTPException(400, "Invalid topic id") from None
        name = topic.get("name")
        report = topic.get("text", "")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            raise HTTPException(400, "Invalid topic name")
        if not isinstance(report, str) or len(report) > 20000:
            raise HTTPException(400, "Invalid topic report")
        if topic_id in ids or name.strip().casefold() in names:
            raise HTTPException(400, "Duplicate topic")
        ids.add(topic_id)
        names.add(name.strip().casefold())
        cleaned_topics.append({"id": topic_id, "name": name.strip(), "text": report})
    return {"date": meeting_date.isoformat(), "status": status, "note": note, "topics": cleaned_topics}


def clone_topics(topics: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [{"id": topic["id"], "name": topic["name"], "text": ""} for topic in topics]


def meeting_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "date": row["meeting_date"].isoformat() if isinstance(row["meeting_date"], (date, datetime)) else str(row["meeting_date"]),
        "status": row["status"],
        "note": row["note"],
        "topics": row["topics"],
    }


def get_owned_meeting(conn, meeting_id: int, user: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM brsp_meetings WHERE id = %s AND owner_id = %s",
        (meeting_id, user["id"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Meeting not found")
    return row


@router.get("/brsp-meetings")
def list_brsp_meetings(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM brsp_meetings WHERE owner_id = %s ORDER BY meeting_date DESC, id DESC",
            (user["id"],),
        ).fetchall()
        return [meeting_json(row) for row in rows]


@router.post("/brsp-meetings")
async def create_brsp_meeting(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid meeting")
    meeting_date = clean_meeting_payload({"date": payload.get("date")})["date"]
    with db() as conn:
        latest = conn.execute(
            "SELECT topics FROM brsp_meetings WHERE owner_id = %s AND meeting_date < %s ORDER BY meeting_date DESC, id DESC LIMIT 1",
            (user["id"], meeting_date),
        ).fetchone()
        values = clean_meeting_payload({
            "date": meeting_date,
            "topics": clone_topics(latest["topics"]) if latest else [],
        })
        row = conn.execute(
            """
            INSERT INTO brsp_meetings (owner_id, meeting_date, status, note, topics)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (owner_id, meeting_date) DO NOTHING
            RETURNING *
            """,
            (user["id"], values["date"], values["status"], values["note"], Jsonb(values["topics"])),
        ).fetchone()
        if not row:
            raise HTTPException(409, "Meeting already exists on this date")
        return meeting_json(row)


@router.patch("/brsp-meetings/{meeting_id}")
async def update_brsp_meeting(meeting_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    patch = await request.json()
    if not isinstance(patch, dict) or not patch or set(patch) - {"date", "status", "note", "topics"}:
        raise HTTPException(400, "Invalid meeting update")
    with db() as conn:
        current = get_owned_meeting(conn, meeting_id, user)
        values = clean_meeting_payload({
            "date": current["meeting_date"].isoformat(),
            "status": current["status"],
            "note": current["note"],
            "topics": current["topics"],
            **patch,
        })
        row = conn.execute(
            """
            UPDATE brsp_meetings SET meeting_date = %s, status = %s, note = %s,
              topics = %s, updated_at = now()
            WHERE id = %s AND owner_id = %s
              AND NOT EXISTS (
                SELECT 1 FROM brsp_meetings other
                WHERE other.owner_id = %s AND other.meeting_date = %s AND other.id <> %s
              )
            RETURNING *
            """,
            (values["date"], values["status"], values["note"], Jsonb(values["topics"]),
             meeting_id, user["id"], user["id"], values["date"], meeting_id),
        ).fetchone()
        if not row:
            raise HTTPException(409, "Meeting already exists on this date")
        return meeting_json(row)


@router.delete("/brsp-meetings/{meeting_id}")
def delete_brsp_meeting(meeting_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        get_owned_meeting(conn, meeting_id, user)
        conn.execute("DELETE FROM brsp_meetings WHERE id = %s AND owner_id = %s", (meeting_id, user["id"]))
        return {"ok": True}
