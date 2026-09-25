import unittest
import uuid
from fastapi.testclient import TestClient
from main import app, sign_session

class MediaApiAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client=TestClient(app)

    def test_unauthenticated_media_endpoint_returns_401(self):
        r=self.client.get("/api/admin/media")
        self.assertEqual(r.status_code,401)

    def test_non_owner_media_endpoint_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        r=self.client.get("/api/admin/media",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_unauthenticated_media_content_returns_401(self):
        r=self.client.get("/api/admin/media/"+str(uuid.uuid4())+"/content")
        self.assertEqual(r.status_code,401)

    def test_non_owner_media_content_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        r=self.client.get("/api/admin/media/"+str(uuid.uuid4())+"/content",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_unauthenticated_media_delete_returns_401(self):
        r=self.client.delete("/api/admin/media/"+str(uuid.uuid4()))
        self.assertEqual(r.status_code,401)

    def test_non_owner_media_delete_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        r=self.client.delete("/api/admin/media/"+str(uuid.uuid4()),cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_non_owner_upload_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"admin")
        r=self.client.post("/api/admin/media/upload",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

if __name__=="__main__":
    unittest.main()
