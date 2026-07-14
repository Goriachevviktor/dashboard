import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "ops" / "backup" / "backup_metadata.py"


def load_module():
    spec = importlib.util.spec_from_file_location("backup_metadata", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BackupMetadataTest(unittest.TestCase):
    def setUp(self):
        self.module = load_module()

    def test_build_state_contains_only_restore_metadata(self):
        completed = datetime(2026, 7, 14, 12, 30, tzinfo=timezone.utc)
        state = self.module.build_state(
            Path("dashboard-20260714T123000Z.dump"), completed, 12345, "a" * 64, ["daily"]
        )
        self.assertEqual(state["schemaVersion"], 1)
        self.assertEqual(state["completedAt"], "2026-07-14T12:30:00Z")
        self.assertEqual(state["filename"], "dashboard-20260714T123000Z.dump")
        self.assertEqual(state["sizeBytes"], 12345)
        self.assertEqual(state["sha256"], "a" * 64)
        self.assertEqual(state["classes"], ["daily"])
        self.assertNotIn("password", json.dumps(state).lower())

    def test_validate_state_accepts_fresh_matching_backup(self):
        now = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dump = root / "dashboard-20260714T123000Z.dump"
            dump.write_bytes(b"valid-dump")
            state = self.module.build_state(dump, now - timedelta(hours=12), dump.stat().st_size, "b" * 64, ["daily"])
            self.assertEqual(self.module.validate_state(state, root, now, 36, 1), [])

    def test_validate_state_rejects_stale_or_mismatched_backup(self):
        now = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dump = root / "dashboard-20260713T000000Z.dump"
            dump.write_bytes(b"small")
            state = self.module.build_state(dump, now - timedelta(hours=60), 999, "c" * 64, ["daily"])
            errors = self.module.validate_state(state, root, now, 36, 10)
            self.assertIn("backup is older than 36 hours", errors)
            self.assertIn("backup size does not match state", errors)
            self.assertIn("backup is smaller than 10 bytes", errors)

    def test_managed_filename_parser_rejects_unmanaged_files(self):
        self.assertEqual(
            self.module.parse_managed_name("dashboard-20260714T123000Z.dump"),
            datetime(2026, 7, 14, 12, 30, tzinfo=timezone.utc),
        )
        self.assertIsNone(self.module.parse_managed_name("manual-important.dump"))
        self.assertIsNone(self.module.parse_managed_name("dashboard-latest.dump"))

    def test_retention_plan_keeps_7_daily_4_weekly_and_3_monthly(self):
        stamps = [
            datetime(2026, 4, 28, 3, tzinfo=timezone.utc),
            datetime(2026, 5, 2, 3, tzinfo=timezone.utc),
            datetime(2026, 6, 3, 3, tzinfo=timezone.utc),
        ] + [datetime(2026, 7, day, 3, tzinfo=timezone.utc) for day in range(1, 15)]
        names = [stamp.strftime("dashboard-%Y%m%dT%H%M%SZ.dump") for stamp in stamps]
        plan = self.module.retention_plan(names)
        self.assertEqual(len(plan["daily"]), 7)
        self.assertEqual(len(plan["weekly"]), 4)
        self.assertEqual(len(plan["monthly"]), 3)
        self.assertEqual(plan["daily"][-1], "dashboard-20260714T030000Z.dump")
        self.assertIn("dashboard-20260502T030000Z.dump", plan["monthly"])
        self.assertIn("dashboard-20260603T030000Z.dump", plan["monthly"])
        self.assertIn("dashboard-20260701T030000Z.dump", plan["monthly"])

    def test_retention_always_preserves_newest_and_ignores_unmanaged(self):
        names = ["manual-important.dump", "dashboard-20260714T030000Z.dump"]
        plan = self.module.retention_plan(names)
        self.assertEqual(plan["daily"], ["dashboard-20260714T030000Z.dump"])
        self.assertEqual(plan["unmanaged"], ["manual-important.dump"])


if __name__ == "__main__":
    unittest.main()
