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


class MindMapsUnitTest(unittest.TestCase):
    def test_list_queries_only_current_users_maps(self):
        from app import mindmaps

        connection = FakeConnection([
            {
                "id": 17,
                "owner_id": 42,
                "title": "Личная карта",
                "description": "",
                "tag": "",
                "tag_color": "#3b6fe0",
                "status": "active",
                "root": {"id": "root", "label": "Старт", "children": []},
                "created_at": None,
                "updated_at": None,
            }
        ])
        with patch.object(mindmaps, "db", lambda: fake_db(connection)):
            result = mindmaps.list_mind_maps({"id": 42, "role": "member"})

        self.assertEqual(["17"], [item["id"] for item in result])
        self.assertEqual((42,), connection.calls[0][1])
        self.assertIn("WHERE owner_id = %s", connection.calls[0][0])

    def test_foreign_map_is_forbidden_even_for_admin(self):
        from app import mindmaps

        connection = FakeConnection([{"id": 17, "owner_id": 42}])
        with self.assertRaises(HTTPException) as error:
            mindmaps.get_owned_mind_map(connection, 17, {"id": 7, "role": "admin"})

        self.assertEqual(403, error.exception.status_code)

    def test_payload_requires_title_and_object_root(self):
        from app import mindmaps

        with self.assertRaises(HTTPException) as title_error:
            mindmaps.clean_mind_map_payload({"title": "   ", "root": {}})
        self.assertEqual(400, title_error.exception.status_code)

        with self.assertRaises(HTTPException) as root_error:
            mindmaps.clean_mind_map_payload({"title": "Карта", "root": []})
        self.assertEqual(400, root_error.exception.status_code)


if __name__ == "__main__":
    unittest.main()
