const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  loadCatalogue, readExistingRules, computeMediaState,
  validateManifest, applyMappings
} = require("../validator");
const { buildPendingManifest } = require("../collector");

const DATA = path.join(__dirname, "..", "..", "..", "data.js");

test("loads the current catalogue and reports pending products", () => {
  const data = loadCatalogue();
  const state = computeMediaState(data, readExistingRules());
  assert.ok(state.counts.catalogue > 0);
  assert.ok(state.counts.pending >= 0);
  assert.equal(state.counts.catalogue, data.P.length);
  assert.equal(state.counts.catalogue, 530);
  const ids = data.P.map(p => String(p.id));
  assert.equal(new Set(ids).size, 530);
});

test("legacy duplicate assignments in CATALOG_MEDIA_OVERRIDES_BY_ID are preserved", () => {
  const data = loadCatalogue();
  const values = data.rawIdPairs.map(pair => pair[1]);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const legacyDuplicateUrls = [...counts.entries()].filter(([, count]) => count > 1);
  assert.ok(legacyDuplicateUrls.length > 0, "expected current repository to contain legacy duplicate assignments");
  const state = computeMediaState(data, readExistingRules());
  // Existing duplicate assignments are intentionally preserved; uniqueMedia is
  // therefore lower than the assigned population by the legacy duplicate count.
  assert.equal(state.counts.verified, 226);
  assert.equal(state.counts.uniqueMedia, 209);
  assert.equal(state.counts.duplicates, 17);
});

