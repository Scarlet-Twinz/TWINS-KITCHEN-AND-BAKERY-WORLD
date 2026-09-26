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
    {productId:"59",name:"Planetary Mixer",score:0.75}
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

test("low-confidence visual evidence remains unresolved without a suggested product",()=>{
  const unresolved=classifyVisualMatches([{productId:"58",name:"20L Planetary Mixer",score:0.40}]);
  assert.equal(unresolved.status,"UNRESOLVED");
  assert.deepEqual(unresolved.suggestions,[]);
});
