import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  dot,
  env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL="Xenova/mobileclip_s0";
const REVISION="main";
const CATALOGUE_URL="../../data.js";
const TEXT_BATCH_SIZE=48;

const statusEl=document.getElementById("status");
const resultsEl=document.getElementById("results");
const fileEl=document.getElementById("files");
const runEl=document.getElementById("run");
const clearEl=document.getElementById("clear");
const catalogueEl=document.getElementById("catalogue");

let runtimePromise=null;
let cataloguePromise=null;
let textCache={key:"",candidates:[],embeddings:[]};

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
    status("Loading MobileCLIP tokenizer + text encoder + vision encoder…\n"+(hasWebGPU?"WebGPU":"CPU/WASM fallback"));
    const common={revision:REVISION};
    const tokenizer=await AutoTokenizer.from_pretrained(MODEL,common);
    const processor=await AutoProcessor.from_pretrained(MODEL,common);
    const textModel=await CLIPTextModelWithProjection.from_pretrained(MODEL,{
      ...common,device,dtype:"int8",progress_callback:progress
    });
    const visionModel=await CLIPVisionModelWithProjection.from_pretrained(MODEL,{
      ...common,device,dtype:"fp32",progress_callback:progress
    });
    status("MobileCLIP loaded. Ready.\nRuntime: "+(hasWebGPU?"WebGPU":"CPU/WASM")+"\nText: int8 · Vision: fp32");
    return{tokenizer,processor,textModel,visionModel,device};
  })().catch(error=>{runtimePromise=null;throw error;});
  return runtimePromise;
}

function decodeJsString(raw){
  try{return JSON.parse('"'+raw.replace(/\\/g,"\\\\").replace(/"/g,'\\\"')+'"');}
  catch{return raw.replace(/\\\"/g,'"').replace(/\\\\/g,"\\");}
}

async function loadCatalogue(){
  if(cataloguePromise)return cataloguePromise;
  cataloguePromise=(async()=>{
    status("Reading the live catalogue…\nNo product list is hardcoded in this proof.");
    const source=await fetch(CATALOGUE_URL,{cache:"no-store"});
    if(!source.ok)throw new Error("Could not load catalogue source: HTTP "+source.status);
    const text=await source.text();
    const re=/\\{id:(\\d+),n:"((?:\\\\.|[^"\\\\])*)",c:"((?:\\\\.|[^"\\\\])*)"/g;
    const candidates=[];
    let match;
    while((match=re.exec(text))){
      const name=decodeJsString(match[2]).trim();
      const category=decodeJsString(match[3]).trim();
      if(name)candidates.push({id:Number(match[1]),name,category});
    }
    const unique=[];
    const seen=new Set();
    for(const item of candidates){
      const key=item.name.toLowerCase()+"|"+item.category.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      unique.push(item);
    }
    if(unique.length<2)throw new Error("Catalogue parser found fewer than two products.");
    catalogueEl.textContent="Live catalogue loaded: "+unique.length+" unique product-name/category candidates. Generated from data.js at runtime.";
    return unique;
  })().catch(error=>{cataloguePromise=null;throw error;});
  return cataloguePromise;
}

async function textEmbeddings(runtime,candidates){
  const key=candidates.map(x=>x.id+"|"+x.name+"|"+x.category).join("\n");
  if(textCache.key===key&&textCache.embeddings.length)return textCache.embeddings;

  const all=[];
  for(let start=0;start<candidates.length;start+=TEXT_BATCH_SIZE){
    const batch=candidates.slice(start,start+TEXT_BATCH_SIZE);
    status("Encoding live catalogue text "+(start+1)+"–"+Math.min(start+TEXT_BATCH_SIZE,candidates.length)+" of "+candidates.length+"…");
    const prompts=batch.map(x=>"a product photo of "+x.name+" in the "+x.category+" category");
    const inputs=runtime.tokenizer(prompts,{padding:"max_length",truncation:true});
    const output=await runtime.textModel(inputs);
    const rows=normalizeRows(output?.text_embeds?.normalize?.().tolist?.());
    if(rows.length!==batch.length)throw new Error("MobileCLIP text encoder returned an unexpected embedding count.");
    all.push(...rows);
    await new Promise(r=>setTimeout(r,0));
  }
  textCache={key,candidates:[...candidates],embeddings:all};
  return all;
}

async function imageEmbedding(runtime,file){
  const image=await RawImage.fromBlob(file);
  const inputs=await runtime.processor(image);
  const output=await runtime.visionModel(inputs);
  const rows=normalizeRows(output?.image_embeds?.normalize?.().tolist?.());
  if(!rows[0]?.length)throw new Error("MobileCLIP vision encoder returned no image embedding.");
  return rows[0];
}

function rank(imageEmbedding,textEmbeddings,candidates){
  return candidates.map((candidate,i)=>({
    ...candidate,
    similarity:dot(imageEmbedding,textEmbeddings[i])
  })).sort((a,b)=>b.similarity-a.similarity).slice(0,8);
}

function render(file,rows,index,total){
  const card=document.createElement("div");
  card.className="panel result";
  const url=URL.createObjectURL(file);
  card.innerHTML='<img class="thumb" src="'+url+'" alt="">'+
    '<h3>'+escapeHtml(file.name)+'</h3>'+
    '<p class="muted">Image '+index+' of '+total+'</p>'+
    rows.map((r,i)=>'<div class="rank"><span><b>'+((i+1)+". "+escapeHtml(r.name))+'</b><small class="muted"> · '+escapeHtml(r.category)+' · Product ID '+r.id+'</small></span><span class="score">'+r.similarity.toFixed(4)+'</span></div>').join("");
  resultsEl.appendChild(card);
}

runEl.onclick=async()=>{
  const files=[...fileEl.files];
  if(!files.length){status("Select at least one real product photo first.");return;}
  runEl.disabled=true;resultsEl.innerHTML="";
  try{
    const catalogue=await loadCatalogue();
    const runtime=await loadRuntime();
    const concepts=await textEmbeddings(runtime,catalogue);
    for(let i=0;i<files.length;i++){
      status("Analyzing image "+(i+1)+"/"+files.length+" — "+files[i].name+"\nComparing it against "+catalogue.length+" actual catalogue products.");
      const image=await imageEmbedding(runtime,files[i]);
      render(files[i],rank(image,concepts,catalogue),i+1,files.length);
      await new Promise(r=>setTimeout(r,0));
    }
    status("PROOF COMPLETE — "+files.length+" image(s) analyzed.\nCandidates came directly from the current catalogue; no hand-authored product-type list or Product-ID mapping was used.");
  }catch(error){
    console.error(error);
    status("PROOF FAILED\n"+String(error?.message||error)+"\n\nCopy this exact message back to ChatGPT if it fails.");
  }finally{runEl.disabled=false;}
};

clearEl.onclick=()=>{resultsEl.innerHTML="";status("Waiting for images.");};
