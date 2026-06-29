import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pywebpush import WebPushException, webpush

from .auth import require_auth
from .config import VAPID_CLAIMS_SUB, VAPID_PRIVATE_KEY_FILE, VAPID_PUBLIC_KEY
from .db import db

logger = logging.getLogger(__name__)
router = APIRouter()


def push_is_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY_FILE and os.path.exists(VAPID_PRIVATE_KEY_FILE))


def send_push_notification(subscription: dict[str, Any], payload: dict[str, Any]) -> bool:
    if not push_is_configured():
        return False
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=VAPID_PRIVATE_KEY_FILE,
            vapid_claims={"sub": VAPID_CLAIMS_SUB},
        )
        return True
    except WebPushException as error:
        status = getattr(getattr(error, "response", None), "status_code", None)
        if status in (404, 410):
            with db() as cleanup_conn:
                cleanup_conn.execute("DELETE FROM push_subscriptions WHERE endpoint = %s", (subscription["endpoint"],))
    except Exception:
        logger.exception("Unexpected error sending push to %s", subscription.get("endpoint", "unknown"))
    return False


def notify_push_subscriptions(subscriptions: list[dict[str, Any]], payload: dict[str, Any]) -> int:
    if not push_is_configured() or not subscriptions:
        return 0
    return sum(1 for sub in subscriptions if send_push_notification(sub, payload))


def notify_task_created(task: dict[str, Any], actor: dict[str, Any]) -> None:
    actor_name = actor.get("display_name") or actor.get("email") or "Пользователь"
    payload = {
        "title": "Новая задача",
        "body": f"{actor_name}: {task['title']}",
        "url": "/dashboard.html",
        "tag": f"task-{task['id']}",
    }
    recipient_ids = [uid for uid in {task.get("ownerId"), task.get("assigneeId")} if uid is not None]
    if not recipient_ids:
        return
    with db() as conn:
        subscriptions = conn.execute(
            "SELECT * FROM push_subscriptions WHERE user_id = ANY(%s) ORDER BY id",
            (recipient_ids,),
        ).fetchall()
    notify_push_subscriptions(subscriptions, payload)


@router.get("/push/vapid-public-key", dependencies=[Depends(require_auth)])
def push_public_key() -> dict[str, Any]:
    return {"enabled": push_is_configured(), "publicKey": VAPID_PUBLIC_KEY}


@router.post("/push/subscriptions")
async def save_push_subscription(
    request: Request,
    user: dict[str, Any] = Depends(require_auth),
) -> dict[str, bool]:
    payload = await request.json()
    endpoint = payload.get("endpoint") or ""
    keys = payload.get("keys") or {}
    p256dh = keys.get("p256dh") or ""
    auth = keys.get("auth") or ""
    if not endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Invalid push subscription")
    user_agent = request.headers.get("user-agent", "")[:500]
    with db() as conn:
        conn.execute(
            """
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (endpoint) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              p256dh = EXCLUDED.p256dh,
              auth = EXCLUDED.auth,
              user_agent = EXCLUDED.user_agent,
              updated_at = now()
            """,
            (user["id"], endpoint, p256dh, auth, user_agent),
        )
    return {"ok": True}


@router.delete("/push/subscriptions")
async def delete_push_subscription(
    request: Request,
    user: dict[str, Any] = Depends(require_auth),
) -> dict[str, bool]:
    payload = await request.json()
    endpoint = payload.get("endpoint") or ""
    if endpoint:
        with db() as conn:
            conn.execute("DELETE FROM push_subscriptions WHERE endpoint = %s AND user_id = %s", (endpoint, user["id"]))
    return {"ok": True}


@router.post("/push/test")
def test_push_notification(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    with db() as conn:
        subscriptions = conn.execute(
            "SELECT * FROM push_subscriptions WHERE user_id = %s ORDER BY id",
            (user["id"],),
        ).fetchall()
    sent = notify_push_subscriptions(
        subscriptions,
        {"title": "Пуши включены", "body": "Тестовое уведомление Dashboard доставлено.", "url": "/dashboard.html", "tag": "dashboard-push-test"},
    )
    return {"ok": True, "subscriptions": len(subscriptions), "sent": sent, "enabled": push_is_configured()}
