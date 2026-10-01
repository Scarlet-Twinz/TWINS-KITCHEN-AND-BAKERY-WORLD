const CATALOGUE_URL="../../data.js";
const ROOT_URL=new URL("../../",location.href);
const matcher=window.TwinsMediaVisualMatcher;
const filesEl=document.getElementById("files");
const runEl=document.getElementById("run");
const statusEl=document.getElementById("status");
const catalogueEl=document.getElementById("catalogue");
const resultsEl=document.getElementById("results");

let cataloguePromise=null;
let referenceIndexPromise=null;

function status(message){statusEl.textContent=message;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function decodeJsString(raw){
  try{return JSON.parse('"'+raw.replace(/\\/g,"\\\\").replace(/"/g,'\\\"')+'"');}
  catch{return raw.replace(/\\\"/g,'"').replace(/\\\\/g,"\\");}
}

async function loadCatalogue(){
  if(cataloguePromise)return cataloguePromise;
  cataloguePromise=(async()=>{
    status("Reading the current catalogue source…");
    const response=await fetch(CATALOGUE_URL,{cache:"no-store"});
    if(!response.ok)throw new Error("Catalogue HTTP "+response.status);
    const text=await response.text();

    const products=[];
    const productRe=/\{id:(\d+),n:"((?:\\\\.|[^"\\\\])*)",c:"((?:\\\\.|[^"\\\\])*)",p:([^,]+),i:"((?:\\\\.|[^"\\\\])*)"/g;
    let match;
    while((match=productRe.exec(text))){
      products.push({
        id:Number(match[1]),
        name:decodeJsString(match[2]).trim(),
        category:decodeJsString(match[3]).trim(),
        mediaPath:decodeJsString(match[5]).trim()
      });
    }

    const overrideStart=text.indexOf("const CATALOG_MEDIA_OVERRIDES_BY_ID={");
    const overrideEnd=overrideStart>=0?text.indexOf("};",overrideStart):-1;
    const overrides=new Map();
    if(overrideStart>=0&&overrideEnd>overrideStart){
      const block=text.slice(overrideStart,overrideEnd);
      const overrideRe=/"(\d+)":"((?:\\\\.|[^"\\\\])*)"/g;
      while((match=overrideRe.exec(block)))overrides.set(Number(match[1]),decodeJsString(match[2]).trim());
    }

    const byId=new Map();
    for(const product of products){
      if(!byId.has(product.id))byId.set(product.id,product);
    }
    for(const [id,path] of overrides){
      const product=byId.get(id);
      if(product&&!product.mediaPath)product.mediaPath=path;
    }

    const usable=[...byId.values()].filter(p=>p.mediaPath.startsWith("assets/"));
    const uniqueRefs=[];
    const seen=new Set();
    for(const product of usable){
      const url=new URL(product.mediaPath,ROOT_URL).href;
      const key=product.id+"|"+url;
      if(seen.has(key))continue;
      seen.add(key);
      uniqueRefs.push({...product,referenceUrl:url});
    }

    if(!uniqueRefs.length)throw new Error("No local catalogue reference photos were discovered.");
    catalogueEl.textContent="Dynamic catalogue: "+byId.size+" products discovered · "+uniqueRefs.length+" local product references available.";
    return uniqueRefs;
  })().catch(error=>{cataloguePromise=null;throw error;});
  return cataloguePromise;
}

async function buildIndex(){
  if(referenceIndexPromise)return referenceIndexPromise;
  referenceIndexPromise=(async()=>{
    const references=await loadCatalogue();
    status("Loading MobileCLIP…");
    await matcher.loadRuntime(info=>status(info.message||"Loading MobileCLIP…"));
    status("Building visual reference index from "+references.length+" dynamically discovered local product photos…\nThis is the only potentially long step.");
    let completed=0;
    const products=references.map(item=>({
      id:item.id,n:item.name,category:item.category,
      reference:item.referenceUrl
    }));
    const result=await matcher.buildReferenceIndex(
      products,
      product=>({url:product.reference,referenceAssetId:product.id}),
      progress=>{completed=progress.completed;status("Building visual reference index… "+completed+"/"+progress.total+" products · "+progress.usable+" usable references.");},
      info=>{if(info?.message)status(info.message);},
      {indexVersion:2,embeddingVersion:1}
    );
    if(!result.index.length)throw new Error("No usable reference embeddings were produced.");
    status("REFERENCE INDEX READY — "+result.index.length+" reference embeddings across "+new Set(result.index.map(x=>x.productId)).size+" products.");
    return result.index;
  })().catch(error=>{referenceIndexPromise=null;throw error;});
  return referenceIndexPromise;
}

async function analyze(file,index){
  const started=performance.now();
  const source=await matcher.embeddingForBlob(file,"proof:"+file.name+":"+file.size+":"+file.lastModified);
  const decision=matcher.evaluateVisualMatch(source.embedding,index,{
    highThreshold:0.78,mediumThreshold:0.62,highMargin:0.07,mediumMargin:0.025,maxSuggestions:5
  });
  return {...decision,seconds:(performance.now()-started)/1000};
}

function render(file,decision){
  const card=document.createElement("div");
  card.className="panel";
  const url=URL.createObjectURL(file);
  const candidates=(decision.suggestions.length?decision.suggestions:decision.topCandidate?[decision.topCandidate]:[]).slice(0,5);
  card.innerHTML="<img class='thumb' src='"+url+"' alt=''>"+
    "<h3>"+escapeHtml(file.name)+"</h3>"+
    "<p><strong>Decision:</strong> "+escapeHtml(decision.status)+" · top score "+decision.topScore.toFixed(4)+" · margin "+decision.margin.toFixed(4)+"</p>"+
    "<p class='muted'>"+escapeHtml(decision.reason)+" · "+decision.evidenceCount+" reference images contributed to the index.</p>"+
    candidates.map((item,i)=>"<div class='rank'><span><b>"+(i+1)+". "+escapeHtml(item.name)+"</b><br><small>"+escapeHtml(item.category||"")+" · Product ID "+escapeHtml(item.productId)+"</small></span><span class='score'>"+Number(item.score).toFixed(4)+"</span></div>").join("")+
    "<p class='muted'>Inference time: "+decision.seconds.toFixed(1)+"s. No application DB write.</p>";
  resultsEl.appendChild(card);
}

filesEl.addEventListener("change",()=>{runEl.disabled=!filesEl.files.length;});
runEl.addEventListener("click",async()=>{
  const files=[...filesEl.files];
  runEl.disabled=true;resultsEl.innerHTML="";
  try{
    const index=await buildIndex();
    for(let i=0;i<files.length;i++){
      status("Analyzing "+(i+1)+"/"+files.length+": "+files[i].name);
      const decision=await analyze(files[i],index);
      render(files[i],decision);
    }
    status("PROOF COMPLETE — visual candidates were generated from dynamically discovered local catalogue references.");
  }catch(error){
    console.error(error);
    status("PROOF FAILED\n"+(error?.stack||error));
  }finally{runEl.disabled=false;}
});
status("Select one real Twins product photo.");
