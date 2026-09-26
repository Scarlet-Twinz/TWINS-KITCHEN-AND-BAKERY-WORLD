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


    def test_asset_intake_failure_returns_underlying_reason(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock, patch
        from fastapi import HTTPException

        with tempfile.TemporaryDirectory() as tmp:
            report=Path(tmp)/"report.json"
            report.write_text('{"results":[{"asset":"whatsapp.jpeg","state":"UNRESOLVED","reason":"Product assignment is required for validation"}]}',encoding="utf-8")
            completed=MagicMock(returncode=1,stderr="",stdout="")
            with patch("main.subprocess.run",return_value=completed):
                from main import run_asset_intake
                with self.assertRaises(HTTPException) as ctx:
                    run_asset_intake(Path(tmp),Path(tmp)/"manifest.json",report)
            self.assertEqual(ctx.exception.status_code,422)
            self.assertIn("Product assignment is required for validation",str(ctx.exception.detail))

    def test_catalogue_suggestions_only_use_canonical_candidates_and_max_five(self):
        from main import catalogue_suggestions
        asset={"filename":"commercial bread slicer.jpg","provenance":"","sourceUrl":"","license":"","attribution":"","role":"primary"}
        products=[{"id":i,"n":("Commercial Bread Slicer" if i==303 else "Commercial Bread Cutter" if i==304 else "Bread Slicer Model "+str(i)),"category":"Bakery Equipment"} for i in range(1,9)]
        suggestions=catalogue_suggestions(asset,products)
        self.assertLessEqual(len(suggestions),5)
        self.assertTrue(all(str(x["productId"]) in {str(p["id"]) for p in products} for x in suggestions))

    def test_catalogue_suggestions_do_not_assign_assets(self):
        from main import catalogue_suggestions
        asset={"filename":"cup sealer.jpg","provenance":"","sourceUrl":"","license":"","attribution":"","role":"primary","productId":None}
        suggestions=catalogue_suggestions(asset,[{"id":58,"n":"Cup Sealing Machine","category":"Packaging Equipment"}])
        self.assertEqual(suggestions[0]["productId"],"58")
        self.assertIsNone(asset["productId"])

    def test_catalogue_suggestions_whatsapp_filename_is_unresolved_without_other_evidence(self):
        from main import catalogue_suggestions
        asset={"filename":"WhatsApp Image 2026-09-19 at 2.27.49 PM.jpeg","provenance":"","sourceUrl":"","license":"","attribution":"","role":"primary"}
        self.assertEqual(catalogue_suggestions(asset,[{"id":1,"n":"Mixer"},{"id":2,"n":"Dishwasher"}]),[])

    def test_media_list_stays_available_when_catalogue_suggestions_service_is_unavailable(self):
        from unittest.mock import MagicMock, patch
        token=sign_session(str(uuid.uuid4()),"owner")
        conn=MagicMock()
        conn.__enter__.return_value=conn
        conn.__exit__.return_value=False
        rows=MagicMock()
        rows.fetchall.return_value=[]
        conn.execute.return_value=rows
        with patch("main.db",return_value=conn), patch("main.catalogue_products",side_effect=__import__("fastapi").HTTPException(status_code=503,detail="Catalogue validation service is unavailable")):
            r=self.client.get("/api/admin/media",cookies={"twins_session":token})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()["assets"],[])

    def test_non_owner_upload_returns_403(self):
        token=sign_session(str(uuid.uuid4()),"admin")
        r=self.client.post("/api/admin/media/upload",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_owner_can_delete_all_queued_assets(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock, patch

        actor_id=uuid.uuid4()
        first_id,second_id=uuid.uuid4(),uuid.uuid4()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            paths=[root/"incoming"/"one.jpg",root/"incoming"/"two.jpg"]
            for path in paths:
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(b"fake-jpeg")
            conn=MagicMock()
            conn.__enter__.return_value=conn
            conn.__exit__.return_value=False
            rows=MagicMock()
            rows.fetchall.return_value=[(first_id,str(paths[0]),"one.jpg"),(second_id,str(paths[1]),"two.jpg")]
            protected=MagicMock()
            protected.fetchone.return_value=(0,)
            deleted=MagicMock()
            deleted.rowcount=2
            conn.execute.side_effect=[rows,protected,deleted]
            token=sign_session(str(actor_id),"owner")
            with patch("main.media_root",return_value=root), patch("main.db",return_value=conn), patch("main.audit_media_action"):
                r=self.client.delete("/api/admin/media/queue",cookies={"twins_session":token})
            self.assertEqual(r.status_code,200)
            self.assertEqual(r.json()["deletedCount"],2)
            self.assertFalse(paths[0].exists())
            self.assertFalse(paths[1].exists())

    def test_non_owner_cannot_delete_all_queued_assets(self):
        token=sign_session(str(uuid.uuid4()),"staff")
        r=self.client.delete("/api/admin/media/queue",cookies={"twins_session":token})
        self.assertEqual(r.status_code,403)

    def test_delete_all_leaves_protected_queue_assets_untouched(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock, patch

        actor_id=uuid.uuid4()
        queued_id=uuid.uuid4()
        protected_id=uuid.uuid4()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            queued_path=root/"incoming"/"queued.jpg"
            queued_path.parent.mkdir(parents=True)
            queued_path.write_bytes(b"fake-jpeg")
            conn=MagicMock()
            conn.__enter__.return_value=conn
            conn.__exit__.return_value=False
            rows=MagicMock()
            rows.fetchall.return_value=[(queued_id,str(queued_path),"queued.jpg")]
            protected=MagicMock()
            protected.fetchone.return_value=(1,)
            deleted=MagicMock()
            deleted.rowcount=1
            conn.execute.side_effect=[rows,protected,deleted]
            token=sign_session(str(actor_id),"owner")
            with patch("main.media_root",return_value=root), patch("main.db",return_value=conn), patch("main.audit_media_action"):
                r=self.client.delete("/api/admin/media/queue",cookies={"twins_session":token})
            self.assertEqual(r.status_code,200)
            self.assertEqual(r.json()["deletedCount"],1)
            self.assertEqual(r.json()["protectedCount"],1)
            delete_call=conn.execute.call_args_list[2]
            self.assertIn(str(queued_id),str(delete_call))
            self.assertNotIn(str(protected_id),str(delete_call))

    def test_queue_refresh_after_delete_all_returns_empty(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock, patch

        actor_id=uuid.uuid4()
        asset_id=uuid.uuid4()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            path=root/"incoming"/"refresh.jpg"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"fake-jpeg")
            delete_conn=MagicMock()
            delete_conn.__enter__.return_value=delete_conn
            delete_conn.__exit__.return_value=False
            rows=MagicMock()
            rows.fetchall.return_value=[(asset_id,str(path),"refresh.jpg")]
            protected=MagicMock()
            protected.fetchone.return_value=(0,)
            deleted=MagicMock()
            deleted.rowcount=1
            delete_conn.execute.side_effect=[rows,protected,deleted]
            list_conn=MagicMock()
            list_conn.__enter__.return_value=list_conn
            list_conn.__exit__.return_value=False
            empty=MagicMock()
            empty.fetchall.return_value=[]
            list_conn.execute.return_value=empty
            token=sign_session(str(actor_id),"owner")
            with patch("main.media_root",return_value=root), patch("main.db",side_effect=[delete_conn,list_conn]), patch("main.audit_media_action"):
                deleted_response=self.client.delete("/api/admin/media/queue",cookies={"twins_session":token})
                self.assertEqual(deleted_response.status_code,200)
                refreshed=self.client.get("/api/admin/media?status=QUEUED",cookies={"twins_session":token})
            self.assertEqual(refreshed.status_code,200)
            self.assertEqual(refreshed.json()["assets"],[])

if __name__=="__main__":
    unittest.main()
