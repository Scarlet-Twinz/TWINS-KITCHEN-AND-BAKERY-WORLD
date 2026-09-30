const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {AutoProcessor,AutoModelForVision2Seq,RawImage,env}=require("@huggingface/transformers");

const HOST=process.env.SMOLVLM_HOST||"127.0.0.1";
const PORT=Number(process.env.SMOLVLM_PORT||8787);
const MODEL_DIR=path.resolve(process.env.SMOLVLM_MODEL_DIR||path.join(__dirname,"model"));
const MODEL_ID="HuggingFaceTB/SmolVLM-500M-Instruct";
const LOCAL_MODEL_NAME=process.env.SMOLVLM_LOCAL_MODEL_NAME||"model";
const MODEL_VERSION=process.env.SMOLVLM_MODEL_VERSION||"SmolVLM-500M-Instruct / ONNX q4";
let runtimePromise=null;

env.allowRemoteModels=false;
env.allowLocalModels=true;
env.localModelPath=path.dirname(MODEL_DIR);
env.useBrowserCache=false;

function send(res,status,payload){
  const body=JSON.stringify(payload);
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","cache-control":"no-store"});
  res.end(body);
}
function cors(res){
  res.setHeader("access-control-allow-origin","*");
  res.setHeader("access-control-allow-methods","GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers","content-type,x-filename,x-mime-type");
}
function readBody(req,maxBytes=15*1024*1024){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    req.on("data",chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy();reject(new Error("image exceeds 15 MB limit"));return}chunks.push(chunk)});
    req.on("end",()=>resolve(Buffer.concat(chunks)));
    req.on("error",reject);
  });
}
function cleanGeneratedText(text){
  return String(text||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
}
function normalizeConfidence(value){
  if(typeof value==="string"){
    const match=value.match(/-?\d+(?:\.\d+)?/);
    if(!match)return 0;
    const n=Number(match[0]);
    return Number.isFinite(n)?(n>1?n/100:n):0;
  }
  const n=Number(value);
  return Number.isFinite(n)?(n>1?n/100:n):0;
}
function isSchemaRepetition(text){
  const raw=cleanGeneratedText(text).toLowerCase();
  const fields=["productname","category","description","visibleattributes","confidence","status"];
  const hits=fields.filter(field=>raw.includes(field));
  if(hits.length<4)return false;
  const compact=raw.replace(/[\s,:;{}\[\]"'_-]+/g,"");
  return compact.length<180 || hits.length===fields.length;
}
function normalizeStatus(value){
  const status=String(value||"").trim().toUpperCase();
  return ["IDENTIFIED","UNCERTAIN","UNRESOLVED"].includes(status)?status:"UNRESOLVED";
}
function normalizeStructuredResult(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const productName=String(value.productName||"").trim();
  const category=String(value.category||"").trim();
  const description=String(value.description||"").trim();
  const visibleAttributes=Array.isArray(value.visibleAttributes)
    ? value.visibleAttributes.map(v=>String(v).trim()).filter(Boolean).slice(0,12)
    : [];
  if(!productName&&!description)return null;
  if([productName,category,description,...visibleAttributes].some(isSchemaRepetition))return null;
  return {
    productName,
    category,
    description,
    visibleAttributes,
    confidence:Math.max(0,Math.min(1,normalizeConfidence(value.confidence))),
    status:normalizeStatus(value.status)
  };
}
function extractJson(text){
  const raw=cleanGeneratedText(text);
  try{
    const parsed=normalizeStructuredResult(JSON.parse(raw));
    if(parsed)return parsed;
  }catch{}
  const match=raw.match(/\{[\s\S]*\}/);
  if(match){
    try{
      const parsed=normalizeStructuredResult(JSON.parse(match[0]));
      if(parsed)return parsed;
    }catch{}
    try{
      const repaired=match[0].replace(/,\s*([}])/g,"$1").replace(/,\s*([\]])/g,"$1");
      const parsed=normalizeStructuredResult(JSON.parse(repaired));
      if(parsed)return parsed;
    }catch{}
  }
  return null;
}
function parseNaturalLanguage(text){
  const raw=cleanGeneratedText(text);
  if(!raw||isSchemaRepetition(raw))return null;
  const productMatch=raw.match(/(?:^|\n)\s*(?:product|item)\s*[:=-]\s*(.+?)(?=\n|$)/i);
  const categoryMatch=raw.match(/(?:^|\n)\s*category\s*[:=-]\s*(.+?)(?=\n|$)/i);
  const descriptionMatch=raw.match(/(?:^|\n)\s*description\s*[:=-]\s*(.+?)(?=\n|$)/i);
  const attributesMatch=raw.match(/(?:^|\n)\s*(?:visible\s+attributes|attributes)\s*[:=-]\s*(.+?)(?=\n|$)/i);
  const confidenceMatch=raw.match(/(?:confidence|certainty)\s*[:=-]\s*(\d+(?:\.\d+)?%?)/i);
  const statusMatch=raw.match(/(?:status)\s*[:=-]\s*(IDENTIFIED|UNCERTAIN|UNRESOLVED)/i);
  const sentences=raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  const productName=(productMatch?.[1]||sentences[0]||"").trim();
  if(!productName)return null;
  const visibleAttributes=attributesMatch
    ? attributesMatch[1].split(/[,;•|]/).map(x=>x.trim()).filter(Boolean).slice(0,12)
    : [];
  return {
    productName,
    category:(categoryMatch?.[1]||"").trim(),
    description:(descriptionMatch?.[1]||raw).trim(),
    visibleAttributes,
    confidence:Math.max(0,Math.min(1,normalizeConfidence(confidenceMatch?.[1]))),
    status:normalizeStatus(statusMatch?.[1]||(confidenceMatch?"UNCERTAIN":"UNRESOLVED")),
    naturalLanguageFallback:true
  };
}
async function loadRuntime(){
  if(runtimePromise)return runtimePromise;
  runtimePromise=(async()=>{
    if(!fs.existsSync(path.join(MODEL_DIR,"config.json")))throw new Error("SmolVLM local model is not prepared: config.json is missing");
    if(!fs.existsSync(path.join(MODEL_DIR,"onnx","vision_encoder_q4.onnx")))throw new Error("SmolVLM local model is not prepared: vision_encoder_q4.onnx is missing");
    if(!fs.existsSync(path.join(MODEL_DIR,"onnx","decoder_model_merged_q4.onnx")))throw new Error("SmolVLM local model is not prepared: decoder_model_merged_q4.onnx is missing");
    if(!fs.existsSync(path.join(MODEL_DIR,"onnx","embed_tokens_q4.onnx")))throw new Error("SmolVLM local model is not prepared: embed_tokens_q4.onnx is missing");
    const processor=await AutoProcessor.from_pretrained(LOCAL_MODEL_NAME,{local_files_only:true});
    const model=await AutoModelForVision2Seq.from_pretrained(LOCAL_MODEL_NAME,{
      dtype:{embed_tokens:"q4",vision_encoder:"q4",decoder_model_merged:"q4"},
      device:"cpu",
      local_files_only:true
    });
    return{processor,model};
  })().catch(error=>{runtimePromise=null;throw error});
  return runtimePromise;
}
async function analyze(body,mime,filename){
  const started=Date.now();
  const runtimeStarted=Date.now();
  const {processor,model}=await loadRuntime();
  const modelLoadMs=Date.now()-runtimeStarted;
  const preprocessStarted=Date.now();
  const image=await RawImage.fromBlob(new Blob([body],{type:mime||"image/jpeg"}));
  const messages=[{role:"user",content:[
    {type:"image"},
    {type:"text",text:"Identify the commercial product or equipment visibly shown in this photograph. Reply with exactly one concise sentence beginning with the most specific defensible product type (for example, Commercial planetary mixer, Commercial blender, Dough sheeter, Commercial oven). Then mention only useful visible physical features. Do not give a brand, model, capacity, dimensions, specifications, or catalogue ID unless directly visible and readable. Do not output JSON, field names, schema names, or a list. If the product type cannot be identified reliably, describe only what is visibly certain."}
  ]}];
  const prompt=processor.apply_chat_template(messages,{add_generation_prompt:true});
  const inputs=await processor(prompt,[image]);
  const preprocessMs=Date.now()-preprocessStarted;
  const inputLength=Number(inputs?.input_ids?.dims?.[inputs.input_ids.dims.length-1]||0);
  const generationStarted=Date.now();
  const output=await model.generate({...inputs,max_new_tokens:64,do_sample:false});
  const generationMs=Date.now()-generationStarted;
  const generatedOutput=output?.slice?.(null,[inputLength,null]);
  const generatedTokens=Number(generatedOutput?.dims?.[generatedOutput.dims.length-1]||0);
  const decodeStarted=Date.now();
  const generated=generatedOutput
    ? processor.batch_decode(generatedOutput,{skip_special_tokens:true})[0]||""
    : "";
  const decodeMs=Date.now()-decodeStarted;
  const parsed=extractJson(generated)||parseNaturalLanguage(generated);
  const result=parsed||{
    productName:generated.trim(),
    category:"",
    description:generated.trim(),
    visibleAttributes:[],
    confidence:0,
    status:"UNRESOLVED"
  };
  const inferenceMs=Date.now()-started;
  return{
    filename:filename||"unknown",
    model:MODEL_ID,
    modelVersion:MODEL_VERSION,
    productName:String(result.productName||""),
    category:String(result.category||""),
    description:String(result.description||""),
    visibleAttributes:Array.isArray(result.visibleAttributes)?result.visibleAttributes.map(String):[],
    confidence:Math.max(0,Math.min(1,Number(result.confidence)||0)),
    status:["IDENTIFIED","UNCERTAIN","UNRESOLVED"].includes(result.status)?result.status:"UNRESOLVED",
    catalogueReference:"NONE",
    inferenceMs,
    inferenceAt:new Date().toISOString(),
    telemetry:{modelLoadMs,preprocessMs,generationMs,decodeMs,totalMs:inferenceMs,inputTokens:inputLength,generatedTokens},
    rawOutput:generated.trim()
  };
}
const server=http.createServer(async(req,res)=>{
  cors(res);
  if(req.method==="OPTIONS"){res.writeHead(204);return res.end()}
  try{
    if(req.method==="GET"&&req.url==="/health"){
      return send(res,200,{ok:true,model:MODEL_ID,modelVersion:MODEL_VERSION,modelDir:MODEL_DIR,runtimeLoaded:Boolean(runtimePromise)});
    }
    if(req.method==="POST"&&req.url==="/load"){
      await loadRuntime();
      return send(res,200,{ok:true,model:MODEL_ID,modelVersion:MODEL_VERSION});
    }
    if(req.method==="POST"&&req.url==="/analyze"){
      const body=await readBody(req);
      if(!body.length)return send(res,400,{error:"empty image body"});
      const result=await analyze(body,req.headers["x-mime-type"]||req.headers["content-type"]||"image/jpeg",req.headers["x-filename"]||"unknown");
      return send(res,200,{ok:true,result});
    }
    return send(res,404,{error:"not found"});
  }catch(error){
    return send(res,500,{ok:false,error:String(error?.message||error)});
  }
});
server.listen(PORT,HOST,()=>console.log("SmolVLM local service listening on http://"+HOST+":"+PORT));

module.exports={cleanGeneratedText,normalizeConfidence,isSchemaRepetition,normalizeStructuredResult,extractJson,parseNaturalLanguage};
