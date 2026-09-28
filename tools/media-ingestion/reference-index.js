const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  ROOT,
  loadCatalogue,
  readExistingRules,
  computeMediaState,
  normalizeUrl
} = require("./validator");
const { inspectImage, fileSha256 } = require("./asset-intake");

const REFERENCE_SCHEMA_VERSION = 2;
const REFERENCE_INDEX_VERSION = 2;
const MODEL = "Xenova/mobileclip_s0";
const MODEL_REVISION = "main";
const LOCAL_MEDIA_PREFIX = "assets/media/";
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function isLocalMedia(value) {
  return typeof value === "string" && value.startsWith(LOCAL_MEDIA_PREFIX);
}

function localMediaPath(value, root = ROOT) {
  if (!isLocalMedia(value)) return null;
  const relative = value.replace(/\\/g, "/");
  const resolved = path.resolve(root, relative);
  const mediaRoot = path.resolve(root, "assets", "media");
  try {
    const relativeToMediaRoot = path.relative(mediaRoot, resolved);
    const insideMediaRoot = resolved === mediaRoot ||
      (relativeToMediaRoot !== "" &&
        !relativeToMediaRoot.startsWith(".." + path.sep) &&
        relativeToMediaRoot !== ".." &&
        !path.isAbsolute(relativeToMediaRoot));
    return { path: resolved, relative: path.relative(root, resolved).replace(/\\/g, "/"), insideMediaRoot };
  } catch {
    return null;
  }
}

function legacyAssetId(checksum) {
  return "legacy_asset_" + checksum;
}

function referenceAssetId(checksum, productId) {
  return "legacy_ref_" + checksum + "_" + String(productId);
}

function collectCatalogueMediaUrls(product, data) {
  const values = [];
  if (Array.isArray(product?.media?.images)) values.push(...product.media.images);
  if (product?.i) values.push(product.i);
  const override = data?.byId?.[String(product?.id)];
  if (override) values.push(override);
  return [...new Set(values.map(normalizeUrl).filter(Boolean))];
}

