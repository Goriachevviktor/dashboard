import unittest
from fastapi import HTTPException


class BrspValidationTest(unittest.TestCase):
    def test_validates_date_and_status(self):
        from app.brsp import clean_meeting_payload

        valid = clean_meeting_payload({"date": "2026-11-18", "status": "draft", "note": "", "topics": []})
        self.assertEqual("2026-11-18", valid["date"])
        for value in ("2026-11-31", "18.11.2026", ""):
            with self.assertRaises(HTTPException):
                clean_meeting_payload({"date": value, "status": "draft", "topics": []})
        with self.assertRaises(HTTPException):
            clean_meeting_payload({"date": "2026-11-18", "status": "unknown", "topics": []})

    def test_rejects_duplicate_and_invalid_topics(self):
        from app.brsp import clean_meeting_payload

        topic = {"id": "819f49b9-729e-4b19-a1c4-f3db583f14ce", "name": "ОЕМ", "text": "Доклад"}
        base = {"date": "2026-11-18", "status": "draft"}
        for topics in ([topic, topic], [{**topic, "id": "bad"}], [{**topic, "name": " "}], "wrong"):
            with self.assertRaises(HTTPException):
                clean_meeting_payload({**base, "topics": topics})

    def test_clone_copies_names_but_not_reports(self):
        from app.brsp import clone_topics

        source = [{"id": "819f49b9-729e-4b19-a1c4-f3db583f14ce", "name": "ОЕМ", "text": "Старый доклад"}]
        self.assertEqual([{"id": source[0]["id"], "name": "ОЕМ", "text": ""}], clone_topics(source))
        self.assertEqual("Старый доклад", source[0]["text"])

    def test_foreign_meeting_is_not_accessible_to_admin(self):
        from app.brsp import get_owned_meeting

        class Connection:
            def execute(self, query, params):
                self.params = params
                return self

            def fetchone(self):
                return None

        conn = Connection()
        with self.assertRaises(HTTPException) as error:
            get_owned_meeting(conn, 8, {"id": 7, "role": "admin"})
        self.assertEqual(404, error.exception.status_code)
        self.assertEqual((8, 7), conn.params)


if __name__ == "__main__":
    unittest.main()
