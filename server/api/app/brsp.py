from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from psycopg.types.json import Jsonb

from .auth import require_auth
from .db import db
from .brsp_pdf import render_draft_pdf

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


def clean_topic_ids(value: Any) -> list[str]:
    if not isinstance(value, list) or len(value) > 100:
        raise HTTPException(400, "Invalid topic selection")
    try:
        topic_ids = [str(UUID(topic_id)) for topic_id in value]
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(400, "Invalid topic selection") from None
    if len(set(topic_ids)) != len(topic_ids):
        raise HTTPException(400, "Duplicate selected topic")
    return topic_ids


def topic_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["topic_id"]),
        "name": row["name"],
        "status": row["status"],
        "aliases": row.get("aliases", []),
    }


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


@router.get("/brsp-meetings/{meeting_id}/draft.pdf")
def download_brsp_draft_pdf(meeting_id: int, user: dict[str, Any] = Depends(require_auth)) -> Response:
    with db() as conn:
        meeting = get_owned_meeting(conn, meeting_id, user)
    if meeting["status"] != "draft":
        raise HTTPException(409, "PDF доступен только для черновика встречи")
    if not any(topic["text"].strip() for topic in meeting["topics"]):
        raise HTTPException(409, "Во встрече нет подготовленных докладов")
    pdf = render_draft_pdf(meeting_json(meeting))
    filename = f"sink-brsp-{meeting['meeting_date'].isoformat()}-draft.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/brsp-topics")
def list_brsp_topics(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT topic.*, ARRAY(
              SELECT alias.topic_id::text FROM brsp_topics alias
              WHERE alias.owner_id = topic.owner_id AND alias.canonical_topic_id = topic.topic_id
              ORDER BY alias.last_seen_date DESC, alias.topic_id
            ) AS aliases
            FROM brsp_topics topic
            WHERE topic.owner_id = %s AND topic.canonical_topic_id IS NULL
            ORDER BY topic.sort_order, topic.name, topic.topic_id
            """,
            (user["id"],),
        ).fetchall()
        return [topic_json(row) for row in rows]


@router.patch("/brsp-topics/{topic_id}")
async def update_brsp_topic(topic_id: UUID, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload, dict) or set(payload) != {"status"} or payload["status"] not in ("active", "completed"):
        raise HTTPException(400, "Invalid topic update")
    with db() as conn:
        target = conn.execute(
            "SELECT COALESCE(canonical_topic_id, topic_id) AS topic_id FROM brsp_topics WHERE owner_id = %s AND topic_id = %s",
            (user["id"], topic_id),
        ).fetchone()
        if not target:
            raise HTTPException(404, "Topic not found")
        row = conn.execute(
            "UPDATE brsp_topics SET status = %s WHERE owner_id = %s AND topic_id = %s RETURNING *",
            (payload["status"], user["id"], target["topic_id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Topic not found")
        row["aliases"] = [str(item["topic_id"]) for item in conn.execute(
            "SELECT topic_id FROM brsp_topics WHERE owner_id = %s AND canonical_topic_id = %s",
            (user["id"], row["topic_id"]),
        ).fetchall()]
        return topic_json(row)


@router.post("/brsp-meetings")
async def create_brsp_meeting(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload, dict) or set(payload) - {"date", "topic_ids"}:
        raise HTTPException(400, "Invalid meeting")
    meeting_date = clean_meeting_payload({"date": payload.get("date")})["date"]
    selected_ids = clean_topic_ids(payload["topic_ids"]) if "topic_ids" in payload else None
    with db() as conn:
        available = conn.execute(
            "SELECT * FROM brsp_topics WHERE owner_id = %s AND status = 'active' AND canonical_topic_id IS NULL ORDER BY sort_order, name, topic_id",
            (user["id"],),
        ).fetchall()
        by_id = {str(row["topic_id"]): row for row in available}
        if selected_ids is None:
            selected_ids = list(by_id)
        if any(topic_id not in by_id for topic_id in selected_ids):
            raise HTTPException(400, "Selected topic is unavailable")
        values = clean_meeting_payload({
            "date": meeting_date,
            "topics": clone_topics([
                {"id": topic_id, "name": by_id[topic_id]["name"]}
                for topic_id in selected_ids
            ]),
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
        for index, topic in enumerate(values["topics"]):
            conn.execute(
                """
                UPDATE brsp_topics SET sort_order = %s, last_seen_date = %s
                WHERE owner_id = %s AND topic_id = %s AND last_seen_date <= %s
                """,
                (index, meeting_date, user["id"], topic["id"], meeting_date),
            )
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
        if "topics" in patch:
            for index, topic in enumerate(values["topics"]):
                existing = conn.execute(
                    """
                    SELECT topic_id FROM brsp_topics
                    WHERE owner_id = %s AND canonical_topic_id IS NULL AND lower(trim(name)) = lower(trim(%s))
                    ORDER BY last_seen_date DESC LIMIT 1
                    """,
                    (user["id"], topic["name"]),
                ).fetchone()
                canonical_id = existing["topic_id"] if existing and str(existing["topic_id"]) != topic["id"] else None
                conn.execute(
                    """
                    INSERT INTO brsp_topics (owner_id, topic_id, name, sort_order, last_seen_date, canonical_topic_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (owner_id, topic_id)
                    DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
                      last_seen_date = EXCLUDED.last_seen_date
                    WHERE brsp_topics.last_seen_date <= EXCLUDED.last_seen_date
                    """,
                    (user["id"], topic["id"], topic["name"], index, values["date"], canonical_id),
                )
        return meeting_json(row)


@router.delete("/brsp-meetings/{meeting_id}")
def delete_brsp_meeting(meeting_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        get_owned_meeting(conn, meeting_id, user)
        conn.execute("DELETE FROM brsp_meetings WHERE id = %s AND owner_id = %s", (meeting_id, user["id"]))
        return {"ok": True}
