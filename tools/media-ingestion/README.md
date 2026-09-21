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
