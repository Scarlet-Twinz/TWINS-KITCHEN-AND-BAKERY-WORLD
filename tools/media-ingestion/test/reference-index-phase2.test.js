const assert = require("node:assert/strict");
const test = require("node:test");
const store = require("../reference-index-store");

function ref(productId, overrides = {}) {
  return {
    referenceAssetId: overrides.referenceAssetId || "ref-" + productId + "-" + (overrides.suffix || "a"),
    productId,
    mediaAssetId: overrides.mediaAssetId || "asset-" + productId,
    checksum: overrides.checksum || "sha-" + productId + "-" + (overrides.suffix || "a"),
    model: "Xenova/mobileclip_s0",
    modelRevision: "main",
    embeddingVersion: 1,
    source: "twins-owned",
    rights: "owned",
    role: "primary",
    ...overrides
  };
}

test("every reference has explicit product identity and multiple references are retained", () => {
  const index = store.createIndex([
    ref("12"),
    ref("12", { suffix: "b", role: "detail" })
  ], { model: "Xenova/mobileclip_s0", modelRevision: "main" });
  assert.equal(index.references.length, 2);
  assert.equal(store.referencesForProduct(index, "12").length, 2);
  assert.equal(store.aggregateByProduct(index)[0].references.length, 2);
  assert.throws(() => store.normalizeReference({ checksum: "x" }), /productId is required/);
});

test("duplicate checksum is rejected across products but allowed to be idempotent for the same reference", () => {
  const index = store.createIndex([ref("12")], { model: "Xenova/mobileclip_s0", modelRevision: "main" });
  assert.throws(() => store.upsertReference(index, ref("13", { checksum: "sha-12-a" })), /Duplicate reference checksum/);
  assert.doesNotThrow(() => store.upsertReference(index, ref("12", { checksum: "sha-12-a" })));
});

test("incremental insertion does not rebuild existing references", () => {
  const index = store.createIndex([ref("12")], { model: "Xenova/mobileclip_s0", modelRevision: "main" });
  const first = index.references[0];
  store.upsertReference(index, ref("13"), { now: "2026-09-28T00:00:00.000Z" });
  assert.strictEqual(index.references[0], first);
  assert.equal(index.references.length, 2);
  assert.equal(index.references[1].productId, "13");
});

test("invalidating a changed reference removes its embedding from active evidence", () => {
  const index = store.createIndex([ref("12")], { model: "Xenova/mobileclip_s0", modelRevision: "main" });
  store.attachEmbedding(index, "ref-12-a", [1, 0, 0], { model: "Xenova/mobileclip_s0", modelRevision: "main", embeddingVersion: 1 });
  assert.equal(store.aggregateByProduct(index)[0].embeddings.length, 1);
  assert.equal(store.invalidateReference(index, "ref-12-a", "checksum changed"), true);
  assert.equal(store.referencesForProduct(index, "12").length, 0);
  assert.equal(store.aggregateByProduct(index).length, 0);
  assert.equal(index.references[0].embedding, null);
});

test("embedding metadata and cache key detect model/revision/version incompatibility", () => {
  const index = store.createIndex([ref("12")], { model: "Xenova/mobileclip_s0", modelRevision: "main" });
  assert.throws(() => store.upsertReference(index, ref("13", { modelRevision: "other" })), /revision/);
  assert.throws(() => store.attachEmbedding(index, "ref-12-a", [1], { modelRevision: "other" }), /revision/);
  const key = store.cacheKey(index.references[0]);
  assert.match(key, /ref-12-a/);
  assert.match(key, /sha-12-a/);
  assert.match(key, /Xenova\/mobileclip_s0/);
  assert.match(key, /main/);
  assert.match(key, /1/);
});

test("product aggregation preserves all supporting references", () => {
  const index = store.createIndex([
    ref("20", { suffix: "front", role: "primary" }),
    ref("20", { suffix: "side", role: "detail" }),
    ref("21")
  ], { model: "Xenova/mobileclip_s0", modelRevision: "main" });
  const groups = store.aggregateByProduct(index);
  const twenty = groups.find(x => x.productId === "20");
  assert.equal(twenty.references.length, 2);
  assert.equal(twenty.references[0].role, "primary");
  assert.equal(twenty.references[1].role, "detail");
});

test("index validation rejects duplicate reference identities and missing product IDs", () => {
  const index = store.emptyIndex({ model: "Xenova/mobileclip_s0", modelRevision: "main" });
  index.references = [ref("1"), { ...ref("2"), referenceAssetId: "ref-1-a" }];
  assert.throws(() => store.validateIndex(index), /Duplicate referenceAssetId/);
  index.references = [{ ...ref(""), productId: "" }];
  assert.throws(() => store.validateIndex(index), /productId is required/);
});
