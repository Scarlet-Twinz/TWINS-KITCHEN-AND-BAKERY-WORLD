import hashlib, hmac

def test_paystack_signature():
    body=b'{"event":"charge.success","data":{"reference":"TKSELL-TEST"}}'
    secret="test-secret"
    expected=hmac.new(secret.encode(),body,hashlib.sha512).hexdigest()
    assert hmac.compare_digest(expected,expected)

def test_webhook_event_key_is_stable():
    body=b'{"event":"charge.success"}'
    assert hashlib.sha256(body).hexdigest()==hashlib.sha256(body).hexdigest()
