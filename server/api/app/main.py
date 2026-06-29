import logging
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .ambp import ambp_topic_json, router as ambp_router
from .auth import require_auth, router as auth_router
from .config import CORS_ORIGINS
from .db import db, migrate_auth_schema
from .development import (
    development_task_json, generated_roadmap_events,
    router as development_router, visible_development_tasks,
)
from .events import event_json, event_member_map, event_task_json, router as events_router, visible_event_tasks, visible_events
from .push import router as push_router
from .stickers import router as stickers_router, sticker_json
from .tasks import router as tasks_router, task_json, task_member_map, visible_tasks
from .ucp import router as ucp_router, ucp_task_json, visible_ucp_tasks
from .utils import visible_owner_rows

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(push_router)
app.include_router(tasks_router)
app.include_router(events_router)
app.include_router(ucp_router)
app.include_router(development_router)
app.include_router(ambp_router)
app.include_router(stickers_router)


@app.on_event("startup")
def startup() -> None:
    migrate_auth_schema()
    from .tasks import archive_expired_done_tasks
    with db() as conn:
        archive_expired_done_tasks(conn)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/bootstrap")
def bootstrap(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    with db() as conn:
        team = conn.execute(
            "SELECT id, email, display_name as name FROM users WHERE is_active = true ORDER BY display_name, id"
        ).fetchall()
        tasks = visible_tasks(conn, user)
        task_members = task_member_map(conn, [item["id"] for item in tasks])
        events = visible_events(conn, user)
        event_tasks = visible_event_tasks(conn, user)
        stickers = visible_owner_rows(conn, "sync_stickers", user)
        ucp_tasks = visible_ucp_tasks(conn, user)
        development_tasks = visible_development_tasks(conn, user)
        development_task_ids = [item["id"] for item in development_tasks]
        development_checkpoints = conn.execute(
            "SELECT * FROM development_task_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
            (development_task_ids or [0],),
        ).fetchall()
        development_members = conn.execute(
            "SELECT task_id, member_id FROM development_task_members WHERE task_id = ANY(%s) ORDER BY task_id, member_id",
            (development_task_ids or [0],),
        ).fetchall()
        ambp_topics = visible_owner_rows(conn, "ambp_topics", user)
        ucp_members = conn.execute("SELECT task_id, member_id FROM ucp_task_members ORDER BY task_id, member_id").fetchall()
        ucp_task_ids = [t["id"] for t in ucp_tasks]
        ucp_checkpoints = conn.execute(
            "SELECT * FROM ucp_checkpoints WHERE task_id = ANY(%s) ORDER BY task_id, id",
            (ucp_task_ids or [0],),
        ).fetchall()

        event_task_map: dict[str, list[dict[str, Any]]] = {}
        for item in event_tasks:
            event_task_map.setdefault(str(item["event_id"]), []).append(event_task_json(item))

        member_map: dict[int, list[int]] = {}
        for item in ucp_members:
            member_map.setdefault(item["task_id"], []).append(item["member_id"])

        checkpoint_map: dict[int, list[dict[str, Any]]] = {}
        for item in ucp_checkpoints:
            checkpoint_map.setdefault(item["task_id"], []).append(item)

        development_checkpoint_map: dict[int, list[dict[str, Any]]] = {}
        for item in development_checkpoints:
            development_checkpoint_map.setdefault(item["task_id"], []).append(item)

        development_member_map: dict[int, list[int]] = {}
        for item in development_members:
            development_member_map.setdefault(item["task_id"], []).append(item["member_id"])

        event_members = event_member_map(conn, [item["id"] for item in events])

        return {
            "team": team,
            "tasks": [task_json(item, task_members.get(item["id"], [])) for item in tasks],
            "events": [event_json(item, event_members.get(item["id"], [])) for item in events]
                + [event_json(item) for item in generated_roadmap_events(ucp_tasks, ucp_checkpoints, development_tasks, development_checkpoints)],
            "eventTasks": event_task_map,
            "syncStickers": [sticker_json(item) for item in stickers],
            "ucpTasks": [
                ucp_task_json(item, checkpoint_map.get(item["id"], []), member_map.get(item["id"], []))
                for item in ucp_tasks
            ],
            "developmentTasks": [
                development_task_json(item, development_checkpoint_map.get(item["id"], []), development_member_map.get(item["id"], []))
                for item in development_tasks
            ],
            "ambpTopics": [ambp_topic_json(item) for item in ambp_topics],
        }
