import asyncio
import os
from uuid import uuid4

import psycopg
import pytest
from fastapi import HTTPException
from psycopg.rows import dict_row

from app import brsp
from app.auth import hash_password
from app.db import migrate_auth_schema


class JsonRequest:
    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


def test_brsp_meetings_are_private_and_keep_history():
    migrate_auth_schema()
    suffix = uuid4().hex
    emails = [f"brsp-a-{suffix}@example.test", f"brsp-b-{suffix}@example.test"]
    with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"], row_factory=dict_row) as conn:
        users = [conn.execute(
            "INSERT INTO users (email, password_hash, display_name, role) VALUES (%s, %s, %s, 'member') RETURNING *",
            (email, hash_password("test-password"), email),
        ).fetchone() for email in emails]

    try:
        first = asyncio.run(brsp.create_brsp_meeting(JsonRequest({"date": "2026-11-11"}), users[0]))
        topic_id = str(uuid4())
        first = asyncio.run(brsp.update_brsp_meeting(first["id"], JsonRequest({
            "topics": [{"id": topic_id, "name": "ОЕМ", "text": "Исторический доклад"}],
            "status": "done",
        }), users[0]))
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            conn.execute("DELETE FROM brsp_topics WHERE owner_id = %s", (users[0]["id"],))
        migrate_auth_schema()
        assert brsp.list_brsp_topics(users[0])[0]["id"] == topic_id
        second = asyncio.run(brsp.create_brsp_meeting(JsonRequest({"date": "2026-11-18"}), users[0]))
        assert second["topics"] == [{"id": topic_id, "name": "ОЕМ", "text": ""}]
        assert first["topics"][0]["text"] == "Исторический доклад"
        assert [item["id"] for item in brsp.list_brsp_meetings(users[0])] == [second["id"], first["id"]]
        assert brsp.list_brsp_meetings(users[1]) == []

        other = asyncio.run(brsp.create_brsp_meeting(JsonRequest({"date": "2026-11-18"}), users[1]))
        assert other["topics"] == []
        with pytest.raises(HTTPException) as denied:
            asyncio.run(brsp.update_brsp_meeting(first["id"], JsonRequest({"note": "Foreign edit"}), users[1]))
        assert denied.value.status_code == 404
        with pytest.raises(HTTPException) as duplicate:
            asyncio.run(brsp.create_brsp_meeting(JsonRequest({"date": "2026-11-18"}), users[0]))
        assert duplicate.value.status_code == 409

        assert brsp.delete_brsp_meeting(second["id"], users[0]) == {"ok": True}
        assert brsp.list_brsp_meetings(users[0])[0]["topics"][0]["text"] == "Исторический доклад"
    finally:
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            conn.execute("DELETE FROM users WHERE email = ANY(%s)", (emails,))


def test_brsp_topics_are_global_per_owner_and_independent_of_meeting_status():
    migrate_auth_schema()
    suffix = uuid4().hex
    emails = [f"brsp-topic-a-{suffix}@example.test", f"brsp-topic-b-{suffix}@example.test"]
    with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"], row_factory=dict_row) as conn:
        users = [conn.execute(
            "INSERT INTO users (email, password_hash, display_name, role) VALUES (%s, %s, %s, 'member') RETURNING *",
            (email, hash_password("test-password"), email),
        ).fetchone() for email in emails]

    try:
        first = asyncio.run(brsp.create_brsp_meeting(JsonRequest({"date": "2026-11-11"}), users[0]))
        topic_a, topic_b = str(uuid4()), str(uuid4())
        first = asyncio.run(brsp.update_brsp_meeting(first["id"], JsonRequest({
            "topics": [
                {"id": topic_a, "name": "ОЕМ", "text": "Первый доклад"},
                {"id": topic_b, "name": "Терминалы", "text": ""},
            ],
            "status": "done",
        }), users[0]))
        assert {item["id"] for item in brsp.list_brsp_topics(users[0])} == {topic_a, topic_b}
        assert brsp.list_brsp_topics(users[1]) == []

        second = asyncio.run(brsp.create_brsp_meeting(JsonRequest({
            "date": "2026-11-18", "topic_ids": [topic_a],
        }), users[0]))
        assert second["topics"] == [{"id": topic_a, "name": "ОЕМ", "text": ""}]
        assert first["status"] == "done"
        asyncio.run(brsp.update_brsp_meeting(second["id"], JsonRequest({
            "topics": [{"id": topic_a, "name": "ОЕМ новое", "text": ""}],
        }), users[0]))
        asyncio.run(brsp.update_brsp_meeting(first["id"], JsonRequest({
            "topics": [{"id": topic_a, "name": "ОЕМ старое", "text": "Первый доклад"},
                       {"id": topic_b, "name": "Терминалы", "text": ""}],
        }), users[0]))
        assert next(item for item in brsp.list_brsp_topics(users[0]) if item["id"] == topic_a)["name"] == "ОЕМ новое"

        completed = asyncio.run(brsp.update_brsp_topic(topic_a, JsonRequest({"status": "completed"}), users[0]))
        assert completed["status"] == "completed"
        migrate_auth_schema()
        assert next(item for item in brsp.list_brsp_topics(users[0]) if item["id"] == topic_a)["status"] == "completed"
        with pytest.raises(HTTPException) as denied:
            asyncio.run(brsp.update_brsp_topic(topic_a, JsonRequest({"status": "active"}), users[1]))
        assert denied.value.status_code == 404
        third = asyncio.run(brsp.create_brsp_meeting(JsonRequest({"date": "2026-11-25"}), users[0]))
        assert [item["id"] for item in third["topics"]] == [topic_b]
        assert brsp.list_brsp_meetings(users[0])[2]["topics"][0]["text"] == "Первый доклад"
        assert brsp.list_brsp_meetings(users[0])[2]["status"] == "done"

        with pytest.raises(HTTPException) as inactive:
            asyncio.run(brsp.create_brsp_meeting(JsonRequest({
                "date": "2026-12-02", "topic_ids": [topic_a],
            }), users[0]))
        assert inactive.value.status_code == 400
        restored = asyncio.run(brsp.update_brsp_topic(topic_a, JsonRequest({"status": "active"}), users[0]))
        assert restored["status"] == "active"
    finally:
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            conn.execute("DELETE FROM users WHERE email = ANY(%s)", (emails,))
