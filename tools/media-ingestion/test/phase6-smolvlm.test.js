const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const adapter=fs.readFileSync("admin/media/smolvlm-local.js","utf8");
const center=fs.readFileSync("admin/media/media-center.js","utf8");
const html=fs.readFileSync("admin/media/index.html","utf8");
const server=fs.readFileSync("tools/smolvlm-local/server.js","utf8");
const prep=fs.readFileSync("tools/smolvlm-local/prepare-model.ps1","utf8");

test("local SmolVLM adapter is loaded by Media Center",()=>{
  assert.match(html,/\.\/smolvlm-local\.js/);
  assert.match(adapter,/HuggingFaceTB\/SmolVLM-500M-Instruct/);
  assert.match(adapter,/127\.0\.0\.1:8787/);
});

test("open-world inference is optional and does not replace catalogue matching",()=>{
  assert.match(center,/suggestionStatus==="UNRESOLVED"/);
  assert.match(center,/enrichOpenWorldSuggestions/);
  assert.match(center,/openWorldResult/);
  assert.match(center,/CATALOGUE REFERENCE/);
});

test("local service refuses remote model loading",()=>{
  assert.match(server,/env\.allowRemoteModels=false/);
  assert.match(server,/local_files_only:true/);
  assert.match(server,/device:"cpu"/);
});

test("local service uses all three required q4 ONNX components",()=>{
  assert.match(server,/vision_encoder_q4\.onnx/);
  assert.match(server,/decoder_model_merged_q4\.onnx/);
  assert.match(server,/embed_tokens_q4\.onnx/);
  assert.match(server,/AutoModelForVision2Seq/);
  assert.match(server,/generatedOutput/);
  assert.match(server,/\.slice\?\./);
});

test("local service returns required open-world proof fields",()=>{
  for(const field of ["filename","model","modelVersion","productName","category","description","visibleAttributes","confidence","status","catalogueReference","inferenceMs"]){
    assert.match(server,new RegExp(field));
  }
});

test("large local model files are excluded from Git",()=>{
  const ignore=fs.readFileSync(".gitignore","utf8");
  assert.match(ignore,/tools\/smolvlm-local\/model\//);
  assert.match(ignore,/tools\/smolvlm-local\/node_modules\//);
});

test("local server syntax parses",()=>{
  new vm.Script(server);
});

test("model preparation reuses the user's verified isolated weights",()=>{
  assert.match(prep,/twins-smolvlm-proof/);
  assert.match(prep,/vision_encoder_q4\.onnx/);
  assert.match(prep,/decoder_model_merged_q4\.onnx/);
  assert.match(prep,/embed_tokens_q4\.onnx/);
});

const parserStart=server.indexOf("function cleanGeneratedText");
const parserEnd=server.indexOf("async function loadRuntime");
const parserSource=server.slice(parserStart,parserEnd)+"\nmodule.exports={cleanGeneratedText,normalizeConfidence,isSchemaRepetition,normalizeStructuredResult,extractJson,parseNaturalLanguage};";
const serverModule={exports:{}};
vm.runInNewContext(parserSource,{module:serverModule,exports:serverModule.exports});
const smolvlm=serverModule.exports;

test("SmolVLM parser accepts valid structured JSON and normalizes confidence",()=>{
  const result=smolvlm.extractJson(JSON.stringify({
    productName:"Planetary mixer",
    category:"Commercial kitchen equipment",
    description:"Floor-standing mixer with a stainless-steel bowl.",
    visibleAttributes:["stainless steel bowl","control panel"],
    confidence:"89%",
    status:"IDENTIFIED"
  }));
  assert.equal(result.productName,"Planetary mixer");
  assert.equal(result.confidence,0.89);
  assert.equal(result.status,"IDENTIFIED");
});

test("SmolVLM parser rejects schema repetition instead of treating field names as an answer",()=>{
  const raw="productName category description visibleAttributes confidence status productName category description visibleAttributes confidence status";
  assert.equal(smolvlm.extractJson(raw),null);
  assert.equal(smolvlm.parseNaturalLanguage(raw),null);
});

test("SmolVLM parser falls back safely to natural-language visual identification",()=>{
  const raw="White and blue vertical bookshelf with blue trim.";
  const result=smolvlm.extractJson(raw)||smolvlm.parseNaturalLanguage(raw);
  assert.equal(result.productName,"White and blue vertical bookshelf with blue trim.");
  assert.equal(result.description,raw);
  assert.equal(result.status,"UNRESOLVED");
  assert.equal(result.confidence,0);
});

test("SmolVLM parser repairs simple trailing-comma JSON",()=>{
  const raw='{"productName":"Commercial blender","category":"Blender","description":"Countertop blender.","visibleAttributes":["jar","base"],"confidence":0.72,"status":"UNCERTAIN",}';
  const result=smolvlm.extractJson(raw);
  assert.equal(result.productName,"Commercial blender");
  assert.equal(result.confidence,0.72);
  assert.equal(result.status,"UNCERTAIN");
});

test("Media Center keeps open-world processing independent from MobileCLIP",()=>{
  assert.match(center,/void Promise\.all\(\[enrichVisualSuggestions\(\),enrichOpenWorldSuggestions\(\)\]\)/);
  assert.match(center,/assets\.filter\(a=>!a\.productId\)/);
  assert.match(center,/data-open-world-action/);
});

test("owner open-world decisions are sent to an authenticated backend audit route",()=>{
  assert.match(center,/\/api\/admin\/media\/.*\/open-world-decision/);
  assert.match(server,/\/api\/admin\/media\/\{asset_id\}\/open-world-decision/);
  assert.match(server,/MEDIA_OPEN_WORLD_DECISION/);
});

test("candidate creation carries the preserved open-world result",()=>{
  assert.match(center,/openWorldResult:asset\.openWorldResult/);
  assert.match(server,/evidence_payload\["aiResult"\]=ai_result/);
  assert.match(server,/aiResult/);
});

test("candidate queue endpoint and local development CORS are present",()=>{
  assert.match(server,/\/api\/admin\/media\/candidates/);
  assert.match(server,/allow_origin_regex/);
  assert.match(server,/require_owner\(request\)/);
});
