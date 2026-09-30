import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  dot,
  softmax
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL="Xenova/mobileclip_s0";
const statusEl=document.getElementById("status");
const resultsEl=document.getElementById("results");
const fileEl=document.getElementById("files");
const labelsEl=document.getElementById("labels");
const runEl=document.getElementById("run");
const clearEl=document.getElementById("clear");

let runtime=null;
let textEmbeddings=null;
let textLabels=[];

function status(message){statusEl.textContent=message;}

function normalize(values){
  const a=Array.from(values||[],Number);
  let n=0; for(const x of a)n+=x*x; n=Math.sqrt(n);
  return n?a.map(x=>x/n):a;
}

async function loadRuntime(){
  if(runtime)return runtime;
  if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser.");
  status("Loading MobileCLIP tokenizer + text encoder + vision encoder locally…");
  const tokenizer=await AutoTokenizer.from_pretrained(MODEL);
  const processor=await AutoProcessor.from_pretrained(MODEL);
  const textModel=await CLIPTextModelWithProjection.from_pretrained(MODEL,{device:"webgpu",dtype:"fp16"});
  const visionModel=await CLIPVisionModelWithProjection.from_pretrained(MODEL,{device:"webgpu",dtype:"fp16"});
  runtime={tokenizer,processor,textModel,visionModel};
  status("MobileCLIP loaded. Building text concept embeddings…");
  return runtime;
}

async function buildTextEmbeddings(labels){
  if(textEmbeddings && labels.join("\n")===textLabels.join("\n"))return textEmbeddings;
  const r=await loadRuntime();
  const prompts=labels.map(x=>"a photo of "+x);
  const inputs=r.tokenizer(prompts,{padding:"max_length",truncation:true});
  const out=await r.textModel(inputs);
  const rows=out.text_embeds.tolist();
  textLabels=labels.slice();
  textEmbeddings=rows.map(normalize);
  return textEmbeddings;
}

async function imageEmbedding(file){
  const r=await loadRuntime();
  const image=await RawImage.fromBlob(file);
  const inputs=await r.processor(image);
  const out=await r.visionModel(inputs);
  const row=out.image_embeds.normalize().tolist()[0];
  return normalize(row);
}

function rank(imageVector,textVectors,labels){
  const logits=textVectors.map(v=>100*dot(imageVector,v));
  const probabilities=softmax(logits);
  return labels.map((label,i)=>({label,score:logits[i],probability:probabilities[i]}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
}

function render(file,rows,index,total){
  const card=document.createElement("div");
  card.className="panel result";
  const url=URL.createObjectURL(file);
  card.innerHTML='<img class="thumb" src="'+url+'" alt="">'+
    '<h3>'+escapeHtml(file.name)+'</h3>'+
    '<p class="muted">Image '+index+' of '+total+'</p>'+
    rows.map((r,i)=>'<div class="rank"><span><b>'+((i+1)+". "+escapeHtml(r.label))+'</b></span><span class="score">similarity '+r.score.toFixed(3)+' · relative '+(r.probability*100).toFixed(1)+'%</span></div>').join("");
  resultsEl.appendChild(card);
}

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

runEl.onclick=async()=>{
  const files=[...fileEl.files];
  const labels=labelsEl.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!files.length){status("Select at least one real product photo first.");return;}
  if(!labels.length){status("Add at least one product-type concept.");return;}
  runEl.disabled=true;
  resultsEl.innerHTML="";
  try{
    const r=await loadRuntime();
    await buildTextEmbeddings(labels);
    for(let i=0;i<files.length;i++){
      status("Analyzing image "+(i+1)+"/"+files.length+" — "+files[i].name+"\nOne image at a time; no catalogue matching is being used.");
      const vector=await imageEmbedding(files[i]);
      const rows=rank(vector,textEmbeddings,textLabels);
      render(files[i],rows,i+1,files.length);
    }
    status("PROOF COMPLETE — "+files.length+" image(s) analyzed. Inspect the TOP 5 suggestions above. No result was written to the database.");
  }catch(error){
    console.error(error);
    status("PROOF FAILED\n"+(error?.stack||error));
  }finally{runEl.disabled=false;}
};

clearEl.onclick=()=>{resultsEl.innerHTML="";status("Waiting for images.");};
