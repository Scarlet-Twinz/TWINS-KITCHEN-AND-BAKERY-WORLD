import inspect
import unittest
from pathlib import Path

try:
    from .main import group_candidate_assets, suggest_candidate_name
    from . import main
except ImportError:
    from main import group_candidate_assets, suggest_candidate_name
    import main

def asset(asset_id, filename, width=1200, height=900, provenance="Twins Kitchen", source_url="", license_text="", attribution=""):
    return (asset_id, filename, "sha-"+asset_id, width, height, provenance, source_url, license_text, attribution, "primary", None, "REVIEW")

class Phase4CandidateTests(unittest.TestCase):
    def test_one_new_product_candidate_is_single_group(self):
        groups=group_candidate_assets([asset("a","new-oven.jpg")])
        self.assertEqual(len(groups),1)
        self.assertEqual(groups[0]["assetIds"],["a"])
        self.assertTrue(groups[0]["reviewRequired"])

    def test_multiple_photos_of_one_product_group_together(self):
        groups=group_candidate_assets([asset("a","commercial-oven-front.jpg"),asset("b","commercial-oven-side.jpg"),asset("c","commercial-oven-control.jpg")])
        self.assertTrue(any(set(g["assetIds"])=={"a","b","c"} for g in groups))

    def test_two_similar_products_do_not_silently_merge(self):
        groups=group_candidate_assets([asset("a","planetary-mixer-20l.jpg"),asset("b","planetary-mixer-40l.jpg")])
        self.assertTrue(len(groups)==2 or all(g["reviewRequired"] for g in groups))

    def test_missing_name_evidence_requires_review(self):
        name,evidence=suggest_candidate_name([{"filename":"","provenance":"","sourceUrl":"","license":"","attribution":""}])
        self.assertEqual(name,"New Product — Review Required")
        self.assertIsNone(evidence)

    def test_suggested_name_uses_only_supplied_evidence(self):
        name,_=suggest_candidate_name([{"filename":"commercial-stainless-work-table.jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
        self.assertIn("stainless",name.lower())
        self.assertIn("table",name.lower())
        self.assertNotIn("watt",name.lower())

    def test_camera_filename_alone_is_not_a_product_name(self):
        name,evidence=suggest_candidate_name([{"filename":"IMG_0001.jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
        self.assertEqual(name,"New Product — Review Required")
        self.assertIsNone(evidence)

    def test_no_hallucinated_specifications(self):
        name,_=suggest_candidate_name([{"filename":"work-table.jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
        self.assertNotIn("watt",name.lower())
        self.assertNotIn("model",name.lower())

    def test_low_confidence_group_is_reviewable(self):
        groups=group_candidate_assets([asset("a","photo-a.jpg"),asset("b","photo-b.jpg")])
        self.assertTrue(all("confidence" in g and "reviewRequired" in g for g in groups))

    def test_suggested_name_is_bounded(self):
        name,_=suggest_candidate_name([{"filename":"very-long-product-name-"*30+".jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
        self.assertLessEqual(len(name),160)

    def test_backend_assigns_next_id_after_530(self):
        source=inspect.getsource(main.media_candidate_approve)
        self.assertIn("max(530",source)
        self.assertIn("next_id",source)
        self.assertIn("insert into products",source)

    def test_browser_does_not_choose_canonical_id(self):
        source=Path(Path(__file__).resolve().parents[1].parent/"admin/media/media-center.js").read_text(encoding="utf-8")
        start=source.find("async function createNewProductCandidate")
        end=source.find("async function loadCandidates")
        self.assertGreaterEqual(start,0)
        segment=source[start:end]
        self.assertIn("assetIds:[assetId]",segment)
        self.assertNotIn("next_id",segment)
        self.assertNotIn("legacy_catalogue_id",segment)

if __name__=="__main__":
    unittest.main()
