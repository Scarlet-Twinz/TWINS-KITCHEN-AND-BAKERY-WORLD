const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const referenceIndex = require("../reference-index");

test("reference index schema is versioned and preserves explicit asset/product identity", () => {
  assert.equal(referenceIndex.REFERENCE_SCHEMA_VERSION, 2);
  assert.equal(referenceIndex.REFERENCE_INDEX_VERSION, 2);
  assert.equal(referenceIndex.MODEL, "Xenova/mobileclip_s0");
  assert.equal(referenceIndex.MODEL_REVISION, "main");
  assert.match(referenceIndex.legacyAssetId("abc"), /^legacy_asset_/);
  assert.match(referenceIndex.referenceAssetId("abc", "60"), /^legacy_ref_abc_60$/);
});

test("reference manifest distinguishes duplicate media from multiple references", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "twins-reference-"));
  fs.mkdirSync(path.join(tempRoot, "assets", "media"), { recursive: true });
  const validImage = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000c8000000c8000806000000",
    "hex"
  );
  fs.writeFileSync(path.join(tempRoot, "assets", "media", "one.png"), validImage);
  fs.writeFileSync(path.join(tempRoot, "assets", "media", "two.png"), validImage);

  const product = id => ({
    id,
    n: "Test product " + id,
    i: "assets/media/" + (id === 1 ? "one.png" : "two.png"),
    media: { images: ["assets/media/" + (id === 1 ? "one.png" : "two.png")] }
  });
  const data = {
    P: [product(1), product(2)],
    byId: {
      "1": "assets/media/one.png",
      "2": "assets/media/two.png"
    },
    byName: {}
  };
  const rules = { blocklist: {} };
  const manifest = referenceIndex.buildReferenceManifest({ data, rules, root: tempRoot, now: "2026-01-01T00:00:00.000Z" });
  assert.equal(manifest.catalogue.population, 2);
  assert.equal(manifest.coverage.duplicateMedia, 1);
  assert.equal(manifest.coverage.usableVisualReferences, 0);
  assert.equal(manifest.references.filter(x => x.status === "DUPLICATE").length, 2);
});

test("reference manifest records unreachable local references without inventing a match", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "twins-reference-"));
  fs.mkdirSync(path.join(tempRoot, "assets", "media"), { recursive: true });
  const data = {
    P: [{ id: 7, n: "Missing product", i: "assets/media/missing.jpg" }],
    byId: {},
    byName: {}
  };
  const manifest = referenceIndex.buildReferenceManifest({ data, rules: { blocklist: {} }, root: tempRoot, now: "2026-01-01T00:00:00.000Z" });
  assert.equal(manifest.coverage.unreachableMedia, 1);
  assert.equal(manifest.references[0].status, "UNREACHABLE");
  assert.equal(manifest.references[0].productId, "7");
  assert.equal(manifest.references[0].assetId, null);
});

test("reference index contains only explicit identity-bearing usable references", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "twins-reference-"));
  fs.mkdirSync(path.join(tempRoot, "assets", "media"), { recursive: true });
  const png = Buffer.alloc(256);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, 4, "ascii");
  png.writeUInt32BE(256, 16);
  png.writeUInt32BE(256, 20);
  png.writeUInt8(8, 24);
  png.writeUInt8(6, 25);
  fs.writeFileSync(path.join(tempRoot, "assets", "media", "usable.png"), png);
  const data = { P: [{ id: 9, n: "Usable product", i: "assets/media/usable.png" }], byId: {}, byName: {} };
  const manifest = referenceIndex.buildReferenceManifest({ data, rules: { blocklist: {} }, root: tempRoot, now: "2026-01-01T00:00:00.000Z" });
  assert.equal(manifest.coverage.usableVisualReferences, 1);
  assert.equal(manifest.index.length, 1);
  assert.equal(manifest.index[0].productId, "9");
  assert.ok(manifest.index[0].assetId);
  assert.ok(manifest.index[0].referenceAssetId);
  assert.ok(manifest.index[0].checksum);
  assert.equal(manifest.index[0].indexVersion, 2);\n  assert.equal(manifest.index[0].embeddingVersion, 1);\n  assert.equal(manifest.index[0].mediaAssetId, manifest.index[0].assetId);
});
