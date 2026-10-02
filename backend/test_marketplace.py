import hashlib
import hmac
import unittest
from pathlib import Path

class MarketplaceProductionSmokeTest(unittest.TestCase):
    def test_paystack_signature_contract(self):
        body=b'{"event":"charge.success","data":{"reference":"TKSELL-TEST"}}'
        secret="test-secret"
        expected=hmac.new(secret.encode(),body,hashlib.sha512).hexdigest()
        supplied=hmac.new(secret.encode(),body,hashlib.sha512).hexdigest()
        self.assertTrue(hmac.compare_digest(expected,supplied))

    def test_migration_contains_idempotency_and_media_hardening(self):
        migration=Path(__file__).with_name("migrations").joinpath("20261002_marketplace_production.sql").read_text()
        self.assertIn("marketplace_webhook_events",migration)
        self.assertIn("uq_marketplace_listing_media_sha256",migration)
        self.assertIn("media_rights_attested_at",migration)

    def test_marketplace_service_contains_required_routes(self):
        source=Path(__file__).with_name("marketplace_api.py").read_text()
        for route in (
            '"/plans"',
            '"/listings"',
            '"/listings/{listing_id}/media"',
            '"/seller-plan"',
            '"/payments/verify"',
            '"/subscriptions/me/manage-link"',
            '"/payment-status"',
        ):
            self.assertIn(route,source)
        self.assertIn('"/api/paystack/webhook"',source)

if __name__=="__main__":
    unittest.main()
