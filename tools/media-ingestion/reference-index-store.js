const crypto = require("node:crypto");

const REFERENCE_INDEX_VERSION = 2;
const EMBEDDING_VERSION = 1;

function assertProductId(productId) {
  if (productId === null || productId === undefined || String(productId).trim() === "") {
    throw new Error("Reference productId is required");
  }
  return String(productId);
}

function normalizeReference(input, now = new Date().toISOString()) {
  const productId = assertProductId(input.productId);
  const checksum = input.checksum ? String(input.checksum) : "";
  const referenceAssetId = input.referenceAssetId
    ? String(input.referenceAssetId)
    : "ref_" + crypto.createHash("sha256").update(productId + "|" + checksum + "|" + String(input.mediaAssetId || input.mediaPath || "")).digest("hex");
  return {
    referenceAssetId,
    productId,
    mediaAssetId: input.mediaAssetId == null ? null : String(input.mediaAssetId),
    mediaPath: input.mediaPath == null ? null : String(input.mediaPath),
    checksum,
    model: String(input.model || ""),
    modelRevision: String(input.modelRevision || ""),
    embeddingVersion: Number(input.embeddingVersion || EMBEDDING_VERSION),
    indexVersion: Number(input.indexVersion || REFERENCE_INDEX_VERSION),
    source: String(input.source || "unknown"),
    rights: String(input.rights || "unknown"),
    role: String(input.role || "primary"),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
    status: String(input.status || "ACTIVE"),
    embedding: input.embedding == null ? null : Array.from(input.embedding, Number)
  };
}

function emptyIndex(options = {}) {
  return {
    schemaVersion: Number(options.schemaVersion || REFERENCE_INDEX_VERSION),
    indexVersion: REFERENCE_INDEX_VERSION,
    model: String(options.model || ""),
    modelRevision: String(options.modelRevision || ""),
    embeddingVersion: Number(options.embeddingVersion || EMBEDDING_VERSION),
    updatedAt: String(options.updatedAt || new Date().toISOString()),
    references: []
  };
}

function createIndex(references = [], options = {}) {
  const index = emptyIndex(options);
  for (const reference of references) upsertReference(index, reference, { now: options.now });
  return index;
}

function findReference(index, referenceAssetId) {
  return (index.references || []).find(item => item.referenceAssetId === String(referenceAssetId)) || null;
}

function checksumOwner(index, checksum, exceptReferenceAssetId = null) {
  if (!checksum) return null;
  return (index.references || []).find(item =>
    item.status !== "INVALIDATED" &&
    item.checksum === checksum &&
    item.referenceAssetId !== String(exceptReferenceAssetId || "")
  ) || null;
}

function upsertReference(index, input, options = {}) {
  if (!index || !Array.isArray(index.references)) throw new Error("Invalid reference index");
  const reference = normalizeReference(input, options.now);
  if (index.model && reference.model && index.model !== reference.model) throw new Error("Incompatible reference embedding model");
  if (index.modelRevision && reference.modelRevision && index.modelRevision !== reference.modelRevision) throw new Error("Incompatible reference embedding model revision");
  if (Number(index.embeddingVersion) !== Number(reference.embeddingVersion)) throw new Error("Incompatible reference embedding version");
  const duplicate = checksumOwner(index, reference.checksum, reference.referenceAssetId);
  if (duplicate && duplicate.productId !== reference.productId) throw new Error("Duplicate reference checksum is already associated with product " + duplicate.productId);
  const existing = findReference(index, reference.referenceAssetId);
  if (existing) {
    Object.assign(existing, reference, { createdAt: existing.createdAt });
  } else {
    index.references.push(reference);
  }
  index.model ||= reference.model;
  index.modelRevision ||= reference.modelRevision;
  index.embeddingVersion = reference.embeddingVersion;
  index.updatedAt = String(options.now || new Date().toISOString());
  return findReference(index, reference.referenceAssetId);
}

function attachEmbedding(index, referenceAssetId, embedding, metadata = {}) {
  const reference = findReference(index, referenceAssetId);
  if (!reference) throw new Error("Unknown referenceAssetId: " + referenceAssetId);
  if (metadata.model && metadata.model !== reference.model) throw new Error("Embedding model does not match reference metadata");
  if (metadata.modelRevision && metadata.modelRevision !== reference.modelRevision) throw new Error("Embedding model revision does not match reference metadata");
  if (Number(metadata.embeddingVersion || reference.embeddingVersion) !== Number(reference.embeddingVersion)) throw new Error("Embedding version does not match reference metadata");
  reference.embedding = Array.from(embedding || [], Number);
  reference.updatedAt = String(metadata.updatedAt || new Date().toISOString());
  return reference;
}

function invalidateReference(index, referenceAssetId, reason = "reference invalidated", now = new Date().toISOString()) {
  const reference = findReference(index, referenceAssetId);
  if (!reference) return false;
  reference.status = "INVALIDATED";
  reference.reason = reason;
  reference.embedding = null;
  reference.updatedAt = now;
  index.updatedAt = now;
  return true;
}

function referencesForProduct(index, productId) {
  const id = assertProductId(productId);
  return (index.references || []).filter(item => item.productId === id && item.status !== "INVALIDATED");
}

function aggregateByProduct(index, references = index.references) {
  const grouped = new Map();
  for (const reference of references || []) {
    if (!reference || reference.status === "INVALIDATED") continue;
    const id = assertProductId(reference.productId);
    if (!grouped.has(id)) grouped.set(id, { productId: id, references: [], embeddings: [] });
    const product = grouped.get(id);
    product.references.push(reference);
    if (Array.isArray(reference.embedding) && reference.embedding.length) product.embeddings.push(reference.embedding);
  }
  return [...grouped.values()];
}

function cacheKey(reference, options = {}) {
  const model = options.model || reference.model;
  const revision = options.modelRevision || reference.modelRevision;
  const embeddingVersion = options.embeddingVersion || reference.embeddingVersion;
  return ["twins-reference", reference.referenceAssetId, reference.checksum, model, revision, embeddingVersion, REFERENCE_INDEX_VERSION].join("|");
}

function validateIndex(index) {
  const seen = new Set();
  for (const reference of index?.references || []) {
    assertProductId(reference.productId);
    if (seen.has(reference.referenceAssetId)) throw new Error("Duplicate referenceAssetId: " + reference.referenceAssetId);
    seen.add(reference.referenceAssetId);
    if (reference.status !== "INVALIDATED" && reference.checksum) {
      const duplicate = (index.references || []).find(other => other !== reference && other.status !== "INVALIDATED" && other.checksum === reference.checksum && other.productId !== reference.productId);
      if (duplicate) throw new Error("Duplicate checksum across products: " + reference.checksum);
    }
  }
  return true;
}

module.exports = {
  REFERENCE_INDEX_VERSION,
  EMBEDDING_VERSION,
  assertProductId,
  normalizeReference,
  emptyIndex,
  createIndex,
  findReference,
  upsertReference,
  attachEmbedding,
  invalidateReference,
  referencesForProduct,
  aggregateByProduct,
  cacheKey,
  validateIndex
};
