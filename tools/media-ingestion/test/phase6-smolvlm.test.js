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
