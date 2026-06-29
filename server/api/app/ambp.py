from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import require_auth
from .db import db
from .utils import can_manage_owner_row, resolve_owner_id, visible_owner_rows

router = APIRouter()


def ambp_topic_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "planRevenue": float(row["plan_revenue"] or 0),
        "factRevenue": float(row["fact_revenue"] or 0),
        "funnelLeads": row["funnel_leads"] or 0,
        "funnelQualified": row["funnel_qualified"] or 0,
        "funnelProposals": row["funnel_proposals"] or 0,
        "funnelContracts": row["funnel_contracts"] or 0,
        "comment": row["comment"] or "",
        "ownerId": row.get("owner_id"),
    }


def ambp_payload(payload: dict[str, Any]) -> tuple[Any, ...]:
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    return (
        title,
        (payload.get("description") or "").strip(),
        payload.get("planRevenue", payload.get("plan_revenue", 0)) or 0,
        payload.get("factRevenue", payload.get("fact_revenue", 0)) or 0,
        payload.get("funnelLeads", payload.get("funnel_leads", 0)) or 0,
        payload.get("funnelQualified", payload.get("funnel_qualified", 0)) or 0,
        payload.get("funnelProposals", payload.get("funnel_proposals", 0)) or 0,
        payload.get("funnelContracts", payload.get("funnel_contracts", 0)) or 0,
        (payload.get("comment") or "").strip(),
    )


@router.get("/ambp-topics")
def list_ambp_topics(user: dict[str, Any] = Depends(require_auth)) -> list[dict[str, Any]]:
    with db() as conn:
        return [ambp_topic_json(item) for item in visible_owner_rows(conn, "ambp_topics", user)]


@router.post("/ambp-topics")
async def create_ambp_topic(request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO ambp_topics (
              title, description, plan_revenue, fact_revenue,
              funnel_leads, funnel_qualified, funnel_proposals, funnel_contracts, comment, owner_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (*ambp_payload(payload), resolve_owner_id(conn, user)),
        ).fetchone()
        return ambp_topic_json(row)


@router.patch("/ambp-topics/{topic_id}")
async def update_ambp_topic(topic_id: int, request: Request, user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    payload = await request.json()
    allowed = {
        "title": "title", "description": "description",
        "planRevenue": "plan_revenue", "plan_revenue": "plan_revenue",
        "factRevenue": "fact_revenue", "fact_revenue": "fact_revenue",
        "funnelLeads": "funnel_leads", "funnel_leads": "funnel_leads",
        "funnelQualified": "funnel_qualified", "funnel_qualified": "funnel_qualified",
        "funnelProposals": "funnel_proposals", "funnel_proposals": "funnel_proposals",
        "funnelContracts": "funnel_contracts", "funnel_contracts": "funnel_contracts",
        "comment": "comment",
    }
    fields = []
    values = []
    for key, column in allowed.items():
        if key in payload:
            value = payload[key]
            if column in {"title", "description", "comment"}:
                value = (value or "").strip()
            else:
                value = value or 0
            fields.append(f"{column} = %s")
            values.append(value)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(topic_id)
    with db() as conn:
        existing = conn.execute("SELECT * FROM ambp_topics WHERE id = %s", (topic_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AMBP topic not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="AMBP topic access denied")
        row = conn.execute(
            f"UPDATE ambp_topics SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING *",
            values,
        ).fetchone()
        return ambp_topic_json(row)


@router.delete("/ambp-topics/{topic_id}")
def delete_ambp_topic(topic_id: int, user: dict[str, Any] = Depends(require_auth)) -> dict[str, bool]:
    with db() as conn:
        existing = conn.execute("SELECT * FROM ambp_topics WHERE id = %s", (topic_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AMBP topic not found")
        if not can_manage_owner_row(existing, user):
            raise HTTPException(status_code=403, detail="AMBP topic access denied")
        conn.execute("DELETE FROM ambp_topics WHERE id = %s RETURNING id", (topic_id,)).fetchone()
        return {"ok": True}
