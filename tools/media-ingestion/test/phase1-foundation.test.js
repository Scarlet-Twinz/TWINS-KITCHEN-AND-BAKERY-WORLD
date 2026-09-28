const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadCatalogue}=require("../validator");

const ROOT=path.join(__dirname,"..","..","..");

test("Phase 1 preserves the canonical 530-product catalogue and IDs",()=>{
  const data=loadCatalogue();
  assert.equal(data.P.length,530);
  assert.deepEqual(Array.from(data.P, p=>Number(p.id)),Array.from({length:530},(_,i)=>i+1));
});

test("public media gate rejects external URLs and allows only local assets",()=>{
  const source=fs.readFileSync(path.join(ROOT,"app.js"),"utf8");
  assert.match(source,/function isPublicMediaSrc\(src\)/);
  assert.match(source,/src\.indexOf\("assets\/media\/"\)===0/);
  assert.match(source,/src\.indexOf\("\/assets\/media\/"\)===0/);
  assert.match(source,/function cards\(list\)\{\s*return list\.filter\(function\(p\)\{return !!productMedia\(p\)\.src;\}\)/);
});

test("Phase 1 candidate and visual-reference records are separate from canonical products",()=>{
  const schema=fs.readFileSync(path.join(ROOT,"backend","schema.sql"),"utf8");
  const mediaSchema=fs.readFileSync(path.join(ROOT,"backend","media_center.sql"),"utf8");
  for(const source of [schema,mediaSchema]){
    assert.match(source,/create table if not exists media_product_candidates/);
    assert.match(source,/create table if not exists media_visual_references/);
    assert.match(source,/reference_asset_id text primary key/);
    assert.match(source,/product_legacy_id integer not null/);
    assert.match(source,/media_asset_id uuid references media_assets/);
    assert.match(source,/model_revision text not null/);
  }
});

test("reference manifest is versioned and product-bound",()=>{
  const schema=JSON.parse(fs.readFileSync(path.join(ROOT,"tools","media-ingestion","manifests","reference-index.schema.json"),"utf8"));
  assert.equal(schema.schemaVersion??1,1);
  assert.equal(schema.$defs.reference.required.includes("productId"),true);
  assert.equal(schema.$defs.reference.required.includes("referenceAssetId"),true);
  assert.equal(schema.$defs.reference.required.includes("assetId"),true);
  assert.equal(schema.$defs.reference.required.includes("checksum"),true);
  assert.equal(schema.$defs.reference.required.includes("modelRevision"),true);
});