test("rejects nonexistent, unverified, missing-verification and invalid-url candidates", () => {
  const data = loadCatalogue();
  const state = computeMediaState(data, readExistingRules());
  const pending = state.pending[0];
  assert.ok(pending);

  const manifest = [
    { productId: "does-not-exist", url: "https://example.test/a.jpg", verification: { verified: true, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" } },
    { productId: String(pending.id), url: "https://example.test/b.jpg", verification: { verified: false, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" } },
    { productId: String(pending.id), url: "https://example.test/c.jpg", verification: { verified: true, checkedAt: "2026-09-21T00:00:00Z" } },
    { productId: String(pending.id), url: "not-a-url", verification: { verified: true, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" } }
  ];
  const result = validateManifest(manifest, state);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, manifest.length);
  assert.ok(result.rejected.some(x => /does not exist/.test(x.reason)));
  assert.ok(result.rejected.some(x => /unverified/.test(x.reason)));
  assert.ok(result.rejected.some(x => /verification source/.test(x.reason)));
  assert.ok(result.rejected.some(x => /absolute HTTP/.test(x.reason)));
});

test("rejects a URL already assigned to another product and duplicate URLs in the batch", () => {
  const data = loadCatalogue();
  const state = computeMediaState(data, readExistingRules());
  assert.ok(state.pending.length >= 2);
  const existingUrl = state.valid[0].candidate.src;
  assert.ok(existingUrl, "current catalogue should contain an existing HTTP media URL");
  const make = (id, url) => ({
    productId: String(id),
    url,
    verification: { verified: true, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" }
  });

  const result = validateManifest([
    make(state.pending[0].id, existingUrl),
    make(state.pending[1].id, "https://example.test/new.jpg"),
    make(state.pending[0].id, "https://example.test/new.jpg")
  ], state);

  assert.equal(result.accepted.length, 1);
  assert.ok(result.rejected.some(x => /already assigned/.test(x.reason)));
  assert.ok(result.rejected.some(x => /duplicate URL/.test(x.reason)));
});

test("dry-run validation does not mutate data.js", () => {
  const before = fs.readFileSync(DATA, "utf8");
  const data = loadCatalogue();
  const state = computeMediaState(data, readExistingRules());
  validateManifest([{
    productId: String(state.pending[0].id),
    url: "https://example.test/dry-run.jpg",
    verification: { verified: true, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" }
  }], state);
  assert.equal(fs.readFileSync(DATA, "utf8"), before);
});

test("apply changes only the override block and becomes idempotent", () => {
  const original = fs.readFileSync(DATA, "utf8");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twins-media-ingestion-"));
  const temp = path.join(tempDir, "data.js");
  fs.writeFileSync(temp, original, "utf8");

  const data = loadCatalogue(temp);
  const state = computeMediaState(data, readExistingRules());
  const pending = state.pending.find(p => !state.blocklist[String(p.id)]);
  assert.ok(pending, "current catalogue should contain a non-blocklisted pending product");
  const url = "https://example.test/idempotent.jpg";
  const result = applyMappings(temp, [{ productId: String(pending.id), url }]);
  assert.equal(result.changed, true);

  const once = fs.readFileSync(temp, "utf8");
  assert.equal(once.split(url).length - 1, 1);

  const repeatState = {
    ...state,
    byId: new Map([[String(pending.id), pending]]),
    mappedIds: new Set([String(pending.id)])
  };
  const secondValidation = validateManifest([{
    productId: String(pending.id),
    url,
    verification: { verified: true, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" }
  }], repeatState);

  assert.equal(secondValidation.accepted.length, 0);
  assert.match(secondValidation.rejected[0].reason, /already has a valid media mapping/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});


test("pending manifest is deterministic and contains exactly the current pending population", () => {
  const first = buildPendingManifest(loadCatalogue(), readExistingRules());
  const second = buildPendingManifest(loadCatalogue(), readExistingRules());
  assert.deepEqual(first, second);
  assert.equal(first.counts.catalogue, 530);
  assert.equal(first.counts.assigned, 226);
  assert.equal(first.counts.pending, 304);
  assert.equal(first.products.length, 304);
  assert.equal(new Set(first.products.map(x => x.productId)).size, 304);
  assert.ok(first.products.every(x => x.currentMediaStatus === "PENDING"));
});

test("accepts verification manifest shape with candidatesReviewed", () => {
  const state = computeMediaState(loadCatalogue(), readExistingRules());
  const pending = state.pending[0];
  const result = validateManifest({
    schemaVersion: 1,
    batchId: "verification-shape-test",
    candidatesReviewed: [{
      productId: String(pending.id),
      url: "https://example.test/candidates-reviewed.jpg",
      status: "VERIFIED",
      verification: {
        verified: true,
        sourceUrl: "https://example.test/source",
        verifiedAt: "2026-09-21T00:00:00Z"
      }
    }]
  }, state);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
});

test("candidate schema requires a VERIFIED status before acceptance", () => {
  const state = computeMediaState(loadCatalogue(), readExistingRules());
  const pending = state.pending[0];
  const result = validateManifest([{
    productId: String(pending.id),
    url: "https://example.test/candidate.jpg",
    status: "CANDIDATE",
    verification: {
      verified: false,
      sourceUrl: "https://example.test/source",
      checkedAt: "2026-09-21T00:00:00Z"
    }
  }], state);
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reason, /not VERIFIED/);
});

test("rejects missing source and missing verification", () => {
  const state = computeMediaState(loadCatalogue(), readExistingRules());
  const pending = state.pending[0];
  const result = validateManifest([
    { productId: String(pending.id), url: "https://example.test/a.jpg", status: "VERIFIED", verification: { verified: true, checkedAt: "2026-09-21T00:00:00Z" } },
    { productId: String(pending.id), url: "https://example.test/b.jpg", status: "VERIFIED" }
  ], state);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 2);
  assert.ok(result.rejected.every(x => /verification/.test(x.reason)));
});

test("normalizes URLs before duplicate detection", () => {
  const state = computeMediaState(loadCatalogue(), readExistingRules());
  const [a, b] = state.pending;
  const make = (id, url) => ({
    productId: String(id),
    url,
    status: "VERIFIED",
    verification: { verified: true, sourceUrl: "https://example.test/source", checkedAt: "2026-09-21T00:00:00Z" }
  });
  const result = validateManifest([
    make(a.id, "https://Example.test:443/image.jpg#view"),
    make(b.id, "https://example.test/image.jpg")
  ], state);
  assert.equal(result.accepted.length, 1);
  assert.ok(result.rejected.some(x => /duplicate URL/.test(x.reason)));
});

test("candidate generation never writes data.js", () => {
  const before = fs.readFileSync(DATA, "utf8");
  buildPendingManifest(loadCatalogue(), readExistingRules());
  assert.equal(fs.readFileSync(DATA, "utf8"), before);
});
