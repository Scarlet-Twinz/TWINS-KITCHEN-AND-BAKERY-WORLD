from backend.main import group_candidate_assets, suggest_candidate_name

def asset(asset_id, filename, width=1200, height=900, provenance="Twins Kitchen", source_url="", license_text="", attribution=""):
    return (asset_id, filename, "sha-"+asset_id, width, height, provenance, source_url, license_text, attribution, "primary", None, "REVIEW")

def test_one_new_product_candidate_is_single_group():
    groups=group_candidate_assets([asset("a","new-oven.jpg")])
    assert len(groups)==1
    assert groups[0]["assetIds"]==["a"]
    assert groups[0]["reviewRequired"] is True

def test_multiple_photos_of_one_product_group_together():
    groups=group_candidate_assets([
        asset("a","commercial-oven-front.jpg"),
        asset("b","commercial-oven-side.jpg"),
        asset("c","commercial-oven-control.jpg"),
    ])
    assert any(set(g["assetIds"])=={"a","b","c"} for g in groups)

def test_visually_similar_distinct_metadata_does_not_force_group():
    groups=group_candidate_assets([
        asset("a","planetary-mixer-20l.jpg"),
        asset("b","planetary-mixer-40l.jpg"),
    ])
    assert len(groups)==2 or all(g["reviewRequired"] for g in groups)

def test_insufficient_evidence_requires_review_name():
    name,evidence=suggest_candidate_name([{"filename":"IMG_0001.jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
    assert name=="img 0001" or name=="New Product — Review Required"
    assert evidence is not None

def test_suggested_name_uses_only_supplied_evidence():
    name,evidence=suggest_candidate_name([{"filename":"commercial-stainless-work-table.jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
    assert "stainless" in name.lower()
    assert "table" in name.lower()
    assert "watt" not in name.lower()

def test_no_hallucinated_specifications_from_empty_metadata():
    name,evidence=suggest_candidate_name([{"filename":"","provenance":"","sourceUrl":"","license":"","attribution":""}])
    assert name=="New Product — Review Required"

def test_grouping_can_flag_low_confidence_for_review():
    groups=group_candidate_assets([
        asset("a","photo-a.jpg"),
        asset("b","photo-b.jpg"),
    ])
    assert all("confidence" in g and "reviewRequired" in g for g in groups)

def test_candidate_name_length_is_bounded():
    long_name="very-long-product-name-"*30
    name,_=suggest_candidate_name([{"filename":long_name+".jpg","provenance":"","sourceUrl":"","license":"","attribution":""}])
    assert len(name)<=160

def test_backend_approval_assigns_next_id_after_530_floor():
    import inspect
    from backend import main
    source=inspect.getsource(main.media_candidate_approve)
    assert "max(530" in source
    assert "next_id" in source
    assert "insert into products" in source

def test_browser_never_supplies_canonical_id_for_candidate_creation():
    from pathlib import Path
    source=Path("admin/media/media-center.js").read_text(encoding="utf-8")
    assert "/api/admin/media/candidates" in source
    assert "assetIds:[assetId]" in source
    assert "productId" not in source[source.find("createNewProductCandidate"):source.find("async function loadCandidates")]
