const fs = require('node:fs');
const path = require('node:path');
const { DATA_PATH, loadCatalogue, readExistingRules, computeMediaState, validateManifest, applyMappings, buildAudit } = require('./validator');
const { writePendingManifest } = require('./collector');
const { discover } = require('./discovery');
const { buildPendingAssetManifest, writePendingAssetManifest, loadAssetManifest, processAssets, buildAppliedManifest, DEFAULT_ASSET_ROOT, DEFAULT_PENDING_OUTPUT, DEFAULT_REPORT_OUTPUT, DEFAULT_APPLIED_OUTPUT } = require('./asset-intake');

function arg(name, fallback = null) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
function productIdsArg() { const value = arg('--product-ids'); if (!value) return null; const ids = value.split(',').map(x => x.trim()).filter(Boolean); if (!ids.length || ids.some(x => !/^\\d+$/.test(x))) throw new Error('--product-ids must be a comma-separated list of numeric product IDs'); return [...new Set(ids)]; }
function readManifest(file) { if (!file) return { candidates: [] }; const parsed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')); return Array.isArray(parsed) ? { candidates: parsed } : parsed; }
function writeReport(report, target = arg('--report')) { const output = JSON.stringify(report, null, 2); if (target) { const p = path.resolve(process.cwd(), target); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, output + '\\n', 'utf8'); } console.log(output); }
function assetRootArg() { return path.resolve(process.cwd(), arg('--assets', path.relative(process.cwd(), DEFAULT_ASSET_ROOT))); }
function assetManifestArg() { return arg('--asset-manifest', null); }

async function main() {
  const command = process.argv[2] || 'dry-run';
  if (!['dry-run','apply','audit','pending-manifest','discover','asset-intake-manifest','asset-intake-dry-run','asset-intake-apply'].includes(command)) throw new Error('Usage: node tools/media-ingestion/index.js <audit|pending-manifest|asset-intake-manifest|asset-intake-dry-run|asset-intake-apply|discover|dry-run|apply> [options]');
  if (command === 'pending-manifest') { const target = arg('--output', 'tools/media-ingestion/manifests/pending-catalogue.json'); const manifest = writePendingManifest(path.resolve(process.cwd(), target)); console.log(JSON.stringify({ output: target, ...manifest.counts }, null, 2)); return; }
  if (command === 'asset-intake-manifest') {
    const target = path.resolve(process.cwd(), arg('--output', path.relative(process.cwd(), DEFAULT_PENDING_OUTPUT)));
    const manifest = writePendingAssetManifest(target);
    console.log(JSON.stringify({ output: path.relative(process.cwd(), target).replace(/\\\\/g, '/'), ...manifest.counts }, null, 2)); return;
  }
  if (command === 'asset-intake-dry-run') {
    const report = processAssets(assetRootArg(), loadCatalogue(), readExistingRules(), loadAssetManifest(assetManifestArg()));
    report.mode = 'dry-run'; report.generatedAt = new Date().toISOString();
    const target = path.resolve(process.cwd(), arg('--report', path.relative(process.cwd(), DEFAULT_REPORT_OUTPUT)));
    writeReport(report, target);
    console.error('LOCAL ASSET INTAKE DRY-RUN: no external search, no data.js changes, no app.js changes, no production mappings changed.'); return;
  }
  if (command === 'asset-intake-apply') {
    const reportPath = arg('--report', path.relative(process.cwd(), DEFAULT_REPORT_OUTPUT));
    const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), reportPath), 'utf8'));
    if (report.externalSearch !== false || report.manifestType !== 'local-bulk-asset-intake') throw new Error('Refusing apply: report is not a local asset-intake report');
    const data = loadCatalogue();
    const rules = readExistingRules();
    const state = computeMediaState(data, rules);
    for (const item of report.results.filter(x => x.state === 'VERIFIED')) {
      if (state.mappedIds.has(String(item.productId))) throw new Error('Refusing apply: product ' + item.productId + ' is already mapped in the current catalogue state');
      const source = path.resolve(process.cwd(), arg('--assets', path.relative(process.cwd(), DEFAULT_ASSET_ROOT)), item.asset);
      if (!fs.existsSync(source)) throw new Error('Refusing apply: source asset is missing: ' + item.asset);
    }
    const target = path.resolve(process.cwd(), arg('--output', path.relative(process.cwd(), DEFAULT_APPLIED_OUTPUT)));
    const applied = buildAppliedManifest(report, target);
    console.log(JSON.stringify({ output: path.relative(process.cwd(), target).replace(/\\\\/g, '/'), applied: applied.assets.length, mode: 'apply' }, null, 2));
    console.error('LOCAL ASSET INTAKE APPLY: updated only the asset-intake ledger; data.js, app.js, and existing verified mappings were not modified.'); return;
  }
  const data = loadCatalogue(); const rules = readExistingRules(); const before = computeMediaState(data, rules);
  if (command === 'audit') { writeReport(buildAudit(before, { accepted: [], rejected: [], duplicateUrlsRejected: [] })); return; }
  if (command === 'discover') {
    const productIds = productIdsArg();
    const proposal = await discover(productIds ? { productIds, onProgress: ({ completed, total }) => console.error('Discovery progress: ' + completed + '/' + total) } : { onProgress: ({ completed, total }) => console.error('Discovery progress: ' + completed + '/' + total) });
    writeReport(proposal); console.error('DISCOVERY ONLY: no mappings applied; data.js and app.js were not modified.'); return;
  }
  const validation = validateManifest(readManifest(arg('--manifest')), before); let after = before;
  if (command === 'apply' && validation.accepted.length) { applyMappings(DATA_PATH, validation.accepted); after = computeMediaState(loadCatalogue(), rules); }
  writeReport(buildAudit(before, validation, after));
  console.error('MEDIA INGESTION ' + command.toUpperCase());
  console.error('Before: ' + before.counts.verified + ' verified / ' + before.counts.pending + ' pending / ' + before.counts.catalogue + ' catalogue');
  console.error('Accepted: ' + validation.accepted.length); console.error('Rejected: ' + validation.rejected.length); console.error('Duplicate URLs rejected: ' + validation.duplicateUrlsRejected.length); console.error('After: ' + after.counts.verified + ' verified / ' + after.counts.pending + ' pending');
  if (command === 'dry-run') console.error('DRY-RUN: data.js was not modified.');
}
main().catch(error => { console.error('MEDIA INGESTION ERROR: ' + error.message); process.exitCode = 1; });