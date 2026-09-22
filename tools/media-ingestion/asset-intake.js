const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ROOT, loadCatalogue, readExistingRules, computeMediaState, normalizeUrl } = require("./validator");
const { matchProduct } = require("./discovery/matcher");
const { classifyMatch } = require("./discovery/scorer");

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const DEFAULT_ASSET_ROOT = path.join(ROOT, "supplier-assets");
const DEFAULT_PENDING_OUTPUT = path.join(__dirname, "manifests", "pending-asset-intake.json");
const DEFAULT_REPORT_OUTPUT = path.join(__dirname, "manifests", "asset-intake-report.json");
const DEFAULT_APPLIED_OUTPUT = path.join(__dirname, "manifests", "applied-asset-intake.json");
const MIN_DIMENSION = 160;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const RIGHTS_THAT_CAN_VERIFY = new Set(["supplier-authorized", "owned", "licensed", "public-domain", "cc0"]);

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "product";
}

function expectedAssetPath(product) {
  return path.posix.join("supplier-assets", String(product.id) + "-" + slug(product.n) + ".jpg");
}

function pendingAssetRecord(product, candidate) {
  return {
    productId: String(product.id),
    productName: String(product.n || ""),
    category: String(product.c || ""),
    type: String(product.type || product.productType || product.tag || ""),
    brand: String(product.brand || ""),
    model: String(product.model || ""),
    capacity: String(product.capacity || ""),
    specification: String(product.spec || ""),
    currentMediaStatus: candidate?.src ? "VERIFIED" : "PENDING",
    expectedAssetPath: expectedAssetPath(product)
  };
}

function buildPendingAssetManifest(data = loadCatalogue(), rules = readExistingRules()) {
  const state = computeMediaState(data, rules);
  return JSON.parse(JSON.stringify({
    schemaVersion: 1,
    manifestType: "pending-product-asset-intake",
    catalogue: { population: state.counts.catalogue, canonical: true },
    counts: { catalogue: state.counts.catalogue, assigned: state.counts.verified, pending: state.counts.pending },
    products: state.pending
      .map(product => pendingAssetRecord(product, state.resolved.find(x => x.product.id === product.id)?.candidate))
      .sort((a, b) => Number(a.productId) - Number(b.productId))
  }));
}

function writePendingAssetManifest(output = DEFAULT_PENDING_OUTPUT, data, rules) {
  const manifest = buildPendingAssetManifest(data, rules);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

function isSupportedAsset(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isObviousNoise(filePath) {
  const value = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(?:\.|__macosx)(?:\/|$)|(?:^|[\/_-])(placeholder|logo|icon|banner|tracking|sprite|avatar)(?:[._\/-]|$)/i.test(value);
}

function discoverLocalAssets(root = DEFAULT_ASSET_ROOT) {
  const absoluteRoot = path.resolve(root);
  const assets = [];
  const unsupported = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile()) continue;
      if (!isSupportedAsset(full)) {
        unsupported.push({ path: path.relative(absoluteRoot, full).replace(/\\/g, "/"), reason: "unsupported file type" });
        continue;
      }
      const relative = path.relative(absoluteRoot, full).replace(/\\/g, "/");
      if (isObviousNoise(relative)) {
        assets.push({ absolutePath: full, relativePath: relative, ignored: true, ignoreReason: "obvious placeholder/logo/icon/banner/tracking asset" });
        continue;
      }
      assets.push({ absolutePath: full, relativePath: relative, ignored: false });
    }
  };
  walk(absoluteRoot);
  return { root: absoluteRoot, assets, unsupported };
}

function readU16BE(b, i) { return b.readUInt16BE(i); }
function readU32BE(b, i) { return b.readUInt32BE(i); }

