const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");

const APP=path.join(__dirname,"../../../app.js");

test("public storefront has no hard-coded third-party product fallback media",()=>{
  const source=fs.readFileSync(APP,"utf8");
  assert.doesNotMatch(source,/var FINAL_MEDIA_RULES=/);
  assert.doesNotMatch(source,/var FINAL_CATEGORY_MEDIA=/);
  assert.match(source,/function isPublicMediaSrc\(src\)/);
  assert.match(source,/function cards\(list\)\{\s*return list\.filter\(function\(p\)\{return !!productMedia\(p\)\.src;\}\)/);
});

test("public duplicate media gate blocks every duplicate assignment",()=>{
  const source=fs.readFileSync(APP,"utf8");
  assert.match(source,/if\(candidate\.src\)counts\[candidate\.src\]=\(counts\[candidate\.src\]\|\|0\)\+1/);
  assert.match(source,/if\(candidate\.src&&counts\[candidate\.src\]>1\)/);
});

test("public media library filters to local Twins assets",()=>{
  const source=fs.readFileSync(APP,"utf8");
  assert.match(source,/MEDIA_LIBRARY\.filter\(function\(m\)\{return isPublicMediaSrc\(m\.src\);\}\)/);
});
