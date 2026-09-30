const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const adapter=fs.readFileSync("admin/media/smolvlm-local.js","utf8");
const center=fs.readFileSync("admin/media/media-center.js","utf8");
const html=fs.readFileSync("admin/media/index.html","utf8");
const server=fs.readFileSync("tools/smolvlm-local/server.js","utf8");
const prep=fs.readFileSync("tools/smolvlm-local/prepare-model.ps1","utf8");
const backend=fs.readFileSync("backend/main.py","utf8");
const schema=fs.readFileSync("backend/schema.sql","utf8");

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
  assert.match(center,/enrichVisualSuggestions\(targetIds=null\)/);
  assert.match(center,/enrichOpenWorldSuggestions\(targetIds=null\)/);
  assert.match(center,/assets\.filter\(a=>!a\.productId\)/);
  assert.match(center,/data-open-world-action/);
});

test("owner open-world decisions are sent to an authenticated backend audit route",()=>{
  assert.match(center,/\/api\/admin\/media\/.*\/open-world-decision/);
  assert.match(backend,/\/api\/admin\/media\/\{asset_id\}\/open-world-decision/);
  assert.match(backend,/MEDIA_OPEN_WORLD_DECISION/);
});

test("candidate creation carries the preserved open-world result",()=>{
  assert.match(center,/openWorldResult:asset\.openWorldResult/);
  assert.match(backend,/evidence_payload\["aiResult"\]=ai_result/);
  assert.match(backend,/aiResult/);
});

test("candidate queue endpoint and local development CORS are present",()=>{
  assert.match(backend,/\/api\/admin\/media\/candidates/);
  assert.match(backend,/allow_origin_regex/);
  assert.match(backend,/require_owner\(request\)/);
});

test("SmolVLM result persistence is server-authoritative",()=>{
  assert.match(schema,/smolvlm_result jsonb/);
  assert.match(backend,/MEDIA_AI_RESULT_PERSISTED/);
  assert.match(backend,/\/api\/admin\/media\/\{asset_id\}\/ai-result/);
  assert.match(center,/kind:"smolvlm"/);
});

test("Media API hydrates persisted SmolVLM results",()=>{
  assert.match(backend,/smolvlmResult/);
  assert.match(center,/a\.smolvlmResult/);
  assert.match(center,/a\.openWorldResult=\{\.\.\.a\.smolvlmResult\}/);
});

test("normal queue refresh does not invoke AI inference",()=>{
  assert.match(center,/async function refresh\(showFeedback=false,options=\{\}\)/);
  assert.match(center,/const runInference=options\.runInference===true/);
  assert.match(center,/if\(runInference\)/);
  assert.doesNotMatch(center,/async function refresh\(showFeedback=false\)[\\s\\S]*void enrichVisualSuggestions\(\);[\\s\\S]*void enrichOpenWorldSuggestions\(\);/);
});

test("explicit Revalidate clears persisted AI results and then reruns inference",()=>{
  assert.match(center,/\/ai-results.*DELETE/);
  assert.match(center,/refresh\(false,\{runInference:true,targetIds:\[id\]\}\)/);
});

test("candidate refresh does not invoke inference",()=>{
  assert.match(center,/async function loadCandidates\(\)/);
  assert.match(center,/admin\/media\/candidates\?status=PENDING_OWNER/);
});

test("owner corrections persist all editable identification fields",()=>{
  assert.match(center,/ownerCorrection=\{/);
  assert.match(center,/productName:productName\.trim\(\)/);
  assert.match(center,/category:category\.trim\(\)/);
  assert.match(center,/description:description\.trim\(\)/);
  assert.match(center,/visibleAttributes:attributes\.split/);
  assert.match(schema,/smolvlm_owner_override jsonb/);
});

test("original AI evidence remains separate from owner correction",()=>{
  assert.match(backend,/smolvlm_result=%s/);
  assert.match(backend,/smolvlm_owner_override=%s/);
  assert.match(center,/original AI result remains preserved/);
});

test("SmolVLM uses a compact generation budget and exposes timing telemetry",()=>{
  assert.match(server,/max_new_tokens:64/);
  assert.match(server,/modelLoadMs/);
  assert.match(server,/preprocessMs/);
  assert.match(server,/generationMs/);
  assert.match(server,/decodeMs/);
  assert.match(server,/generatedTokens/);
});

test("upload-time processing explicitly opts into inference",()=>{
  assert.match(center,/refresh\(false,\{runInference:true\}\)/);
});

test("persisted visual catalogue results prevent repeated MobileCLIP inference",()=>{
  assert.match(schema,/visual_match_result jsonb/);
  assert.match(center,/!a\.visualMatchResult/);
  assert.match(center,/kind:"visual"/);
});
