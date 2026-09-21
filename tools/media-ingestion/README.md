# Bulk Media Ingestion

This tooling is separate from the storefront and does not replace the media-resolution logic in `app.js`.

## Commands

From the repository root:

```bash
node tools/media-ingestion/index.js audit
node tools/media-ingestion/index.js dry-run --manifest tools/media-ingestion/manifests/example-batch.json
node tools/media-ingestion/index.js apply --manifest path/to/batch.json
```

Optional JSON audit output:

```bash
node tools/media-ingestion/index.js dry-run --manifest batch.json --report reports/media-ingestion.json
```

## Batch manifest

Each candidate requires a product ID, an absolute image URL, and verification metadata:

```json
{
  "productId": "123",
  "url": "https://example.com/product.jpg",
  "mediaType": "image",
  "verification": {
    "verified": true,
    "sourceUrl": "https://example.com/product-page",
    "sourceName": "Example source",
    "checkedAt": "2026-09-21T12:00:00Z"
  },
  "notes": "Optional verification notes"
}
```

Candidates are rejected for missing/nonexistent product IDs, existing valid mappings, duplicate URLs, URLs already assigned to another product, missing verification, explicit unverified status, invalid source/timestamp, invalid URL, or unsupported media type.

Existing mappings are read as-is. Legacy duplicate assignments are not repaired or rewritten. The no-new-duplicates rule applies only to newly accepted mappings.

Apply only edits the existing `CATALOG_MEDIA_OVERRIDES_BY_ID` object in `data.js`; product records and `app.js` are not rewritten. Re-running the same batch is safe because applied products subsequently fail the existing-valid-mapping check.

Dry-run never writes `data.js`.

## Phase 2: candidate collection

The collector is discovery-only. It never writes product records or media mappings.

### Generate the canonical pending manifest

~~~bash
node tools/media-ingestion/index.js pending-manifest
~~~

This writes `tools/media-ingestion/manifests/pending-catalogue.json`. The output is deterministic: it is rebuilt from the canonical 530-product population and current media-resolution rules, sorted by numeric product ID.

The current repository baseline is **530 catalogue / 223 assigned / 307 pending**.

### Controlled candidate batches

Use the pending manifest as the only population source. Work in controlled batches of **25–50 products** rather than attempting all 307 at once.

Copy `manifests/candidate-batch-template.json` and fill it with candidate records. A candidate record contains:

- `productId`
- `productName`
- `category`
- `productType`
- `url` — candidate image URL
- `sourceUrl` — product/source page used to support the candidate
- `sourceProvider`
- `status` — `PENDING`, `CANDIDATE`, or `VERIFIED`
- `verification`
- optional `notes`

Discovery results must remain `CANDIDATE`. A URL alone never makes a candidate eligible for ingestion.

### Candidate status lifecycle

`PENDING` → no usable media has been established.

`CANDIDATE` → a possible image/source has been discovered, but identity/evidence has not been independently verified. It must not be accepted by `dry-run` or `apply`.

`VERIFIED` → the candidate has explicit verification metadata (`verification.verified: true`, valid source URL, valid timestamp) and can enter the existing validation pipeline. The validator still checks product existence, existing mappings, URL validity, duplicate URLs, blocklists, and media type.

For exact identity, verification should confirm the product name plus relevant type, capacity, model/specification, and other distinguishing attributes. A generic image of a similar product is insufficient.

### Duplicate detection

Candidate URLs are normalized before comparison. Protocol and hostname casing are normalized, fragments are removed, default HTTP/HTTPS ports are removed, and surrounding whitespace is trimmed. This prevents obvious URL variations from bypassing the no-new-duplicate rule.

Legacy duplicate URL assignments in the existing catalogue are preserved exactly as-is. They are not repaired by Phase 2.

### Candidate → dry-run → apply

1. Generate `pending-catalogue.json`.
2. Select 25–50 pending product IDs.
3. Record discovery candidates as `CANDIDATE`.
4. Independently verify product identity and source evidence.
5. Change only genuinely supported records to `VERIFIED` and provide verification metadata.
6. Run:

~~~bash
node tools/media-ingestion/index.js dry-run --manifest path/to/candidate-batch.json
~~~

7. Review accepted/rejected results. `CANDIDATE` records remain rejected.
8. Only after review should an approved verified batch be passed to `apply`.

`dry-run` never writes `data.js`. Phase 2 candidate generation itself never writes `data.js`.

### Discovery safety

Search-engine results, supplier pages, marketplaces, and manufacturer pages are evidence sources, not automatic verification. The collector records source information; it does not trust search ranking or image URLs as proof of exact product identity.

Do not collect or apply an image merely because it looks visually similar. If capacity, model, product type, or other distinguishing evidence is missing, keep the record `CANDIDATE`/ `PENDING`.

### Generated artifacts

- `manifests/pending-catalogue.json` — current deterministic 307-product pending population.
- `manifests/candidate-batch-template.json` — discovery/verification batch shape.
- `collector.js` — deterministic pending-manifest generator.
