const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");

const APP=path.join(__dirname,"../../../app.js");

test("public storefront rejects external and duplicate fallback media",()=>{
  const source=fs.readFileSync(APP,"utf8");
  assert.match(source,/function isPublicMediaSrc\(src\)/);
  assert.doesNotMatch(source,/var FINAL_MEDIA_RULES=/);
  assert.doesNotMatch(source,/var FINAL_CATEGORY_MEDIA=/);
  assert.match(source,/function cards\(list\)\{\s*return list\.filter\(function\(p\)\{return !!productMedia\(p\)\.src;\}\)/);
});

test("public media gate accepts only local assets/media paths",()=>{
  const source=fs.readFileSync(APP,"utf8");
  assert.match(source,/value\.indexOf\("assets\/media\/"\)===0\|\|value\.indexOf\("\/assets\/media\/"\)===0/);
});

test("new-product candidates are represented separately from canonical products",()=>{
  const schema=fs.readFileSync(path.join(__dirname,"../../../backend/schema.sql"),"utf8");
  assert.match(schema,/create table if not exists media_product_candidates/);
  assert.match(schema,/status text not null default 'PENDING_OWNER'/);
  assert.doesNotMatch(schema,/media_product_candidates[\s\S]*canonical_product_id/);
});
