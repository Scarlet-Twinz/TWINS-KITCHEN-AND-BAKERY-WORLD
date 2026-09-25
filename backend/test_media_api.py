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
        r=self.client.get("/api/admin/media/"+str(uuid.uuid4())+"/file")
        self.assertEqual(r.status_code,401)

    def test_non_owner_media_content_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        r=self.client.get("/api/admin/media/"+str(uuid.uuid4())+"/file",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_unauthenticated_media_delete_returns_401(self):
        r=self.client.delete("/api/admin/media/"+str(uuid.uuid4()))
        self.assertEqual(r.status_code,401)

    def test_non_owner_media_delete_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        r=self.client.delete("/api/admin/media/"+str(uuid.uuid4()),cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_owner_media_file_returns_image(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock, patch

        asset_id=uuid.uuid4()
        actor_id=uuid.uuid4()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            image=root/"incoming"/"twins-cup-sealer.jpg"
            image.parent.mkdir(parents=True)
            image.write_bytes(b"fake-jpeg")
            conn=MagicMock()
            conn.__enter__.return_value=conn
            conn.__exit__.return_value=False
            conn.execute.return_value.fetchone.return_value=(str(image),"image/jpeg","twins-cup-sealer.jpg")
            token=sign_session(str(actor_id),"owner")
            with patch("main.media_root",return_value=root), patch("main.db",return_value=conn):
                r=self.client.get("/api/admin/media/"+str(asset_id)+"/file",cookies={"twins_session":token})
            self.assertEqual(r.status_code,200)
            self.assertEqual(r.headers.get("content-type"),"image/jpeg")
            self.assertEqual(r.content,b"fake-jpeg")

    def test_owner_media_delete_returns_success(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock, patch

        asset_id=uuid.uuid4()
        actor_id=uuid.uuid4()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            image=root/"incoming"/"twins-cup-sealer.jpg"
            image.parent.mkdir(parents=True)
            image.write_bytes(b"fake-jpeg")
            conn=MagicMock()
            conn.__enter__.return_value=conn
            conn.__exit__.return_value=False
            first=MagicMock()
            first.fetchone.return_value=(asset_id,str(image),"twins-cup-sealer.jpg","QUEUED")
            mapping=MagicMock()
            mapping.fetchone.return_value=None
            deleted=MagicMock()
            deleted.rowcount=1
            conn.execute.side_effect=[first,mapping,deleted,MagicMock()]
            token=sign_session(str(actor_id),"owner")
            with patch("main.media_root",return_value=root), patch("main.db",return_value=conn), patch("main.audit_media_action"):
                r=self.client.delete("/api/admin/media/"+str(asset_id),cookies={"twins_session":token})
            self.assertEqual(r.status_code,200)
            self.assertEqual(r.json()["status"],"DELETED")
            self.assertFalse(image.exists())

    def test_non_owner_upload_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"admin")
        r=self.client.post("/api/admin/media/upload",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

if __name__=="__main__":
    unittest.main()
