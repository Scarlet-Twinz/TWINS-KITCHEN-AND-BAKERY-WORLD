import unittest
from unittest.mock import Mock
from migrate import OWNER_ROLE_MIGRATION_SQL, migrate_owner_role

class OwnerRoleMigrationTests(unittest.TestCase):
    def test_migration_preserves_all_supported_roles(self):
        for role in ("customer","staff","admin","owner","supplier"):
            self.assertIn("'"+role+"'", OWNER_ROLE_MIGRATION_SQL)

    def test_migration_executes_exact_role_constraint_update(self):
        conn=Mock()
        migrate_owner_role(conn)
        conn.execute.assert_called_once_with(OWNER_ROLE_MIGRATION_SQL)

if __name__=="__main__":
    unittest.main()
