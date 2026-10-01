import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  dot,
  softmax,
  env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL="Xenova/mobileclip_s0";
const REVISION="main";
const statusEl=document.getElementById("status");
const resultsEl=document.getElementById("results");
const fileEl=document.getElementById("files");
const labelsEl=document.getElementById("labels");
const runEl=document.getElementById("run");
const clearEl=document.getElementById("clear");

let runtimePromise=null;
let textCache={key:"",labels:[],embeddings:[]};

env.allowRemoteModels=true;
env.allowLocalModels=true;
env.useBrowserCache=true;
env.useWasmCache=true;

function status(message){statusEl.textContent=message;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function normalizeRows(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>Array.from(row||[],Number));
}
function progress(info){
  const file=String(info?.file||info?.name||"model file");
  const pct=Number(info?.progress);
  if(Number.isFinite(pct)) status("Loading MobileCLIP model files… "+Math.round(pct)+"%\n"+file);
  else if(info?.status) status("Loading MobileCLIP… "+String(info.status)+"\n"+file);
}
async function probeWebGPU(){
  if(!navigator.gpu)return false;
  for(let i=0;i<3;i++){
    const adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"}).catch(()=>null);
    if(adapter){
      const device=await adapter.requestDevice().catch(()=>null);
      if(device){device.destroy?.();return true;}
    }
    await new Promise(r=>setTimeout(r,100));
  }
  return false;
}
async function loadRuntime(){
  if(runtimePromise)return runtimePromise;
  runtimePromise=(async()=>{
    const hasWebGPU=await probeWebGPU();
    const device=hasWebGPU?"webgpu":"wasm";
    // The current MobileCLIP repository declares fp32 for the vision module.
    // Use fp32 for both towers so WebGPU never requests unsupported fp16 on Intel HD 520.
    const dtype="fp32";
    status("Loading MobileCLIP tokenizer + text encoder + vision encoder…\n"+(hasWebGPU?"WebGPU":"CPU/WASM fallback"));
    const common={revision:REVISION};
    const tokenizer=await AutoTokenizer.from_pretrained(MODEL,common);
    const processor=await AutoProcessor.from_pretrained(MODEL,common);
    const textModel=await CLIPTextModelWithProjection.from_pretrained(MODEL,{
      ...common,device,dtype,progress_callback:progress
    });
    const visionModel=await CLIPVisionModelWithProjection.from_pretrained(MODEL,{
      ...common,device,dtype,progress_callback:progress
    });
    status("MobileCLIP loaded. Ready.\nRuntime: "+(hasWebGPU?"WebGPU":"CPU/WASM"));
    return{tokenizer,processor,textModel,visionModel,device};
  })().catch(error=>{runtimePromise=null;throw error;});
  return runtimePromise;
}
async function textEmbeddings(runtime,labels){
  const key=labels.join("\n");
  if(textCache.key===key&&textCache.embeddings.length)return textCache.embeddings;
  status("Encoding "+labels.length+" product-type concepts once…");
  const prompts=labels.map(label=>"a photo of "+label);
  const inputs=runtime.tokenizer(prompts,{padding:"max_length",truncation:true});
  const output=await runtime.textModel(inputs);
  const rows=normalizeRows(output?.text_embeds?.normalize?.().tolist?.());
  if(rows.length!==labels.length)throw new Error("MobileCLIP text encoder returned an unexpected embedding count.");
  textCache={key,labels:[...labels],embeddings:rows};
  return rows;
}
async function imageEmbedding(runtime,file){
  const image=await RawImage.fromBlob(file);
  const inputs=await runtime.processor(image);
  const output=await runtime.visionModel(inputs);
  const rows=normalizeRows(output?.image_embeds?.normalize?.().tolist?.());
  if(!rows[0]?.length)throw new Error("MobileCLIP vision encoder returned no image embedding.");
  return rows[0];
}
function rank(imageEmbedding,textEmbeddings,labels){
  const logits=textEmbeddings.map(x=>100*dot(imageEmbedding,x));
  const probabilities=softmax(logits);
  return labels.map((label,i)=>({label,score:Number(probabilities[i])||0,similarity:dot(imageEmbedding,textEmbeddings[i])}))
    .sort((a,b)=>b.score-a.score).slice(0,5);
}
function render(file,rows,index,total){
  const card=document.createElement("div");
  card.className="panel result";
  const url=URL.createObjectURL(file);
  card.innerHTML='<img class="thumb" src="'+url+'" alt="">'+
    '<h3>'+escapeHtml(file.name)+'</h3>'+
    '<p class="muted">Image '+index+' of '+total+'</p>'+
    rows.map((r,i)=>'<div class="rank"><span><b>'+((i+1)+". "+escapeHtml(r.label))+'</b></span><span class="score">'+(r.score*100).toFixed(1)+'%</span></div>').join("");
  resultsEl.appendChild(card);
}
runEl.onclick=async()=>{
  const files=[...fileEl.files];
  const labels=labelsEl.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!files.length){status("Select at least one real product photo first.");return;}
  if(labels.length<2){status("Add at least two product-type concepts so MobileCLIP has alternatives to compare.");return;}
  runEl.disabled=true;resultsEl.innerHTML="";
  try{
    const runtime=await loadRuntime();
    const concepts=await textEmbeddings(runtime,labels);
    for(let i=0;i<files.length;i++){
      status("Analyzing image "+(i+1)+"/"+files.length+" — "+files[i].name+"\nThis compares the photo with product-type text concepts, not catalogue photos.");
      const image=await imageEmbedding(runtime,files[i]);
      render(files[i],rank(image,concepts,labels),i+1,files.length);
      await new Promise(r=>setTimeout(r,0));
    }
    status("PROOF COMPLETE — "+files.length+" image(s) analyzed.\nThe model and text concepts stay cached in this browser; no result was written to the database.");
  }catch(error){
    console.error(error);
    const message=String(error?.message||error);
    status("PROOF FAILED\n"+message+"\n\nCopy this exact message back to ChatGPT if it fails.");
  }finally{runEl.disabled=false;}
};
clearEl.onclick=()=>{resultsEl.innerHTML="";status("Waiting for images.");};
