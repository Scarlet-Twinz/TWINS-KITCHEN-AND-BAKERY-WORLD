import io,tempfile,unittest,zipfile
from pathlib import Path
from media_center import extract_zip,inspect_image_bytes,normalize_metadata,sha256_bytes,choose_match,validate_rights,sanitize_filename
PNG_160=bytes([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,160,0,0,0,160,8,2,0,0,0,0,0,0,0,0,73,69,78,68,174,66,96,130])
class MediaCenterTests(unittest.TestCase):
    def test_upload_validation(self):
        ok=inspect_image_bytes(PNG_160,".png"); self.assertTrue(ok.valid); self.assertEqual((ok.width,ok.height),(160,160))
        small=PNG_160[:16]+(32).to_bytes(4,"big")+PNG_160[20:]; self.assertFalse(inspect_image_bytes(small,".png").valid)
    def test_sha256_duplicate_detection(self):
        self.assertEqual(sha256_bytes(b"same"),sha256_bytes(b"same")); self.assertNotEqual(sha256_bytes(b"same"),sha256_bytes(b"different"))
    def test_zip_handling(self):
        with tempfile.TemporaryDirectory() as tmp:
            bio=io.BytesIO()
            with zipfile.ZipFile(bio,"w") as zf: zf.writestr("products/mixer.png",PNG_160); zf.writestr("catalogue.pdf",b"%PDF-1.7")
            extracted=extract_zip(bio.getvalue(),Path(tmp)); self.assertEqual(len(extracted),2)
        bad=io.BytesIO()
        with zipfile.ZipFile(bad,"w") as zf: zf.writestr("../escape.png",PNG_160)
        with self.assertRaises(ValueError): extract_zip(bad.getvalue(),Path(tempfile.mkdtemp()))
    def test_rights_provenance(self):
        self.assertEqual(validate_rights("owned","owned"),(True,"")); self.assertFalse(validate_rights("review","owned")[0])
        m=normalize_metadata({"sourceType":"owned","rightsStatus":"owned","provenance":"Twins Kitchen & Bakery World"})
        self.assertEqual(m["provenance"],"Twins Kitchen & Bakery World")
    def test_matching_is_review_not_auto_publish(self):
        self.assertEqual(choose_match("58",None,{},[])["mode"],"explicit-product-id")
        self.assertEqual(choose_match(None,"58",{},[])["mode"],"owner-assignment")
        self.assertEqual(choose_match(None,None,{"productId":"58"},[])["mode"],"trusted-metadata")
        self.assertEqual(choose_match(None,None,{},[{"productId":"58","status":"HIGH","score":0.98}])["status"],"REVIEW")
    def test_filename_sanitization(self): self.assertEqual(sanitize_filename("../../mixer.jpg"),"mixer.jpg")
if __name__=="__main__": unittest.main()
