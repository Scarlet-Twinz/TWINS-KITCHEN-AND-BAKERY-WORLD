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
function extractJson(text){
  const raw=String(text||"").trim();
  try{return JSON.parse(raw)}catch{}
  const match=raw.match(/\{[\s\S]*\}/);
  if(match)try{return JSON.parse(match[0])}catch{}
  return null;
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
  const {processor,model}=await loadRuntime();
  const image=await RawImage.fromBlob(new Blob([body],{type:mime||"image/jpeg"}));
  const messages=[{role:"user",content:[
    {type:"image"},
    {type:"text",text:"Analyze this product photograph. Return ONLY valid JSON with exactly these fields: productName, category, description, visibleAttributes, confidence, status. Identify the product from the image alone; do not assume it is in any catalogue. productName must be the most specific defensible name. category should be a concise equipment/category name. description must be one concise sentence. visibleAttributes must be an array of short strings containing only visibly supported attributes. confidence must be a number from 0 to 1 representing your confidence in the identification. status must be one of IDENTIFIED, UNCERTAIN, UNRESOLVED. Never invent an exact model, capacity, brand, or specification that is not visibly supported."}
  ]}];
  const prompt=processor.apply_chat_template(messages,{add_generation_prompt:true});
  const inputs=await processor(prompt,[image]);
  const inputLength=Number(inputs?.input_ids?.dims?.[inputs.input_ids.dims.length-1]||0);
  const output=await model.generate({...inputs,max_new_tokens:160,do_sample:false});
  const generatedOutput=output?.slice?.(null,[inputLength,null]);
  const generated=generatedOutput
    ? processor.batch_decode(generatedOutput,{skip_special_tokens:true})[0]||""
    : "";
  const parsed=extractJson(generated);
  const result=parsed||{
    productName:"",
    category:"",
    description:generated.trim(),
    visibleAttributes:[],
    confidence:0,
    status:"UNRESOLVED"
  };
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
    inferenceMs:Date.now()-started,
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
