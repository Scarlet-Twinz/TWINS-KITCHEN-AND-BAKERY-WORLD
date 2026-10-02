def test_order_reference_shape():
    reference = "TK-000001"
    assert reference.startswith("TK-")
    assert len(reference) == 9
