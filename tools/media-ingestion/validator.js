const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_PATH = path.join(ROOT, "data.js");
const APP_PATH = path.join(ROOT, "app.js");

function balanced(source, openIndex, openChar, closeChar) {
  let depth = 0, quote = null, escaped = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("Unbalanced expression in data.js");
}

function extractObjectPairs(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) return [];
  const open = source.indexOf("{", start);
  const close = balanced(source, open, "{", "}");
  const pairs = [];
  for (const m of source.slice(open + 1, close).matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)) pairs.push([m[1], m[2]]);
  return pairs;
}

function extractCatalogue(dataPath) {
  const source = fs.readFileSync(dataPath, "utf8");
  const declarations = [...source.matchAll(/const\s+P\s*=\s*\[/g)];
  if (!declarations.length) throw new Error("Catalogue declaration P was not found in data.js");

  // data.js currently contains a duplicated catalogue declaration. The canonical
  // catalogue is the first P declaration; only P.push() calls before the next P
  // declaration belong to that catalogue. Never collect pushes globally.
  const declaration = declarations[0].index;
  const nextDeclaration = declarations[1]?.index ?? source.length;
  const arrayOpen = source.indexOf("[", declaration);
  if (arrayOpen < 0 || arrayOpen >= nextDeclaration) throw new Error("Canonical catalogue array was not found");
  const arrayClose = balanced(source, arrayOpen, "[", "]");
  let program = "const P=" + source.slice(arrayOpen, arrayClose + 1) + ";\n";
  const catalogueRegion = source.slice(arrayClose + 1, nextDeclaration);
  const pushRe = /P\.push\s*\(/g;
  let match;
  while ((match = pushRe.exec(catalogueRegion))) {
    const open = catalogueRegion.indexOf("(", match.index);
    const close = balanced(catalogueRegion, open, "(", ")");
    program += "P.push" + catalogueRegion.slice(open, close + 1) + ";\n";
    pushRe.lastIndex = close + 1;
  }
  const context = {};
  vm.runInNewContext(program + "\nglobalThis.__P__=P;", context, { filename: dataPath, timeout: 15000 });
  if (!Array.isArray(context.__P__)) throw new Error("Could not evaluate catalogue P");
  return context.__P__;
}

function extractMediaMaps(dataPath) {
  const source = fs.readFileSync(dataPath, "utf8");
  const idPairs = extractObjectPairs(source, "const CATALOG_MEDIA_OVERRIDES_BY_ID=");
  const namePairs = extractObjectPairs(source, "const CATALOG_MEDIA_OVERRIDES={");
  const byId = {}, byName = {};
  for (const [key, value] of idPairs) byId[key] = value;
  for (const [key, value] of namePairs) byName[key] = value;
  return { byId, byName, rawIdPairs: idPairs, rawNamePairs: namePairs };
}

function loadCatalogue(dataPath = DATA_PATH) {
  return { P: extractCatalogue(dataPath), ...extractMediaMaps(dataPath) };
}

function readExistingRules(appPath = APP_PATH) {
  const source = fs.readFileSync(appPath, "utf8");
  const blocklist = {};
  const match = source.match(/var\s+PHASE_SIX_MEDIA_BLOCKLIST\s*=\s*\{([\s\S]*?)\};/);
  if (match) {
    for (const m of match[1].matchAll(/(\d+)\s*:\s*"([^"]*)"/g)) blocklist[m[1]] = m[2];
  }
  return { blocklist };
}

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function isUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch { return false; }
}

function isLocalMedia(value) { return typeof value === "string" && value.startsWith("assets/media/"); }

function getIdMapValue(map, id) {
  if (!map) return "";
  return normalizeUrl(map[String(id)] ?? map[id]);
}

function nameOverrideFor(product, nameMap) {
  const name = String(product.n || "").toLowerCase().trim();
  return Object.keys(nameMap || {})
    .map(String)
    .filter(k => k && name.includes(k.toLowerCase().trim()))
    .sort((a, b) => b.length - a.length)
    .map(k => normalizeUrl(nameMap[k]))[0] || "";
}

function existingCandidate(product, data, rules) {
  const id = String(product.id);
  if (rules.blocklist[id]) return { src: "", status: "pending", source: rules.blocklist[id] };

  const idOverride = getIdMapValue(data.CATALOG_MEDIA_OVERRIDES_BY_ID, id);
  if (idOverride) return { src: idOverride, status: "reference", source: "verified product reference" };

  if (product.media?.images?.length && String(product.media.source || "").startsWith("supplied Twins")) {
    return { src: normalizeUrl(product.media.images[0]), status: "twins", source: product.media.source };
  }
  if (product.media?.images?.length && String(product.media.source || "").startsWith("verified product reference")) {
    return { src: normalizeUrl(product.media.images[0]), status: "reference", source: product.media.source };
  }
  if (isLocalMedia(product.i)) return { src: normalizeUrl(product.i), status: "twins", source: "local Twins catalogue media" };
  if (product.i && product.media?.images?.includes(product.i) && String(product.media.source || "").startsWith("verified product reference")) {
    return { src: normalizeUrl(product.i), status: "reference", source: product.media.source };
  }
  return { src: "", status: "pending", source: "product photo verification required" };
}

function computeMediaState(data, rules = readExistingRules()) {
  // Existing catalogue mappings are authoritative, including legacy duplicate assignments.
  // Duplicate blocking applies only to newly submitted candidates in validateManifest().
  const resolved = data.P.map(product => ({ product, candidate: existingCandidate(product, data, rules) }));
  const valid = resolved.filter(x => x.candidate.src);
  return {
    products: data.P,
    byId: new Map(data.P.map(p => [String(p.id), p])),
    mappedIds: new Set(resolved.filter(x => x.candidate.src).map(x => String(x.product.id))),
    blocklist: rules.blocklist,
    resolved,
    pending: resolved.filter(x => !x.candidate.src).map(x => x.product),
    valid,
    counts: {
      catalogue: data.P.length,
      verified: valid.length,
      pending: resolved.length - valid.length,
      uniqueMedia: new Set(valid.map(x => x.candidate.src)).size,
      duplicates: valid.length - new Set(valid.map(x => x.candidate.src)).size
    }
  };
}

function validateManifest(manifest, state) {
  const batch = Array.isArray(manifest) ? manifest : manifest?.candidates;
  if (!Array.isArray(batch)) throw new Error("Manifest must be an array or an object with a candidates array");

  const existingByUrl = new Map();
  for (const item of state.resolved) {
    if (item.candidate.src) existingByUrl.set(normalizeUrl(item.candidate.src), String(item.product.id));
  }

  const seenBatch = new Map();
  const accepted = [];
  const rejected = [];
  const reject = (candidate, reason) =>
    rejected.push({ ...candidate, url: normalizeUrl(candidate?.url), status: "rejected", reason });

  for (const candidate of batch) {
    const id = String(candidate?.productId ?? "").trim();
    const url = normalizeUrl(candidate?.url);
    const verification = candidate?.verification;

    if (!id) { reject(candidate, "missing product ID"); continue; }
    if (!state.byId.has(id)) { reject(candidate, "product ID does not exist"); continue; }
    if (state.blocklist[id]) { reject(candidate, "product is blocked by the existing media validation rule"); continue; }
    if (!url) { reject(candidate, "missing candidate URL"); continue; }
    if (!verification || typeof verification !== "object") { reject(candidate, "missing required verification information"); continue; }
    if (verification.verified !== true) { reject(candidate, "candidate is unverified / not VERIFIED"); continue; }
    if (!verification.sourceUrl || !isUrl(verification.sourceUrl)) { reject(candidate, "missing or invalid verification source URL"); continue; }
    if (!verification.checkedAt || Number.isNaN(Date.parse(verification.checkedAt))) { reject(candidate, "missing or invalid verification timestamp"); continue; }
    if (state.mappedIds.has(id)) { reject(candidate, "product already has a valid media mapping"); continue; }

    const normalizedSourceUrl = normalizeUrl(verification.sourceUrl);
    if (seenBatch.has(url)) {
      reject(candidate, "duplicate URL in new batch; no-new-duplicates rule");
      continue;
    }
    seenBatch.set(url, id);

    if (existingByUrl.has(url)) {
      reject(candidate, "URL is already assigned to another product");
      continue;
    }

    if (!isUrl(url)) { reject(candidate, "candidate URL must be an absolute HTTP(S) URL"); continue; }
    if (!isUrl(url)) { reject(candidate, "candidate URL must be an absolute HTTP(S) URL"); continue; }
    if (candidate.mediaType && candidate.mediaType !== "image") {
      reject(candidate, "candidate media type must be image");
      continue;
    }

    accepted.push({
      productId: id,
      url,
      sourceUrl: normalizedSourceUrl,
      verificationStatus: "verified",
      checkedAt: verification.checkedAt,
      sourceName: verification.sourceName || "",
      notes: candidate.notes || ""
    });
  }
  return {
    accepted,
    rejected,
    duplicateUrlsRejected: rejected.filter(x => /duplicate URL|already assigned/.test(x.reason))
  };
}

function applyMappings(dataPath, accepted) {
  if (!accepted.length) return { changed: false, content: fs.readFileSync(dataPath, "utf8") };
  const source = fs.readFileSync(dataPath, "utf8");
  const marker = "const CATALOG_MEDIA_OVERRIDES_BY_ID=";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("CATALOG_MEDIA_OVERRIDES_BY_ID declaration not found");
  const open = source.indexOf("{", start);
  let depth = 0, close = -1, quote = null, escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) { close = i; break; }
  }
  if (close < 0) throw new Error("Could not locate end of CATALOG_MEDIA_OVERRIDES_BY_ID");

  const additions = accepted
    .slice()
    .sort((a, b) => Number(a.productId) - Number(b.productId))
    .map(x => "  " + JSON.stringify(x.productId) + ":" + JSON.stringify(x.url) + ",")
    .join("\n");
  const before = source.slice(0, close);
  const after = source.slice(close);
  const separator = before.endsWith("\n") ? "" : "\n";
  const content = before + separator + additions + "\n" + after;
  fs.writeFileSync(dataPath, content, "utf8");
  return { changed: content !== source, content };
}

function buildAudit(stateBefore, validation, stateAfter = null) {
  const after = stateAfter || stateBefore;
  return {
    acceptedMappings: validation.accepted,
    rejectedMappings: validation.rejected,
    duplicateUrlsRejected: validation.duplicateUrlsRejected,
    productsLeftPending: after.pending.map(p => ({ productId: String(p.id), name: p.n })),
    sourceUrls: validation.accepted.map(x => ({ productId: x.productId, sourceUrl: x.sourceUrl })),
    verificationStatus: validation.accepted.map(x => ({ productId: x.productId, status: x.verificationStatus, checkedAt: x.checkedAt })),
    mediaCounts: {
      before: stateBefore.counts,
      after: after.counts,
      deltaVerified: after.counts.verified - stateBefore.counts.verified,
      deltaPending: after.counts.pending - stateBefore.counts.pending
    }
  };
}

module.exports = {
  ROOT, DATA_PATH, APP_PATH, loadCatalogue, readExistingRules,
  normalizeUrl, existingCandidate, computeMediaState, validateManifest,
  applyMappings, buildAudit
};
