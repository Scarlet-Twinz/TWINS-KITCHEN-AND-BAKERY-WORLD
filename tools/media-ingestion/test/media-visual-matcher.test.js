const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const matcher=require("../../../admin/media/media-visual-matcher.js");

test("identical embeddings produce cosine similarity of one",()=>{
  assert.equal(matcher.cosineSimilarity([1,0,0],[1,0,0]),1);
});

test("reference ranking deduplicates multiple images for one product",()=>{
  const ranked=matcher.rankVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.71,referenceUrl:"/a.jpg"},
    {productId:"58",name:"20L Planetary Mixer",score:0.83,referenceUrl:"/b.jpg"},
    {productId:"33",name:"Commercial Dishwasher",score:0.70,referenceUrl:"/c.jpg"}
  ]);
  assert.deepEqual(ranked.map(x=>x.productId),["58","33"]);
  assert.equal(ranked[0].score,0.83);
});

test("product-level aggregation retains multiple supporting references",()=>{
  const ranked=matcher.rankVisualMatches([
    {productId:"60",name:"30kg Planetary Mixer",score:0.91,referenceUrl:"/a.jpg"},
    {productId:"60",name:"30kg Planetary Mixer",score:0.88,referenceUrl:"/b.jpg"},
    {productId:"61",name:"40kg Planetary Mixer",score:0.89,referenceUrl:"/c.jpg"}
  ]);
  assert.equal(ranked[0].productId,"60");
  assert.equal(ranked[0].supportingReferenceCount,2);
  assert.equal(ranked[0].supportingReferences.length,2);
  assert.equal(ranked[0].supportingReferences[0].referenceUrl,"/a.jpg");
});

test("high-confidence result exposes supporting-reference evidence",()=>{
  const result=matcher.classifyVisualMatches([
    {productId:"60",name:"30kg Planetary Mixer",score:0.91,referenceUrl:"/a.jpg"},
    {productId:"60",name:"30kg Planetary Mixer",score:0.88,referenceUrl:"/b.jpg"},
    {productId:"61",name:"40kg Planetary Mixer",score:0.70,referenceUrl:"/c.jpg"}
  ]);
  assert.equal(result.status,"HIGH");
  assert.equal(result.suggestions[0].supportingReferenceCount,2);
  assert.equal(result.suggestions[0].supportingReferences.length,2);
});

test("clear top embedding candidate is HIGH",()=>{
  const result=matcher.classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.91},
    {productId:"33",name:"Commercial Dishwasher",score:0.70}
  ]);
  assert.equal(result.status,"HIGH");
  assert.deepEqual(result.suggestions.map(x=>x.productId),["58"]);
});

test("close embedding candidates are MEDIUM when similarity is reasonable",()=>{
  const result=matcher.classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.80},
    {productId:"59",name:"Planetary Mixer",score:0.75}
  ]);
  assert.equal(result.status,"MEDIUM");
  assert.deepEqual(result.suggestions.map(x=>x.productId),["58","59"]);
  assert.ok(result.suggestions.every(x=>x.confidence==="MEDIUM"));
});

test("ambiguous embeddings remain unresolved",()=>{
  const result=matcher.classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.61},
    {productId:"33",name:"Commercial Dishwasher",score:0.60}
  ]);
  assert.equal(result.status,"UNRESOLVED");
  assert.deepEqual(result.suggestions,[]);
});

test("weak embeddings remain unresolved",()=>{
  const result=matcher.classifyVisualMatches([{productId:"58",name:"20L Planetary Mixer",score:0.40}]);
  assert.equal(result.status,"UNRESOLVED");
  assert.deepEqual(result.suggestions,[]);
});

test("empty catalogue index remains unresolved",()=>{
  const result=matcher.classifyVisualMatches([]);
  assert.equal(result.status,"UNRESOLVED");
});

test("missing reference embeddings are ignored",async()=>{
  const result=await matcher.buildReferenceIndex(
    [
      {id:58,n:"20L Planetary Mixer"},
      {id:33,n:"Commercial Dishwasher"}
    ],
    product=>product.id===58?["/mixer.jpg"]:["/broken.jpg"],
    null,
    null,
    {embedReference:async url=>url==="/broken.jpg"?{embedding:null,error:"SecurityError",status:"REFERENCE_UNAVAILABLE"}:{embedding:[1,0,0]}}
  );
  assert.equal(result.index.length,1);
  assert.equal(result.index[0].productId,"58");
  assert.equal(result.unavailableReferences[0].status,"REFERENCE_UNAVAILABLE");
});

test("catalogue index uses cached reference embeddings without requiring model inference",async()=>{
  const calls=[];
  const result=await matcher.buildReferenceIndex(
    [{id:58,n:"20L Planetary Mixer"}],
    ()=>["/mixer.jpg"],
    null,
    null,
    {embedReference:async url=>{calls.push(url);return{embedding:[1,0,0]};}}
  );
  assert.equal(calls.length,1);
  assert.equal(result.usable,1);
});

test("Media Center uses ONNX vision embeddings, persistent indexing, background enrichment and manual picker",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../../admin/media/media-center.js"),"utf8");
  assert.match(source,/buildReferenceIndex/);
  assert.match(source,/embeddingForBlob/);
  assert.match(source,/rankByEmbedding/);
  assert.match(source,/void enrichVisualSuggestions\(\)/);
  assert.match(source,/function selectCatalogueProduct\(/);
  assert.match(source,/ONNX vision \/ Transformers\.js/);
  assert.doesNotMatch(source,/signatureFromPixels/);
  assert.doesNotMatch(source,/visualSimilarity/);
});

test("vision module uses MobileCLIP and supports WebGPU with WASM fallback",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../../admin/media/media-visual-matcher.js"),"utf8");
  assert.match(source,/Xenova\/mobileclip_s0/);
  assert.match(source,/CLIPVisionModelWithProjection/);
  assert.match(source,/device="webgpu"/);
  assert.match(source,/device="wasm"/);
  assert.match(source,/dtype="fp16"/);
  assert.match(source,/dtype="fp32"/);
  assert.match(source,/useBrowserCache=true/);
  assert.match(source,/indexedDB/);
});

test("manual picker and protected workflow remain present",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../../admin/media/media-center.js"),"utf8");
  assert.match(source,/function selectCatalogueProduct\(/);
  assert.match(source,/async function revalidate\(/);
  assert.match(source,/async function approveAsset\(/);
  assert.match(source,/will not publish automatically/);
});
