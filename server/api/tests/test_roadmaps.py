import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi import HTTPException


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.calls = []

    def execute(self, query, params=()):
        self.calls.append((" ".join(query.split()), params))
        return FakeResult(self.rows)


@contextmanager
def fake_db(connection):
    yield connection


class RoadmapsUnitTest(unittest.TestCase):
    def test_list_queries_only_current_users_roadmaps(self):
        from app import roadmaps

        connection = FakeConnection([
            {
                "id": "rm-personal",
                "owner_id": 42,
                "payload": {"id": "rm-personal", "title": "Личная карта", "lanes": [], "bars": [], "milestones": []},
                "created_at": None,
                "updated_at": None,
            }
        ])
        with patch.object(roadmaps, "db", lambda: fake_db(connection)):
            result = roadmaps.list_roadmaps({"id": 42, "role": "member"})

        self.assertEqual(["rm-personal"], [item["id"] for item in result])
        self.assertEqual((42,), connection.calls[0][1])
        self.assertIn("WHERE owner_id = %s", connection.calls[0][0])

    def test_foreign_roadmap_is_forbidden_even_for_admin(self):
        from app import roadmaps

        connection = FakeConnection([{"id": "rm-personal", "owner_id": 42}])
        with self.assertRaises(HTTPException) as error:
            roadmaps.get_owned_roadmap(connection, "rm-personal", {"id": 7, "role": "admin"})

        self.assertEqual(403, error.exception.status_code)

    def test_payload_requires_id_title_and_collections(self):
        from app import roadmaps

        for payload in (
            {"id": "", "title": "Карта", "lanes": [], "bars": [], "milestones": []},
            {"id": "rm-1", "title": "   ", "lanes": [], "bars": [], "milestones": []},
            {"id": "rm-1", "title": "Карта", "lanes": {}, "bars": [], "milestones": []},
        ):
            with self.assertRaises(HTTPException) as error:
                roadmaps.clean_roadmap_payload(payload)
            self.assertEqual(400, error.exception.status_code)

    def test_import_insert_never_updates_existing_roadmap(self):
        from app import roadmaps

        connection = FakeConnection()
        with patch.object(roadmaps, "db", lambda: fake_db(connection)):
            roadmaps.import_roadmaps_payload(connection, 42, [
                {"id": "rm-personal", "title": "Личная карта", "lanes": [], "bars": [], "milestones": []},
            ])

        query, params = connection.calls[0]
        self.assertIn("ON CONFLICT (owner_id, id) DO NOTHING", query)
        self.assertEqual("rm-personal", params[0])
        self.assertEqual(42, params[1])


if __name__ == "__main__":
    unittest.main()
