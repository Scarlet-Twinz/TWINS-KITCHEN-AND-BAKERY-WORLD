const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const {classifyVisualMatches,visualSimilarity,signatureFromPixels}=require("../../../admin/media/media-visual-matcher.js");

test("automatic visual match returns the strongest high-confidence catalogue match",()=>{
  const result=classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.94},
    {productId:"33",name:"Commercial Dishwasher",score:0.70}
  ]);
  assert.equal(result.status,"HIGH");
  assert.deepEqual(result.suggestions.map(x=>x.productId),["58"]);
});

test("high-confidence visual match requires a clear margin",()=>{
  const result=classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.91},
    {productId:"59",name:"Planetary Mixer",score:0.90}
  ]);
  assert.equal(result.status,"UNRESOLVED");
});

test("medium visual match returns candidates for human review",()=>{
  const result=classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.80},
    {productId:"59",name:"Planetary Mixer",score:0.75},
    {productId:"33",name:"Commercial Dishwasher",score:0.40}
  ]);
  assert.equal(result.status,"MEDIUM");
  assert.deepEqual(result.suggestions.map(x=>x.productId),["58","59"]);
  assert.ok(result.suggestions.every(x=>x.confidence==="MEDIUM"));
});

test("ambiguous or weak visual evidence remains unresolved",()=>{
  const result=classifyVisualMatches([
    {productId:"58",name:"20L Planetary Mixer",score:0.71},
    {productId:"33",name:"Commercial Dishwasher",score:0.69}
  ]);
  assert.equal(result.status,"UNRESOLVED");
});

test("no visual reference candidates never forces a product",()=>{
  const result=classifyVisualMatches([]);
  assert.equal(result.status,"UNRESOLVED");
  assert.deepEqual(result.suggestions,[]);
});

test("visual signatures and similarity are deterministic",()=>{
  const pixels=new Uint8ClampedArray([
    255,0,0,255,255,0,0,255,
    255,0,0,255,255,0,0,255
  ]);
  const a=signatureFromPixels(pixels,2,2);
  const b=signatureFromPixels(pixels,2,2);
  assert.equal(visualSimilarity(a,b),1);
});

test("Media Center makes visual matching primary and keeps manual picker as fallback",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../../admin/media/media-center.js"),"utf8");
  assert.match(source,/await enrichVisualSuggestions\(\)/);
  assert.match(source,/a\.suggestions=\[\];/);
  assert.match(source,/function selectCatalogueProduct\(/);
});

test("low-confidence visual evidence remains unresolved without a suggested product",()=>{
  const unresolved=classifyVisualMatches([{productId:"58",name:"20L Planetary Mixer",score:0.40}]);
  assert.equal(unresolved.status,"UNRESOLVED");
  assert.deepEqual(unresolved.suggestions,[]);
});

test("semantic vision can produce a high-confidence automatic match only with local supporting evidence",()=>{
  const matcher=require("../../../admin/media/media-visual-matcher.js");
  const result=matcher.classifySemanticVisualMatch({result:"MATCH",productId:"58",confidence:"HIGH",reason:"same product"},[{productId:"58",name:"20L Planetary Mixer"}],{"58":0.61});
  assert.equal(result.status,"HIGH");
  assert.equal(result.suggestions[0].productId,"58");
});
test("semantic vision produces medium-confidence candidates for human review",()=>{
  const matcher=require("../../../admin/media/media-visual-matcher.js");
  const result=matcher.classifySemanticVisualMatch({result:"AMBIGUOUS",productId:"58",confidence:"MEDIUM",reason:"plausible"},[{productId:"58",name:"20L Planetary Mixer"}],{"58":0.45});
  assert.equal(result.status,"MEDIUM");
});
test("semantic vision never forces an unresolved image",()=>{
  const matcher=require("../../../admin/media/media-visual-matcher.js");
  const result=matcher.classifySemanticVisualMatch({result:"NO_MATCH",productId:null,confidence:"LOW",reason:"unclear"},[{productId:"58",name:"20L Planetary Mixer"}],{"58":0.90});
  assert.equal(result.status,"UNRESOLVED");
  assert.deepEqual(result.suggestions,[]);
});
test("Media Center uses on-device vision when available and preserves the manual picker fallback",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../../admin/media/media-center.js"),"utf8");
  assert.match(source,/semanticVisualMatch/);
  assert.match(source,/visualReferenceUrls/);
  assert.match(source,/function selectCatalogueProduct\(/);
  assert.match(source,/on-device vision when available/);
});