function buildLegacyReferenceCandidates(data = loadCatalogue(), rules = readExistingRules(), root = ROOT) {
  const state = computeMediaState(data, rules);
  const candidates = [];
  for (const product of state.products) {
    for (const mediaUrl of collectCatalogueMediaUrls(product, data)) {
      if (!isLocalMedia(mediaUrl)) continue;
      const local = localMediaPath(mediaUrl, root);
      if (!local?.insideMediaRoot) {
        candidates.push({
          referenceAssetId: null,
          assetId: null,
          productId: String(product.id),
          mediaPath: mediaUrl,
          status: "INVALID_MEDIA",
          reason: "local media path resolves outside assets/media"
        });
        continue;
      }
      candidates.push({
        productId: String(product.id),
        mediaPath: mediaUrl,
        absolutePath: local.path,
        filename: path.basename(local.path)
      });
    }
  }
  const deduped = new Map();
  for (const item of candidates) {
    const key = item.productId + "|" + item.mediaPath;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return { state, candidates: [...deduped.values()] };
}

function buildReferenceManifest(options = {}) {
  const data = options.data || loadCatalogue();
  const rules = options.rules || readExistingRules();
  const root = options.root || ROOT;
  const now = options.now || new Date().toISOString();
  const { state, candidates } = buildLegacyReferenceCandidates(data, rules, root);

  const entries = [];
  const byChecksum = new Map();
  const productsWithReference = new Map();
  let invalidMedia = 0;
  let unreachableMedia = 0;

  for (const candidate of candidates) {
    const base = {
      referenceAssetId: null,
      assetId: null,
      productId: candidate.productId,
      mediaPath: candidate.mediaPath,
      checksum: null,
      model: MODEL,
      modelRevision: MODEL_REVISION,
      indexVersion: REFERENCE_INDEX_VERSION,
      source: "legacy-catalogue-local",
      rights: "unverified",
      role: "primary",
      createdAt: now,
      updatedAt: now,
      status: "PENDING"
    };

    if (candidate.status === "INVALID_MEDIA") {
      invalidMedia++;
      entries.push({ ...base, status: "INVALID_MEDIA", reason: candidate.reason });
      continue;
    }

    if (!fs.existsSync(candidate.absolutePath)) {
      unreachableMedia++;
      entries.push({ ...base, status: "UNREACHABLE", reason: "local reference file does not exist" });
      continue;
    }

    const extension = path.extname(candidate.absolutePath).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
      invalidMedia++;
      entries.push({ ...base, status: "INVALID_MEDIA", reason: "unsupported local image extension" });
      continue;
    }

    const validation = inspectImage(candidate.absolutePath);
    if (!validation.valid) {
      invalidMedia++;
      entries.push({ ...base, status: "INVALID_MEDIA", reason: validation.reason });
      continue;
    }

    let checksum;
    try {
      checksum = fileSha256(candidate.absolutePath);
    } catch (error) {
      invalidMedia++;
      entries.push({ ...base, status: "INVALID_MEDIA", reason: "unable to checksum reference: " + error.message });
      continue;
    }

    const entry = {
      ...base,
      referenceAssetId: referenceAssetId(checksum, candidate.productId),
      assetId: legacyAssetId(checksum),
      mediaAssetId: legacyAssetId(checksum),
      checksum,
      width: validation.width,
      height: validation.height,
      mimeType: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg",
      status: "LEGACY_REFERENCE"
    };
    entries.push(entry);
    if (!byChecksum.has(checksum)) byChecksum.set(checksum, new Set());
    byChecksum.get(checksum).add(candidate.productId);
    if (!productsWithReference.has(candidate.productId)) productsWithReference.set(candidate.productId, new Set());
    productsWithReference.get(candidate.productId).add(checksum);
  }

  const duplicateChecksums = new Set(
    [...byChecksum.entries()].filter(([, productIds]) => productIds.size > 1).map(([checksum]) => checksum)
  );
  for (const entry of entries) {
    if (entry.checksum && duplicateChecksums.has(entry.checksum)) {
      entry.status = "DUPLICATE";
      entry.reason = "exact media content is associated with multiple canonical products";
    }
  }

  const usable = entries.filter(entry => entry.status === "LEGACY_REFERENCE");
  const productReferenceCounts = new Map();
  for (const entry of usable) {
    if (!productReferenceCounts.has(entry.productId)) productReferenceCounts.set(entry.productId, 0);
    productReferenceCounts.set(entry.productId, productReferenceCounts.get(entry.productId) + 1);
  }
  const referenceCounts = [...productReferenceCounts.values()];

  const externalReferences = [];
  for (const product of state.products) {
    for (const mediaUrl of collectCatalogueMediaUrls(product, data)) {
      if (/^https?:\/\//i.test(mediaUrl)) {
        externalReferences.push({
          productId: String(product.id),
          mediaUrl,
          status: "UNVERIFIED_EXTERNAL_REFERENCE",
          reason: "rights/provenance are not represented by the canonical local reference manifest"
        });
      }
    }
  }

  return {
    schemaVersion: REFERENCE_SCHEMA_VERSION,
    manifestType: "twins-ai-reference-index",
    indexVersion: REFERENCE_INDEX_VERSION,
    generatedAt: now,
    model: { id: MODEL, revision: MODEL_REVISION },
    catalogue: {
      population: state.counts.catalogue,
      canonical: true
    },
    coverage: {
      productsWithZeroMedia: state.counts.catalogue - productReferenceCounts.size,
      productsWithOneReference: referenceCounts.filter(count => count === 1).length,
      productsWithMultipleReferences: referenceCounts.filter(count => count > 1).length,
      verifiedMedia: state.counts.verified,
      invalidMedia,
      duplicateMedia: duplicateChecksums.size,
      unreachableMedia,
      usableVisualReferences: usable.length,
      productsWithNoUsableVisualReference: state.counts.catalogue - productReferenceCounts.size,
      externalReferencesNotIndexed: externalReferences.length
    },
    references: entries,
    externalReferences,
    index: usable.map(entry => ({
      referenceAssetId: entry.referenceAssetId,
      assetId: entry.assetId,
      productId: entry.productId,
      mediaPath: entry.mediaPath,
      checksum: entry.checksum,
      model: entry.model,
      modelRevision: entry.modelRevision,
      indexVersion: entry.indexVersion,
      source: entry.source,
      rights: entry.rights,
      role: entry.role,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      status: entry.status
    }))
  };
}

function writeReferenceManifest(output, options = {}) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const manifest = buildReferenceManifest(options);
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

module.exports = {
  REFERENCE_SCHEMA_VERSION,
  REFERENCE_INDEX_VERSION,
  MODEL,
  MODEL_REVISION,
  isLocalMedia,
  localMediaPath,
  legacyAssetId,
  referenceAssetId,
  collectCatalogueMediaUrls,
  buildLegacyReferenceCandidates,
  buildReferenceManifest,
  writeReferenceManifest
};
