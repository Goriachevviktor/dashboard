import os
import unittest

import psycopg

from app.db import migrate_auth_schema


class MigrationRegistryCompatibilityTest(unittest.TestCase):
    def test_internal_backfills_do_not_reuse_sql_migration_registry(self):
        legacy_version = "compat-test-0001"
        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    checksum TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "DELETE FROM schema_migrations WHERE version = %s",
                (legacy_version,),
            )
            conn.execute(
                """
                INSERT INTO schema_migrations (version, filename, checksum)
                VALUES (%s, %s, %s)
                """,
                (legacy_version, "0001_baseline_current_schema.sql", "test-checksum"),
            )

        migrate_auth_schema()

        with psycopg.connect(os.environ["DASHBOARD_DATABASE_URL"]) as conn:
            legacy_row = conn.execute(
                "SELECT filename, checksum FROM schema_migrations WHERE version = %s",
                (legacy_version,),
            ).fetchone()
            self.assertEqual(
                legacy_row,
                ("0001_baseline_current_schema.sql", "test-checksum"),
            )

            internal_versions = {
                row[0]
                for row in conn.execute(
                    "SELECT version FROM app_schema_migrations"
                ).fetchall()
            }
            self.assertIn("001_backfill_creator_id", internal_versions)
            self.assertIn("008_delete_orphan_ucp_task_members", internal_versions)