function parsePng(b) {
  if (b.length < 24 || b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { format: "png", width: readU32BE(b, 16), height: readU32BE(b, 20) };
}

function parseWebp(b) {
  if (b.length < 16 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const type = b.toString("ascii", 12, 16);
  if (type === "VP8X" && b.length >= 30) return { format: "webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (type === "VP8 " && b.length >= 30) {
    const i = b.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (i >= 0 && i + 7 <= b.length) return { format: "webp", width: b.readUInt16LE(i + 3), height: b.readUInt16LE(i + 5) };
  }
  if (type === "VP8L" && b.length >= 25 && b[21] === 0x2f) {
    const bits = b.readUInt32LE(21);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function parseJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    while (b[i] === 0xff) i++;
    const marker = b[i++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (i + 1 >= b.length) break;
    const length = b.readUInt16BE(i);
    if (length < 2 || i + length > b.length) break;
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && i + 7 < b.length) return { format: "jpeg", width: b.readUInt16BE(i + 5), height: b.readUInt16BE(i + 3) };
    i += length;
  }
  return null;
}

function inspectImage(filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch (error) { return { valid: false, reason: "unreadable file: " + error.message }; }
  if (stat.size <= 0) return { valid: false, reason: "empty file" };
  if (stat.size > MAX_FILE_BYTES) return { valid: false, reason: "file exceeds 50MB safety limit" };
  let b;
  try { b = fs.readFileSync(filePath); } catch (error) { return { valid: false, reason: "unreadable file: " + error.message }; }
  const ext = path.extname(filePath).toLowerCase();
  const parsed = ext === ".png" ? parsePng(b) : ext === ".webp" ? parseWebp(b) : parseJpeg(b);
  if (!parsed) return { valid: false, reason: "file content does not contain a valid supported image signature/header" };
  if (parsed.width < MIN_DIMENSION || parsed.height < MIN_DIMENSION) return { valid: false, reason: "image dimensions are below the minimum " + MIN_DIMENSION + "px" };
  const expected = ext === ".png" ? "png" : ext === ".webp" ? "webp" : "jpeg";
  if (parsed.format !== expected) return { valid: false, reason: "file extension does not match detected image format" };
  return { valid: true, format: parsed.format, width: parsed.width, height: parsed.height, bytes: stat.size };
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeAssetManifest(manifest) {
  if (!manifest) return new Map();
  const assets = Array.isArray(manifest) ? manifest : manifest.assets;
  if (!Array.isArray(assets)) throw new Error("Asset manifest must be an array or an object with an assets array");
  const map = new Map();
  for (const item of assets) {
    const asset = String(item?.asset || "").replace(/\\/g, "/").trim();
    if (!asset) continue;
    map.set(asset, { ...item, asset });
  }
  return map;
}

function loadAssetManifest(filePath) {
  if (!filePath) return new Map();
  return normalizeAssetManifest(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")));
}

function filenameEvidence(asset, metadata = {}) {
  const base = path.basename(asset.relativePath, path.extname(asset.relativePath)).replace(/[_-]+/g, " ");
  const folder = path.dirname(asset.relativePath).replace(/[\/_-]+/g, " ");
  const title = [base, folder].filter(Boolean).join(" ");
  const capacityMatch = String(metadata.capacity || title).match(/\b\d+(?:[.,]\d+)?\s*(?:L|litre|litres|liter|liters|kg|ft|feet|quart|quarts|W|kW|mm|cm|inch|in)\b/i);
  const modelMatch = String(metadata.model || title).match(/\b[A-Za-z]{1,5}[- ]?\d{1,5}[A-Za-z0-9-]*\b/);
  const name = metadata.name || base;
  return {
    sourceUrl: "file://" + asset.absolutePath,
    title,
    fields: {
      name: { value: String(name), source: metadata.name ? "asset-manifest" : "filename" },
      brand: metadata.brand ? { value: String(metadata.brand), source: "asset-manifest" } : undefined,
      model: { value: String(metadata.model || (modelMatch ? modelMatch[0] : "")), source: metadata.model ? "asset-manifest" : "filename" },
      capacity: { value: String(metadata.capacity || (capacityMatch ? capacityMatch[0] : "")), source: metadata.capacity ? "asset-manifest" : "filename" },
      category: metadata.category ? { value: String(metadata.category), source: "asset-manifest" } : undefined,
      description: metadata.description ? { value: String(metadata.description), source: "asset-manifest" } : undefined
    },
    images: [{ url: "file://" + asset.absolutePath, source: "local-asset" }]
  };
}

function scoreAssetAgainstProduct(asset, product, metadata = {}) {
  const evidence = filenameEvidence(asset, metadata);
  const match = matchProduct(product, evidence);
  const classification = classifyMatch(match, evidence);
  return { product, evidence, match, classification };
}

function chooseFuzzyProduct(asset, products, metadata = {}) {
  const ranked = products.map(product => scoreAssetAgainstProduct(asset, product, metadata))
    .sort((a, b) => b.match.score - a.match.score || b.match.nameScore - a.match.nameScore || String(a.product.id).localeCompare(String(b.product.id), undefined, { numeric: true }));
  if (!ranked.length) return { status: "UNRESOLVED", reason: "catalogue has no pending products" };
  const top = ranked[0], second = ranked[1];
  if (top.classification.status === "HIGH" && (!second || top.match.score > second.match.score)) return { status: "VERIFIED_MATCH", ...top };
  if (top.classification.status === "HIGH" || top.classification.status === "REVIEW") return { status: "REVIEW", ...top, reason: "match is ambiguous or lacks a deterministic margin" };
  return { status: "UNRESOLVED", ...top, reason: "insufficient deterministic product identity evidence" };
}

function existingLocalHashes(state) {
  const hashes = new Map();
  for (const item of state.resolved) {
    const src = item.candidate?.src || "";
    if (!src.startsWith("assets/media/")) continue;
    const filePath = path.join(ROOT, src);
    if (!fs.existsSync(filePath)) continue;
    try { hashes.set(fileSha256(filePath), String(item.product.id)); } catch {}
  }
  return hashes;
}

function processAsset(asset, state, explicitMap, options = {}) {
  if (asset.ignored) return { asset: asset.relativePath, state: "REJECTED", reason: asset.ignoreReason };
  const record = explicitMap.get(asset.relativePath);
  const validation = inspectImage(asset.absolutePath);
  const hash = validation.valid ? fileSha256(asset.absolutePath) : "";
  if (!validation.valid) return { asset: asset.relativePath, state: "REJECTED", validation, provenance: record || null, reason: validation.reason };
  const existingHashes = options.existingHashes || new Map();
  const seenHashes = options.seenHashes || new Map();
  if (existingHashes.has(hash)) return { asset: asset.relativePath, state: "REJECTED", validation, duplicate: { type: "existing-asset-content", productId: existingHashes.get(hash) }, reason: "asset content duplicates an existing mapped local asset" };
  if (seenHashes.has(hash)) return { asset: asset.relativePath, state: "REJECTED", validation, duplicate: { type: "intake-asset-content", asset: seenHashes.get(hash) }, reason: "asset content is duplicated within this intake" };
  seenHashes.set(hash, asset.relativePath);

  let match;
  if (record?.productId != null) {
    const id = String(record.productId);
    const product = state.byId.get(id);
    if (!product) return { asset: asset.relativePath, state: "REJECTED", validation, provenance: record, reason: "explicit productId does not exist" };
    if (state.mappedIds.has(id)) return { asset: asset.relativePath, state: "REJECTED", validation, provenance: record, reason: "product already has an existing media mapping" };
    match = scoreAssetAgainstProduct(asset, product, record);
    match.status = "VERIFIED_MATCH";
    match.explicit = true;
  } else {
    const pending = state.pending.filter(p => !state.blocklist[String(p.id)]);
    match = chooseFuzzyProduct(asset, pending, record || {});
  }
  if (match.status === "UNRESOLVED") return { asset: asset.relativePath, state: "UNRESOLVED", validation, provenance: record || null, match: match.match || null, reason: match.reason };
  const rights = String(record?.rights || "").trim().toLowerCase() || "unknown";
  const provenance = { ...(record || {}), rights };
  const provenanceKnown = Boolean(record && (record.source || record.sourceUrl || rights !== "unknown"));
  if (!provenanceKnown) return { asset: asset.relativePath, productId: String(match.product.id), productName: match.product.n, state: "REVIEW", validation, provenance, match: match.match, reason: "asset provenance/rights declaration is missing" };
  if (!RIGHTS_THAT_CAN_VERIFY.has(rights)) return { asset: asset.relativePath, productId: String(match.product.id), productName: match.product.n, state: "REVIEW", validation, provenance, match: match.match, reason: "rights declaration does not establish authorization for VERIFIED state" };
  if (match.match?.contradictions?.length) return { asset: asset.relativePath, productId: String(match.product.id), productName: match.product.n, state: "REVIEW", validation, provenance: record, match: match.match, reason: match.match.contradictions.join("; ") };
  return { asset: asset.relativePath, productId: String(match.product.id), productName: match.product.n, state: "VERIFIED", confidence: match.explicit ? 1 : match.match.score, validation, provenance: record, match: match.match, reason: match.explicit ? "explicit productId, valid image, and authorized provenance" : "strong deterministic filename/context match with authorized provenance", assetSha256: hash };
}

function processAssets(root, data = loadCatalogue(), rules = readExistingRules(), manifest = null) {
  const state = computeMediaState(data, rules);
  const discovered = discoverLocalAssets(root);
  const explicitMap = manifest instanceof Map ? manifest : normalizeAssetManifest(manifest);
  const existingHashes = existingLocalHashes(state);
  const seenHashes = new Map();
  const results = [];
  for (const asset of discovered.assets) {
    results.push(processAsset(asset, state, explicitMap, { existingHashes, seenHashes }));
  }
  for (const unsupported of discovered.unsupported) results.push({ asset: unsupported.path, state: "REJECTED", reason: unsupported.reason });
  results.sort((a, b) => String(a.asset).localeCompare(String(b.asset)));
  return {
    schemaVersion: 1,
    manifestType: "local-bulk-asset-intake",
    mode: "dry-run",
    externalSearch: false,
    catalogue: { population: state.counts.catalogue, pendingAtStart: state.counts.pending },
    input: { root: path.relative(ROOT, discovered.root).replace(/\\/g, "/"), supportedExtensions: [...SUPPORTED_EXTENSIONS].sort() },
    counts: {
      assetsDiscovered: discovered.assets.filter(x => !x.ignored).length,
      ignoredAssets: discovered.assets.filter(x => x.ignored).length,
      unsupportedAssets: discovered.unsupported.length,
      VERIFIED: results.filter(x => x.state === "VERIFIED").length,
      REVIEW: results.filter(x => x.state === "REVIEW").length,
      REJECTED: results.filter(x => x.state === "REJECTED").length,
      UNRESOLVED: results.filter(x => x.state === "UNRESOLVED").length
    },
    results
  };
}

function buildAppliedManifest(report, output = DEFAULT_APPLIED_OUTPUT) {
  const accepted = (report?.results || []).filter(x => x.state === "VERIFIED");
  if (!accepted.length) throw new Error("No VERIFIED local assets are eligible for apply");
  const existing = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : { schemaVersion: 1, manifestType: "applied-local-asset-intake", assets: [] };
  const assets = Array.isArray(existing.assets) ? existing.assets.slice() : [];
  const productIds = new Set(assets.map(x => String(x.productId)));
  const hashes = new Set(assets.map(x => String(x.assetSha256 || "")));
  for (const item of accepted) {
    if (productIds.has(String(item.productId))) throw new Error("Refusing apply: product " + item.productId + " already exists in applied intake manifest");
    if (item.assetSha256 && hashes.has(item.assetSha256)) throw new Error("Refusing apply: asset hash already exists in applied intake manifest");
    productIds.add(String(item.productId));
    if (item.assetSha256) hashes.add(item.assetSha256);
    assets.push({
      productId: String(item.productId),
      productName: item.productName,
      asset: item.asset,
      assetSha256: item.assetSha256,
      source: item.provenance?.source || "",
      sourceUrl: item.provenance?.sourceUrl || "",
      rights: item.provenance?.rights || "",
      importedAt: item.provenance?.importedAt || new Date().toISOString(),
      verificationStatus: "VERIFIED",
      verificationReason: item.reason
    });
  }
  assets.sort((a, b) => Number(a.productId) - Number(b.productId) || a.asset.localeCompare(b.asset));
  const next = { schemaVersion: 1, manifestType: "applied-local-asset-intake", assets };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

module.exports = {
  ROOT, SUPPORTED_EXTENSIONS, MIN_DIMENSION, DEFAULT_ASSET_ROOT, DEFAULT_PENDING_OUTPUT,
  DEFAULT_REPORT_OUTPUT, DEFAULT_APPLIED_OUTPUT, slug, expectedAssetPath, pendingAssetRecord,
  buildPendingAssetManifest, writePendingAssetManifest, discoverLocalAssets, inspectImage,
  fileSha256, normalizeAssetManifest, loadAssetManifest, filenameEvidence, scoreAssetAgainstProduct,
  chooseFuzzyProduct, processAsset, processAssets, buildAppliedManifest
};
