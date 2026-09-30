import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL="Xenova/mobileclip_s0";
const statusEl=document.getElementById("status");
const resultsEl=document.getElementById("results");
const fileEl=document.getElementById("files");
const labelsEl=document.getElementById("labels");
const runEl=document.getElementById("run");
const clearEl=document.getElementById("clear");

let classifier=null;

function status(message){statusEl.textContent=message;}

function progress(info){
  const name=String(info?.file||info?.name||"model file");
  const pct=Number(info?.progress);
  if(Number.isFinite(pct)){
    status("Loading MobileCLIP… "+Math.round(pct)+"%\n"+name);
  }else{
    status("Loading MobileCLIP…\n"+name);
  }
}

async function loadClassifier(){
  if(classifier)return classifier;
  if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser.");
  status("Starting MobileCLIP zero-shot classifier…\nThe first run downloads the model into the browser cache. This can take time.");
  classifier=await pipeline("zero-shot-image-classification",MODEL,{
    device:"webgpu",
    progress_callback:progress
  });
  status("MobileCLIP loaded. Ready to test a real image.");
  return classifier;
}

function render(file,rows,index,total){
  const card=document.createElement("div");
  card.className="panel result";
  const url=URL.createObjectURL(file);
  card.innerHTML='<img class="thumb" src="'+url+'" alt="">'+
    '<h3>'+escapeHtml(file.name)+'</h3>'+
    '<p class="muted">Image '+index+' of '+total+'</p>'+
    rows.map((r,i)=>'<div class="rank"><span><b>'+((i+1)+". "+escapeHtml(r.label))+'</b></span><span class="score">score '+Number(r.score).toFixed(4)+'</span></div>').join("");
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
    const classifier=await loadClassifier();
    for(let i=0;i<files.length;i++){
      status("Analyzing image "+(i+1)+"/"+files.length+" — "+files[i].name+"\nNo catalogue matching is being used.");
      const output=await classifier(files[i],labels);
      const rows=Array.isArray(output)?output.slice(0,5):[output];
      render(files[i],rows,i+1,files.length);
    }
    status("PROOF COMPLETE — "+files.length+" image(s) analyzed. No result was written to the database.");
  }catch(error){
    console.error(error);
    classifier=null;
    status("PROOF FAILED\n"+(error?.stack||error));
  }finally{runEl.disabled=false;}
};

clearEl.onclick=()=>{resultsEl.innerHTML="";status("Waiting for images.");};
