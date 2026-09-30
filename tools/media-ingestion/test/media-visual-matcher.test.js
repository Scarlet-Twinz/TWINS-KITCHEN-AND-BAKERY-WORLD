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
  assert.match(source,/evaluateVisualMatch/);
  assert.match(source,/enrichVisualSuggestions\(targetIds=null\)/);
  assert.match(source,/function selectCatalogueProduct\(/);
  assert.match(source,/confirmSuggestedProduct/);
  assert.match(source,/markNewProductCandidate/);
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

test("product-level visual evidence aggregates multiple references and reports margin",()=>{
  const result=matcher.evaluateVisualMatch([1,0],[
    {productId:"58",name:"20L Planetary Mixer",referenceAssetId:"r58a",referenceUrl:"/a.jpg",checksum:"a",embedding:[1,0]},
    {productId:"58",name:"20L Planetary Mixer",referenceAssetId:"r58b",referenceUrl:"/b.jpg",checksum:"b",embedding:[0.8,0.6]},
    {productId:"33",name:"Commercial Dishwasher",referenceAssetId:"r33",referenceUrl:"/c.jpg",checksum:"c",embedding:[0.75,0.66]}
  ]);
  assert.equal(result.status,"HIGH");
  assert.equal(result.topCandidate.productId,"58");
  assert.equal(result.topCandidate.referenceCount,2);
  assert.equal(result.supportingReferences.length,2);
  assert.equal(result.secondCandidate.productId,"33");
  assert.ok(result.margin>0);
  assert.equal(result.model,"Xenova/mobileclip_s0");
  assert.equal(result.modelRevision,"main");
});

test("MEDIUM returns multiple plausible products and never silently selects one",()=>{
  const result=matcher.evaluateVisualMatch([1,0],[
    {productId:"58",name:"20L Planetary Mixer",referenceAssetId:"r58",embedding:[0.8,0.6]},
    {productId:"59",name:"Planetary Mixer",referenceAssetId:"r59",embedding:[0.78,0.625]}
  ],{highThreshold:0.99,mediumThreshold:0.60,mediumMargin:0.015});
  assert.equal(result.status,"MEDIUM");
  assert.equal(result.suggestions.length,2);
  assert.ok(result.suggestions.every(x=>x.confidence==="MEDIUM"));
  assert.equal(result.suggestions.some(x=>x.confirmed),false);
});

test("UNRESOLVED is returned when local catalogue evidence is insufficient",()=>{
  const result=matcher.evaluateVisualMatch([1,0],[
    {productId:"58",name:"20L Planetary Mixer",referenceAssetId:"r58",embedding:[0.4,0.9165]}
  ]);
  assert.equal(result.status,"UNRESOLVED");
  assert.equal(result.suggestions.length,0);
});

test("confirmed eligible asset becomes a reference record without choosing or publishing a catalogue ID",()=>{
  const record=matcher.confirmedReferenceFromAsset({
    id:"asset-1",sha256:"sha-1",sourceType:"owned",rightsStatus:"owned",role:"detail"
  },"58","2026-09-28T00:00:00.000Z");
  assert.equal(record.productId,"58");
  assert.equal(record.referenceAssetId,"asset-1");
  assert.equal(record.mediaAssetId,"asset-1");
  assert.equal(record.rights,"owned");
  assert.equal(record.status,"ACTIVE");
  assert.throws(()=>matcher.confirmedReferenceFromAsset({id:"asset-2",sha256:"sha-2",sourceType:"review",rightsStatus:"review"},"58"),/authorized provenance/);
});

test("AI matcher never creates a product ID",()=>{
  const result=matcher.evaluateVisualMatch([1,0],[]);
  assert.equal(result.status,"UNRESOLVED");
  assert.equal(result.productId,undefined);
  assert.equal(result.topCandidate,null);
  assert.equal(result.secondCandidate,null);
});
