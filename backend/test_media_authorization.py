import uuid
import unittest
from starlette.requests import Request
from main import require_owner, sign_session
from fastapi import HTTPException

def request_with_cookie(token):
    scope={"type":"http","method":"GET","path":"/api/admin/media","headers":[(b"cookie",("twins_session="+token).encode())]}
    return Request(scope)

class MediaAuthorizationTests(unittest.TestCase):
    def test_unauthenticated_is_rejected(self):
        with self.assertRaisesRegex(HTTPException,"Authentication required"):
            require_owner(request_with_cookie(""))

    def test_non_owner_is_rejected(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        with self.assertRaisesRegex(HTTPException,"Owner access required"):
            require_owner(request_with_cookie(token))

    def test_owner_is_accepted(self):
        token=sign_session(str(uuid.uuid4()),"owner")
        session=require_owner(request_with_cookie(token))
        self.assertEqual(session["role"],"owner")

if __name__=="__main__":
    unittest.main()
