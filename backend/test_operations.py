import sys
import unittest

sys.path.insert(0, "backend")

from main import _next_order_reference, _slugify_product


class FakeCursor:
    def __init__(self, value):
        self.value = value
        self.sql = None

    def fetchone(self):
        return (self.value,)


class FakeConn:
    def __init__(self, value):
        self.cursor = FakeCursor(value)

    def execute(self, sql, params=None):
        self.cursor.sql = sql
        return self.cursor


class OperationsTests(unittest.TestCase):
    def test_slugify_product_is_stable(self):
        self.assertEqual(_slugify_product("20L Planetary Mixer"), "20l-planetary-mixer")

    def test_order_reference_uses_database_sequence(self):
        conn = FakeConn(42)
        self.assertEqual(_next_order_reference(conn), "TK-000042")
        self.assertIn("nextval('operations_order_reference_seq')", conn.cursor.sql)


if __name__ == "__main__":
    unittest.main()
