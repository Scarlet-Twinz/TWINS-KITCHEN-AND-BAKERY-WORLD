const fs = require('node:fs');
const path = require('node:path');
const { DATA_PATH, loadCatalogue, readExistingRules, computeMediaState, validateManifest, applyMappings, buildAudit } = require('./validator');
const { writePendingManifest } = require('./collector');
const { discover } = require('./discovery');

function arg(name, fallback = null) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
function productIdsArg() { const value = arg('--product-ids'); if (!value) return null; const ids = value.split(',').map(x => x.trim()).filter(Boolean); if (!ids.length || ids.some(x => !/^\d+$/.test(x))) throw new Error('--product-ids must be a comma-separated list of numeric product IDs'); return [...new Set(ids)]; }
function readManifest(file) { if (!file) return { candidates: [] }; const parsed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')); return Array.isArray(parsed) ? { candidates: parsed } : parsed; }
function writeReport(report) { const target = arg('--report'); const output = JSON.stringify(report, null, 2); if (target) { const p = path.resolve(process.cwd(), target); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, output + '\n', 'utf8'); } console.log(output); }
async function main() {
  const command = process.argv[2] || 'dry-run';
  if (!['dry-run','apply','audit','pending-manifest','discover'].includes(command)) throw new Error('Usage: node tools/media-ingestion/index.js <audit|pending-manifest|discover|dry-run|apply> [--manifest path] [--report path] [--product-ids 1,2,3]');
  if (command === 'pending-manifest') { const target = arg('--output', 'tools/media-ingestion/manifests/pending-catalogue.json'); const manifest = writePendingManifest(path.resolve(process.cwd(), target)); console.log(JSON.stringify({ output: target, ...manifest.counts }, null, 2)); return; }
  const data = loadCatalogue(); const rules = readExistingRules(); const before = computeMediaState(data, rules);
  if (command === 'audit') { writeReport(buildAudit(before, { accepted: [], rejected: [], duplicateUrlsRejected: [] })); return; }
  if (command === 'discover') {
    const productIds = productIdsArg();
    const proposal = await discover(productIds ? { productIds, onProgress: ({ completed, total }) => console.error('Discovery progress: ' + completed + '/' + total) } : { onProgress: ({ completed, total }) => console.error('Discovery progress: ' + completed + '/' + total) });
    writeReport(proposal);
    console.error('DISCOVERY ONLY: no mappings applied; data.js and app.js were not modified.');
    return;
  }
  const validation = validateManifest(readManifest(arg('--manifest')), before); let after = before;
  if (command === 'apply' && validation.accepted.length) { applyMappings(DATA_PATH, validation.accepted); after = computeMediaState(loadCatalogue(), rules); }
  writeReport(buildAudit(before, validation, after));
  console.error('MEDIA INGESTION ' + command.toUpperCase());
  console.error('Before: ' + before.counts.verified + ' verified / ' + before.counts.pending + ' pending / ' + before.counts.catalogue + ' catalogue');
  console.error('Accepted: ' + validation.accepted.length);
  console.error('Rejected: ' + validation.rejected.length);
  console.error('Duplicate URLs rejected: ' + validation.duplicateUrlsRejected.length);
  console.error('After: ' + after.counts.verified + ' verified / ' + after.counts.pending + ' pending');
  if (command === 'dry-run') console.error('DRY-RUN: data.js was not modified.');
}
main().catch(error => { console.error('MEDIA DISCOVERY ERROR: ' + error.message); process.exitCode = 1; });