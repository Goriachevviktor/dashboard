import asyncio
import os
from uuid import uuid4

import psycopg
import pytest
from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app import roadmaps
from app.auth import hash_password
from app.db import migrate_auth_schema


class JsonRequest:
    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


def roadmap_payload(roadmap_id, title):
    return {"id": roadmap_id, "title": title, "lanes": [], "bars": [], "milestones": []}


def test_owner_scoped_roadmap_identity_and_crud_are_isolated():
    migrate_auth_schema()
    suffix = uuid4().hex
    roadmap_id = f"shared-{suffix}"
    emails = [f"roadmap-a-{suffix}@example.test", f"roadmap-b-{suffix}@example.test"]
    with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"], row_factory=dict_row) as conn:
        users = [
            conn.execute(
                "INSERT INTO users (email, password_hash, display_name, role) VALUES (%s, %s, %s, 'member') RETURNING *",
                (email, hash_password("test-password"), email),
            ).fetchone()
            for email in emails
        ]

    try:
        legacy_id = f"legacy-{suffix}"
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            conn.execute(
                "INSERT INTO roadmaps (owner_id, id, payload) VALUES (%s, %s, %s)",
                (users[0]["id"], legacy_id, Jsonb(roadmap_payload(legacy_id, "Preserved"))),
            )
            conn.execute("DELETE FROM app_schema_migrations WHERE version = '010_owner_scope_roadmap_primary_key'")
            conn.execute("ALTER TABLE roadmaps DROP CONSTRAINT roadmaps_pkey")
            conn.execute("ALTER TABLE roadmaps ADD PRIMARY KEY (id)")

        migrate_auth_schema()
        migrate_auth_schema()
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            preserved = conn.execute(
                "SELECT payload->>'title' FROM roadmaps WHERE owner_id = %s AND id = %s",
                (users[0]["id"], legacy_id),
            ).fetchone()
            key_columns = [
                row[0]
                for row in conn.execute(
                    """
                    SELECT attribute.attname
                    FROM pg_constraint constraint_row
                    CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
                    JOIN pg_attribute attribute
                      ON attribute.attrelid = constraint_row.conrelid
                     AND attribute.attnum = key_column.attnum
                    WHERE constraint_row.conrelid = 'roadmaps'::regclass
                      AND constraint_row.contype = 'p'
                    ORDER BY key_column.position
                    """
                ).fetchall()
            ]
            assert preserved == ("Preserved",)
            assert key_columns == ["owner_id", "id"]
            conn.execute("DELETE FROM roadmaps WHERE owner_id = %s AND id = %s", (users[0]["id"], legacy_id))

        first = asyncio.run(roadmaps.create_roadmap(JsonRequest(roadmap_payload(roadmap_id, "Owner A")), users[0]))
        second = asyncio.run(roadmaps.create_roadmap(JsonRequest(roadmap_payload(roadmap_id, "Owner B")), users[1]))
        assert first["title"] == "Owner A"
        assert second["title"] == "Owner B"
        assert [item["title"] for item in roadmaps.list_roadmaps(users[0])] == ["Owner A"]
        assert [item["title"] for item in roadmaps.list_roadmaps(users[1])] == ["Owner B"]

        updated = asyncio.run(roadmaps.update_roadmap(roadmap_id, JsonRequest({"title": "Owner A updated"}), users[0]))
        assert updated["title"] == "Owner A updated"
        assert [item["title"] for item in roadmaps.list_roadmaps(users[1])] == ["Owner B"]

        assert roadmaps.delete_roadmap(roadmap_id, users[0]) == {"ok": True}
        assert roadmaps.list_roadmaps(users[0]) == []
        assert [item["title"] for item in roadmaps.list_roadmaps(users[1])] == ["Owner B"]
        with pytest.raises(HTTPException) as denied_update:
            asyncio.run(roadmaps.update_roadmap(roadmap_id, JsonRequest({"title": "Foreign overwrite"}), users[0]))
        assert denied_update.value.status_code == 404
        assert [item["title"] for item in roadmaps.list_roadmaps(users[1])] == ["Owner B"]

        imported = asyncio.run(roadmaps.import_roadmaps(JsonRequest([
            roadmap_payload(roadmap_id, "Owner A imported"),
            roadmap_payload(roadmap_id, "Owner A duplicate"),
        ]), users[0]))
        assert imported == {"imported": 1}
        assert [item["title"] for item in roadmaps.list_roadmaps(users[0])] == ["Owner A imported"]
        assert [item["title"] for item in roadmaps.list_roadmaps(users[1])] == ["Owner B"]
    finally:
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            conn.execute("DELETE FROM users WHERE email = ANY(%s)", (emails,))
