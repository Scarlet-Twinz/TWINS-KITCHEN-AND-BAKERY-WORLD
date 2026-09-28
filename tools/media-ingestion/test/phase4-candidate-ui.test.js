const fs=require("node:fs");
const test=require("node:test");
const assert=require("node:assert/strict");

const ui=fs.readFileSync("admin/media/media-center.js","utf8");
const html=fs.readFileSync("admin/media/index.html","utf8");
const backend=fs.readFileSync("backend/main.py","utf8");
const schema=fs.readFileSync("backend/schema.sql","utf8");

test("new product candidate UI persists candidate creation instead of local-only state",()=>{
  assert.match(ui,/POST.*\/api\/admin\/media\/candidates/s);
  assert.match(ui,/assetIds:\[assetId\]/);
  assert.match(ui,/await loadCandidates\(\)/);
});

test("candidate review UI exposes photos, evidence, edit, approve, keep pending and reject",()=>{
  assert.match(html,/New Product Candidates/);
  assert.match(ui,/candidate-photos/);
  assert.match(ui,/Approve &amp; Create Product/);
  assert.match(ui,/Edit Name/);
  assert.match(ui,/Keep Pending/);
  assert.match(ui,/Reject Candidate/);
});

test("canonical product ID is assigned by backend, not browser code",()=>{
  assert.match(backend,/next_id=max\(530,int\(max_row\[0\] or 0\)\)\+1/);
  assert.match(backend,/insert into products/);
  assert.doesNotMatch(ui,/legacy_catalogue_id/);
  assert.doesNotMatch(ui,/next_id/);
});

test("candidate approval requires owner session, authorized rights and validates duplicate names",()=>{
  assert.match(backend,/def media_candidate_approve/);
  assert.match(backend,/actor=require_owner\(request\)/);
  assert.match(backend,/Possible duplicate existing product/);
  assert.match(backend,/authorized provenance and rights/);
  assert.match(backend,/status='APPROVED'/);
  assert.match(backend,/media_production_mappings/);
});

test("candidate persistence records approver and creation provenance in audit logs",()=>{
  assert.match(backend,/MEDIA_PRODUCT_CREATED/);
  assert.match(backend,/candidateId/);
  assert.match(backend,/assetIds/);
});

test("candidate schema supports pending, created, merged, unresolved and rejected states",()=>{
  assert.match(schema,/create table if not exists media_product_candidates/);
  assert.match(schema,/PENDING_OWNER/);
  assert.match(schema,/CREATED/);
  assert.match(schema,/MERGED/);
  assert.match(schema,/KEPT_UNRESOLVED/);
  assert.match(schema,/REJECTED/);
});

test("candidate grouping uses deterministic filename and dimension evidence with review fallback",()=>{
  assert.match(backend,/def group_candidate_assets/);
  assert.match(backend,/reviewRequired/);
  assert.match(backend,/same_shape/);
});

test("insufficient evidence falls back to explicit review-required naming",()=>{
  assert.match(backend,/New Product — Review Required/);
  assert.match(backend,/Only promote evidence already present/);
});
