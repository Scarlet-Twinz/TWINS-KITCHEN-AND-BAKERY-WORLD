import unittest
from unittest.mock import Mock
from create_owner import OWNER_ROLE_CONSTRAINT_SQL, ensure_owner_role_constraint

class OwnerRoleSchemaTests(unittest.TestCase):
    def test_owner_role_constraint_preserves_all_existing_roles(self):
        self.assertIn("'customer'", OWNER_ROLE_CONSTRAINT_SQL)
        self.assertIn("'staff'", OWNER_ROLE_CONSTRAINT_SQL)
        self.assertIn("'admin'", OWNER_ROLE_CONSTRAINT_SQL)
        self.assertIn("'owner'", OWNER_ROLE_CONSTRAINT_SQL)
        self.assertIn("'supplier'", OWNER_ROLE_CONSTRAINT_SQL)

    def test_owner_role_constraint_is_applied_before_owner_creation(self):
        conn=Mock()
        ensure_owner_role_constraint(conn)
        conn.execute.assert_called_once_with(OWNER_ROLE_CONSTRAINT_SQL)

if __name__=="__main__":
    unittest.main()
