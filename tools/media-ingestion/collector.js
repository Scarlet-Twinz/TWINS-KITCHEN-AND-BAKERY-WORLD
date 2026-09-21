const fs = require("node:fs");
const path = require("node:path");
const { DATA_PATH, loadCatalogue, readExistingRules, computeMediaState, normalizeUrl } = require("./validator");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PENDING_MANIFEST = path.join(__dirname, "manifests", "pending-catalogue.json");

function pendingRecord(product, candidate) {
  return {
    productId: String(product.id),
    name: String(product.n || ""),
    category: String(product.c || ""),
    type: String(product.type || product.productType || product.tag || ""),
    capacity: String(product.capacity || ""),
    model: String(product.model || ""),
    specification: String(product.spec || ""),
    currentMediaStatus: candidate.src ? "VERIFIED" : "PENDING"
  };
}

function buildPendingManifest(data = loadCatalogue(), rules = readExistingRules()) {
  const state = computeMediaState(data, rules);
  const manifest = {
    schemaVersion: 1,
    catalogue: {
      population: state.counts.catalogue,
      canonical: true,
      generatedFrom: "data.js canonical P population",
      generatedBy: "tools/media-ingestion/collector.js"
    },
    counts: {
      catalogue: state.counts.catalogue,
      assigned: state.counts.verified,
      pending: state.counts.pending
    },
    products: state.pending
      .map(product => pendingRecord(product, state.resolved.find(x => x.product.id === product.id)?.candidate || { src: "" }))
      .sort((a, b) => Number(a.productId) - Number(b.productId))
  };

  // Materialize a plain JSON value so repeated builds cannot retain VM-origin
  // object prototypes from independently loaded catalogue evaluations.
  return JSON.parse(JSON.stringify(manifest));
}

function writePendingManifest(output = DEFAULT_PENDING_MANIFEST) {
  const manifest = buildPendingManifest();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

if (require.main === module) {
  const outputArg = process.argv[2];
  const output = outputArg ? path.resolve(process.cwd(), outputArg) : DEFAULT_PENDING_MANIFEST;
  const manifest = writePendingManifest(output);
  console.log(JSON.stringify({ output, ...manifest.counts }, null, 2));
}

module.exports = { buildPendingManifest, writePendingManifest, pendingRecord, DEFAULT_PENDING_MANIFEST };
