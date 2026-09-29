// Images and ZIP files stay outside Git; only metadata, manifests, and code are tracked.
const API=(window.TWINS_API_BASE||((window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1")?"http://"+window.location.hostname+":8000":"http://localhost:8000")).replace(/\/$/,"");const $=id=>document.getElementById(id);let selected=[];let assets=[];let visualRun=0;let openWorldRun=0;const visualSignatureCache=new Map();const visualMatcher=window.TwinsMediaVisualMatcher||null;const openWorld=window.TwinsSmolVlmLocal||null;
function visualReferenceUrls(product){
  if(!product)return [];
  const overrides=typeof CATALOG_MEDIA_OVERRIDES_BY_ID!=="undefined"?CATALOG_MEDIA_OVERRIDES_BY_ID:{};
  const override=overrides[String(product.id)]||overrides[product.id]||"";
  const values=[override,...(product.media&&Array.isArray(product.media.images)?product.media.images:[]),product.i||""];
  return [...new Set(values.map(normalizeCatalogueMediaPath).filter(src=>/^\/assets\/media\//.test(src)))];
}
function visualReferenceUrl(product){
  return visualReferenceUrls(product)[0]||"";
}
async function loadVisualSource(asset){
  if(!visualMatcher||!asset)return null;
  try{
    const response=await fetch(mediaContentUrl(asset.id),{credentials:"include",cache:"no-store"});
    if(!response.ok)return null;
    return await response.blob();
  }catch{return null;}
}
let visualIndexPromise=null;
let visualIndexProductsKey="";
let visualIndexStatus={message:"Loading model…",state:"loading"};
function ensureVisualStatus(){
  let node=document.getElementById("visualAiStatus");
  if(!node){
    node=document.createElement("div");
    node.id="visualAiStatus";
    node.className="operation-feedback pending";
    const toolbar=document.querySelector(".toolbar");
    if(toolbar)toolbar.prepend(node);
  }
  node.textContent="AI visual matcher: "+visualIndexStatus.message;
  node.className="operation-feedback "+(visualIndexStatus.state==="ready"?"success":visualIndexStatus.state==="unavailable"?"error":"pending");
}
function updateVisualStatus(info){
  visualIndexStatus={message:String(info?.message||"Unavailable — visual matching disabled"),state:info?.state||"loading"};
  ensureVisualStatus();
}
async function getVisualReferenceIndex(products){
  if(!visualMatcher)return{index:[],usable:0,unavailable:0,totalProducts:0};
  const key=(Array.isArray(products)?products:[]).map(p=>String(p?.id||"")).join(",");
  if(visualIndexPromise&&visualIndexProductsKey===key)return visualIndexPromise;
  visualIndexProductsKey=key;
  visualIndexPromise=visualMatcher.buildReferenceIndex(products,visualReferenceUrls,progress=>{
    updateVisualStatus({message:"Building visual catalogue index… "+progress.completed+" / "+progress.total,state:"loading"});
  },updateVisualStatus).then(result=>{
    if(!result.index.length&&result.totalProducts)updateVisualStatus({message:"Unavailable — no catalogue reference images could be indexed",state:"unavailable"});
    else if(result.index.length)updateVisualStatus({message:"Ready — "+result.index.length+" reference image embeddings indexed",state:"ready"});
    return result;
  }).catch(error=>{
    visualIndexPromise=null;
    updateVisualStatus({message:"Unavailable — visual matching disabled",state:"unavailable"});
    throw error;
  });
  return visualIndexPromise;
}
async function identifyAssetVisually(asset){
  if(!visualMatcher||!asset||asset.productId)return null;
  const products=typeof P!=="undefined"&&Array.isArray(P)?P:[];
  if(!products.length)return{status:"UNRESOLVED",suggestions:[],reason:"canonical catalogue is unavailable",engine:"ONNX vision"};
  const sourceBlob=await loadVisualSource(asset);
  if(!sourceBlob)return{status:"UNRESOLVED",suggestions:[],reason:"uploaded image could not be decoded from the Media API",engine:"ONNX vision"};
  const identity=asset.sha256||asset.id||asset.filename;
  const sourceResult=await visualMatcher.embeddingForBlob(sourceBlob,identity,updateVisualStatus);
  const referenceResult=await getVisualReferenceIndex(products);
  const localResult=visualMatcher.evaluateVisualMatch(sourceResult.embedding,referenceResult.index);
  return{...localResult,engine:"ONNX vision / Transformers.js",referenceCount:referenceResult.index.length};
}
let openWorldStatus={message:"Local SmolVLM service not checked",state:"loading"};
function ensureOpenWorldStatus(){
  let node=document.getElementById("smolVlmStatus");
  if(!node){
    node=document.createElement("div");
    node.id="smolVlmStatus";
    node.className="operation-feedback pending";
    const toolbar=document.querySelector(".toolbar");
    if(toolbar)toolbar.prepend(node);
  }
  node.textContent="Open-world AI: "+openWorldStatus.message;
  node.className="operation-feedback "+(openWorldStatus.state==="ready"?"success":openWorldStatus.state==="unavailable"?"error":"pending");
}
function updateOpenWorldStatus(info){
  openWorldStatus={message:String(info?.message||"Unavailable — open-world understanding disabled"),state:info?.state||"loading"};
  ensureOpenWorldStatus();
}
async function identifyAssetOpenWorld(asset){
  if(!openWorld||!asset||asset.productId)return null;
  const sourceBlob=await loadVisualSource(asset);
  if(!sourceBlob)return{available:false,error:"uploaded image could not be decoded from the Media API"};
  return openWorld.analyze(sourceBlob,asset.filename);
}
async function enrichOpenWorldSuggestions(){
  if(!openWorld)return false;
  const run=++openWorldRun;
  const health=await openWorld.available();
  if(!health.available){
    updateOpenWorldStatus({message:"Unavailable — start the local SmolVLM service on port 8787",state:"unavailable"});
    return false;
  }
  updateOpenWorldStatus({message:"Ready — SmolVLM-500M-Instruct local ONNX service",state:"ready"});
  const targets=assets.filter(a=>!a.productId&&(!a.suggestionStatus||a.suggestionStatus==="UNRESOLVED"));
  let cursor=0;
  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=targets.length||run!==openWorldRun)return;
      const asset=targets[index];
      try{
        const result=await identifyAssetOpenWorld(asset);
        if(run!==openWorldRun)return;
        if(result?.available){
          asset.openWorldResult={
            model:result.model||openWorld.MODEL_ID,
            modelVersion:result.modelVersion||openWorld.MODEL_VERSION,
            productName:result.productName||"",
            category:result.category||"",
            description:result.description||"",
            visibleAttributes:Array.isArray(result.visibleAttributes)?result.visibleAttributes:[],
            confidence:Number(result.confidence)||0,
            status:result.status||"UNRESOLVED",
            catalogueReference:result.catalogueReference||"NONE",
            inferenceMs:Number(result.inferenceMs)||0
          };
        }else{
          asset.openWorldResult={status:"UNRESOLVED",catalogueReference:"NONE",error:result?.error||"Local service unavailable"};
        }
        render();
      }catch(error){
        asset.openWorldResult={status:"UNRESOLVED",catalogueReference:"NONE",error:String(error?.message||error)};
        render();
      }
    }
  };
  await Promise.all([worker(),worker()]);
  return true;
}

async function enrichVisualSuggestions(){
  if(!visualMatcher)return false;
  const run=++visualRun;
  const targets=assets.filter(a=>!a.productId);
  let cursor=0;
  const progress=loadBatchProgress()||{clientBatchId:"current",total:targets.length,completed:0,summary:{}};
  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=targets.length)return;
      if(run!==visualRun)return;
      const asset=targets[index];
      try{
        const result=await identifyAssetVisually(asset);
        asset.suggestions=result&&Array.isArray(result.suggestions)?result.suggestions:[];
        asset.suggestionSource=result?.engine||"local visual similarity";
        asset.suggestionStatus=result?.status||"UNRESOLVED";
        asset.suggestionReason=result?.reason||"visual evidence unavailable";
        asset.topScore=result?.topScore||0;
        asset.secondScore=result?.secondScore||0;
        asset.margin=result?.margin||0;
        asset.referenceCount=result?.referenceCount||0;
        asset.supportingReferences=result?.supportingReferences||[];
        if(run===visualRun)render();
        progress.completed=(Number(progress.completed)||0)+1;
        progress.summary=progress.summary||{};
        if(asset.suggestionStatus==="HIGH")progress.summary.matched=(Number(progress.summary.matched)||0)+1;
        else if(asset.suggestionStatus==="MEDIUM")progress.summary.review=(Number(progress.summary.review)||0)+1;
        else progress.summary.unresolved=(Number(progress.summary.unresolved)||0)+1;
        saveBatchProgress(progress);renderBatchProgress(progress);
      }catch(e){
        asset.suggestions=[];
        asset.suggestionSource="local visual similarity";
        asset.suggestionStatus="UNRESOLVED";
        asset.suggestionReason="visual matching could not inspect the uploaded image";
        progress.completed=(Number(progress.completed)||0)+1;
        progress.summary=progress.summary||{};
        progress.summary.failed=(Number(progress.summary.failed)||0)+1;
        saveBatchProgress(progress);renderBatchProgress(progress);
        if(run===visualRun)render();
      }
    }
  };
  await Promise.all([worker(),worker()]);
  if(run===visualRun){progress.status="PROCESSED";progress.finishedAt=new Date().toISOString();saveBatchProgress(progress);renderBatchProgress(progress);}
  return true;
}
async function api(path,opts={}){let r;try{r=await fetch(API+path,{credentials:"include",...opts})}catch(error){const e=new Error("Cannot reach Media API at "+API+". Check that the backend is running and that this page origin is allowed by CORS.");e.cause=error;throw e}const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok){let message=d.detail||d.message||raw||("Request failed ("+r.status+")");if(Array.isArray(message))message=message.map(x=>x.msg||JSON.stringify(x)).join("; ");const e=new Error(message);e.status=r.status;throw e}return d}
function normalizeCatalogueMediaPath(src){
  if(!src)return "";
  let value=String(src).trim().split(String.fromCharCode(92)).join("/");
  if(value.startsWith("http://")||value.startsWith("https://"))return value;
  const marker="assets/media/";
  const markerIndex=value.indexOf(marker);
  if(markerIndex>=0)return "/"+value.slice(markerIndex);
  return value.startsWith("/")?value:"/"+value;
}
function selectedProductById(){
  const value=$("productId").value.trim();
  if(!value)return null;
  if(typeof P==="undefined"||!Array.isArray(P))return null;
  return P.find(p=>String(p.id)===value)||null;
}
function selectedProductMedia(product){
  if(!product)return "";
  const overrides=typeof CATALOG_MEDIA_OVERRIDES_BY_ID!=="undefined"?CATALOG_MEDIA_OVERRIDES_BY_ID:{};
  const override=overrides[String(product.id)]||overrides[product.id]||"";
  const image=override||(product.media&&Array.isArray(product.media.images)&&product.media.images[0])||product.i||"";
  return normalizeCatalogueMediaPath(image);
}
function renderProductPreview(){
  const box=$("productPreview");
  const value=$("productId").value.trim();
  if(!value){box.classList.add("hidden");box.innerHTML="";return}
  const product=selectedProductById();
  if(!product){
    box.classList.remove("hidden");
    box.innerHTML='<div class="product-preview-copy"><strong>Product not found</strong><span>Enter a valid canonical catalogue Product ID.</span></div>';
    return;
  }
  const src=selectedProductMedia(product);
  box.classList.remove("hidden");
  if(!src){
    box.innerHTML='<div class="product-preview-copy"><strong>'+escapeHtml(product.n)+'</strong><span>No existing catalogue image is assigned to this product.</span></div>';
    return;
  }
  console.debug("Media Center catalogue preview URL:",src);
  box.innerHTML='<div class="product-preview-image"><img src="'+escapeHtml(src)+'" alt="'+escapeHtml(product.n)+'"></div><div class="product-preview-copy"><strong>'+escapeHtml(product.n)+'</strong><span>Catalogue Product ID: '+escapeHtml(product.id)+'</span></div>';
  const imageBox=box.querySelector(".product-preview-image");
  const image=box.querySelector("img");
  image.addEventListener("error",()=>{
    imageBox.classList.add("image-error");
    imageBox.innerHTML='<div class="product-preview-error"><strong>Image failed to load</strong><code>'+escapeHtml(src)+'</code></div>';
  });
}
function metadata(){return JSON.stringify({productId:$("productId").value.trim()||null,sourceType:$("sourceType").value,rightsStatus:$("rightsStatus").value,provenance:$("provenance").value.trim(),sourceUrl:$("sourceUrl").value.trim(),license:$("license").value.trim(),attribution:$("attribution").value.trim(),role:$("role").value})}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function renderSummary(d){$("summary").innerHTML='<div class="summary"><b>Batch '+d.batchId+'</b> · '+d.uploaded.length+' queued · '+d.duplicates.length+' exact duplicates · '+d.supportingDocuments.length+' supporting documents</div>'}
function productLabel(productId){
  if(!productId)return "Unassigned";
  const product=typeof P!=="undefined"&&Array.isArray(P)?P.find(p=>String(p.id)===String(productId)):null;
  return product?String(productId)+" · "+product.n:String(productId);
}
function setActionStatus(id,message,type){
  const node=document.querySelector('[data-status-id="'+id+'"]');
  if(!node)return;
  node.className="action-status "+(type||"");
  node.textContent=message;
}
function mediaContentUrl(id){return API+"/api/admin/media/"+encodeURIComponent(id)+"/file"}
function setQueueFeedback(message,type){
  const node=$("queueFeedback");
  node.className="operation-feedback "+(type||"");
  node.textContent=message||"";
}
function setUploadFeedback(message,type){
  const node=$("uploadFeedback");
  node.className="operation-feedback "+(type||"");
  node.textContent=message||"";
}
function render(){
  const q=$("search").value.trim().toLowerCase();
  const list=assets.filter(a=>!q||a.filename.toLowerCase().includes(q)||(a.productId??"").toString().includes(q)||productLabel(a.productId).toLowerCase().includes(q));
  $("queue").innerHTML=list.length?list.map(a=>{
    const suggestionHtml=a.productId?"":`
      <div class="suggestions">
        <strong>${escapeHtml(a.suggestionStatus||"UNRESOLVED")} — Visual catalogue decision<span class="suggestion-source"> · local ONNX vision · product-level evidence</span></strong>
        <small>${escapeHtml(a.suggestionReason||"No reliable catalogue match.")}</small>
        ${a.suggestionStatus==="HIGH"&&a.suggestions?.length?`
          <div class="suggestion">
            <div><strong>Suggested Product: ${escapeHtml(a.suggestions[0].name)}</strong>
              <span>ID: ${escapeHtml(a.suggestions[0].productId)} · Score: ${Number(a.topScore||a.suggestions[0].score||0).toFixed(3)} · Margin: ${Number(a.margin||0).toFixed(3)}</span>
            </div>
            <button type="button" class="btn light" data-suggestion-asset="${escapeHtml(a.id)}" data-suggestion-product="${escapeHtml(a.suggestions[0].productId)}" onclick="confirmSuggestedProduct(this.dataset.suggestionAsset,this.dataset.suggestionProduct)">Confirm</button>
          </div>`:a.suggestionStatus==="MEDIUM"&&a.suggestions?.length?`
          <div class="suggestion-list">
            ${a.suggestions.map((s,i)=>`<div class="suggestion"><div><strong>${escapeHtml((i+1)+". "+s.name)}</strong><span>ID: ${escapeHtml(s.productId)} · Score: ${Number(s.score||0).toFixed(3)}</span></div><button type="button" class="btn light" data-suggestion-asset="${escapeHtml(a.id)}" data-suggestion-product="${escapeHtml(s.productId)}" onclick="selectSuggestedProduct(this.dataset.suggestionAsset,this.dataset.suggestionProduct)">Select</button></div>`).join("")}
          </div>
          <button type="button" class="btn light" onclick="keepUnresolved(this)">None of these</button>`: `
          <div class="suggestion-empty">No reliable catalogue match.</div>
          <button type="button" class="btn light" onclick="markNewProductCandidate(this)">Mark as New Product Candidate</button>`}
        ${a.suggestionStatus==="HIGH"&&a.suggestions?.length?"":'<button type="button" class="btn light" onclick="keepUnresolved(this)">Keep Unresolved</button>'}
      </div>`;
    return '<article class="asset-card"><div class="asset-thumb">'+
      (a.mimeType&&a.mimeType.startsWith("image/")?'<img src="'+escapeHtml(mediaContentUrl(a.id))+'" alt="'+escapeHtml(a.filename)+'" loading="lazy">':'<div class="file-thumb">'+(a.mimeType==="application/pdf"?"PDF":"FILE")+'</div>')+
      '</div><div class="asset-meta"><strong>'+escapeHtml(a.filename)+'</strong><span class="badge">'+escapeHtml(a.status)+'</span><small>Product: '+escapeHtml(productLabel(a.productId))+' · '+a.width+'×'+a.height+' · '+escapeHtml(a.sha256.slice(0,16))+'…</small><small>Rights: '+escapeHtml(a.rightsStatus)+' · Source: '+escapeHtml(a.sourceType)+'</small><small>'+escapeHtml(a.provenance||"No provenance recorded")+'</small></div><div class="actions">'+
      suggestionHtml+
      (a.openWorldResult?'<div class="open-world-result"><strong>Open-world image understanding</strong><small>Model: '+escapeHtml(a.openWorldResult.model||"SmolVLM-500M-Instruct")+' · Version: '+escapeHtml(a.openWorldResult.modelVersion||"ONNX q4")+' · Inference: '+escapeHtml(a.openWorldResult.inferenceMs||0)+' ms</small><span><b>Product:</b> '+escapeHtml(a.openWorldResult.productName||"Unresolved")+'</span><span><b>Category:</b> '+escapeHtml(a.openWorldResult.category||"Unresolved")+'</span><span><b>Description:</b> '+escapeHtml(a.openWorldResult.description||"")+'</span><span><b>Visible attributes:</b> '+escapeHtml((a.openWorldResult.visibleAttributes||[]).join(", ")||"None reported")+'</span><span><b>Confidence:</b> '+Number(a.openWorldResult.confidence||0).toFixed(3)+' · <b>Status:</b> '+escapeHtml(a.openWorldResult.status||"UNRESOLVED")+' · <b>CATALOGUE REFERENCE:</b> NONE</span><div class="open-world-actions">'+(a.openWorldOwnerDecision?'<span class="badge">'+escapeHtml(a.openWorldOwnerDecision)+'</span>':'<button type="button" class="btn light" data-open-world-action="accept" data-open-world-id="'+escapeHtml(a.id)+'">Accept Identification</button><button type="button" class="btn light" data-open-world-action="edit" data-open-world-id="'+escapeHtml(a.id)+'">Edit Identification</button><button type="button" class="btn light" data-open-world-action="candidate" data-open-world-id="'+escapeHtml(a.id)+'">Create New Product Candidate</button><button type="button" class="btn light" data-open-world-action="keep" data-open-world-id="'+escapeHtml(a.id)+'">Keep Unresolved</button>')+'</div></div>':"")+
      productPickerHtml(a)+
      '<input data-id="'+a.id+'" data-field="role" value="'+escapeHtml(a.role)+'" placeholder="role"><button class="btn light" data-action-id="'+a.id+'" onclick="updateAsset(this.dataset.actionId)">Save metadata</button><button class="btn light" data-action-id="'+a.id+'" onclick="revalidate(this.dataset.actionId)">Revalidate</button><button class="btn red" data-action-id="'+a.id+'" onclick="approveAsset(this.dataset.actionId)">Owner approve</button><button class="btn light" data-action-id="'+a.id+'" onclick="rejectAsset(this.dataset.actionId)">Reject</button><button class="btn light danger-outline" data-action-id="'+a.id+'" onclick="deleteAsset(this.dataset.actionId)">Delete</button><div class="action-status" data-status-id="'+a.id+'" aria-live="polite"></div></div></article>';
  }).join(""):'<div class="panel"><h3>No media assets match.</h3><p class="muted">Upload a batch or change the filters.</p></div>';
}
async function refresh(showFeedback=false){
  try{
    const d=await api("/api/admin/media?status="+encodeURIComponent($("status").value)+"&q="+encodeURIComponent($("search").value));
    assets=d.assets||[];
    assets.filter(a=>!a.productId).forEach(a=>{
      a.suggestions=[];
      a.suggestionSource="visual";
      a.suggestionStatus="UNRESOLVED";
    });
    render();
    void enrichVisualSuggestions();
    void enrichOpenWorldSuggestions();
    if(showFeedback)setQueueFeedback("Queue refreshed","success");
    return d;
  }catch(e){
    if(showFeedback)setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error");
    throw e;
  }
}

async function runAssetAction(id,action,successMessage){
  setActionStatus(id,"Working…","pending");
  try{
    const result=await action();
    setActionStatus(id,"Complete","success");
    setQueueFeedback(successMessage(result),"success");
    try{
      await refresh(false);
    }catch(e){
      const message=(e.status?"HTTP "+e.status+": ":"")+e.message;
      setQueueFeedback(successMessage(result)+" Queue refresh failed: "+message,"error");
    }
    return result;
  }catch(e){
    const message=(e.status?"HTTP "+e.status+": ":"")+e.message;
    setActionStatus(id,message,"error");
    setQueueFeedback(message,"error");
    return null;
  }
}
function catalogueCategory(product){
  return product&&(product.category||product.categoryName||product.c||product.tag)||"";
}
function catalogueProducts(query,currentId=""){
  if(typeof P==="undefined"||!Array.isArray(P))return [];
  const needle=String(query||"").trim().toLowerCase();
  return P.filter(product=>{
    if(!product||product.id==null||!product.n)return false;
    if(!needle)return String(product.id)===String(currentId);
    const haystack=[product.n,product.id,catalogueCategory(product)].join(" ").toLowerCase();
    return haystack.includes(needle);
  }).slice(0,12);
}
function productPickerHtml(asset){
  const product=asset.productId&&typeof P!=="undefined"&&Array.isArray(P)?P.find(p=>String(p.id)===String(asset.productId)):null;
  const label=product?String(product.n):"";
  const category=product?catalogueCategory(product):"";
  return '<div class="catalogue-picker" data-picker-id="'+escapeHtml(asset.id)+'">'+
    '<input class="catalogue-picker-input" data-picker-input="'+escapeHtml(asset.id)+'" value="'+escapeHtml(label)+'" placeholder="Search catalogue product…" autocomplete="off" aria-label="Search catalogue product" oninput="filterProductPicker(this)" onclick="filterProductPicker(this)">'+
    '<input type="hidden" data-id="'+escapeHtml(asset.id)+'" data-field="productId" value="'+escapeHtml(asset.productId||"")+'">'+
    '<div class="catalogue-picker-results" data-picker-results="'+escapeHtml(asset.id)+'"></div>'+
    (product?'<small class="catalogue-picker-selected">Selected: '+escapeHtml(product.id)+' · '+escapeHtml(product.n)+(category?' · '+escapeHtml(category):"")+'</small>': '<small class="catalogue-picker-help">Type a product name to search the canonical catalogue.</small>')+
  '</div>';
}
function filterProductPicker(input){
  const picker=input.closest(".catalogue-picker");
  if(!picker)return;
  const assetId=input.getAttribute("data-picker-input");
  const results=picker.querySelector('[data-picker-results="'+CSS.escape(assetId)+'"]');
  if(!results)return;
  const matches=catalogueProducts(input.value);
  results.innerHTML=matches.length?matches.map(product=>{
    const category=catalogueCategory(product);
    return '<button type="button" class="catalogue-picker-option" data-picker-asset="'+escapeHtml(assetId)+'" data-picker-product="'+escapeHtml(product.id)+'" onclick="selectCatalogueProduct(this.dataset.pickerAsset,this.dataset.pickerProduct)"><strong>'+escapeHtml(product.id)+' · '+escapeHtml(product.n)+'</strong>'+(category?'<span>'+escapeHtml(category)+'</span>':"")+'</button>';
  }).join(""):'<div class="catalogue-picker-empty">No matching catalogue products.</div>';
  results.classList.add("open");
}
function selectCatalogueProduct(assetId,productId){
  const picker=document.querySelector('.catalogue-picker[data-picker-id="'+CSS.escape(assetId)+'"]');
  if(!picker)return;
  const product=typeof P!=="undefined"&&Array.isArray(P)?P.find(p=>String(p.id)===String(productId)):null;
  if(!product)return;
  const input=picker.querySelector('[data-picker-input="'+CSS.escape(assetId)+'"]');
  const hidden=picker.querySelector('[data-id="'+CSS.escape(assetId)+'"][data-field="productId"]');
  if(input)input.value=String(product.n);
  if(hidden)hidden.value=String(product.id);
  const results=picker.querySelector('[data-picker-results="'+CSS.escape(assetId)+'"]');
  if(results){results.innerHTML="";results.classList.remove("open");}
  const selected=picker.querySelector(".catalogue-picker-selected");
  const category=catalogueCategory(product);
  if(selected)selected.textContent="Selected: "+product.id+" · "+product.n+(category?" · "+category:"");
  else{
    const help=picker.querySelector(".catalogue-picker-help");
    if(help){help.className="catalogue-picker-selected";help.textContent="Selected: "+product.id+" · "+product.n+(category?" · "+category:"");}
  }
}
document.addEventListener("click",event=>{
  document.querySelectorAll(".catalogue-picker-results.open").forEach(results=>{
    if(!results.closest(".catalogue-picker")?.contains(event.target))results.classList.remove("open");
  });
});
function selectSuggestedProduct(assetId,productId){selectCatalogueProduct(assetId,productId);}
async function confirmSuggestedProduct(assetId,productId){
  selectCatalogueProduct(assetId,productId);
  const asset=assets.find(x=>String(x.id)===String(assetId));
  if(!asset)return;
  asset.confirmedProductId=String(productId);
  const result=await updateAsset(assetId);
  if(result) setActionStatus(assetId,"HIGH match confirmed — owner approval remains required","success");
}
async function recordOpenWorldDecision(assetId,decision,ownerCorrection=null){
  const asset=assets.find(x=>String(x.id)===String(assetId));
  if(!asset||!asset.openWorldResult)return null;
  const result=await api("/api/admin/media/"+encodeURIComponent(assetId)+"/open-world-decision",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,aiResult:asset.openWorldResult,ownerCorrection})});
  asset.openWorldOwnerDecision=decision;
  render();
  return result;
}
async function acceptOpenWorldIdentification(assetId){
  try{await recordOpenWorldDecision(assetId,"ACCEPTED_IDENTIFICATION");setQueueFeedback("Open-world identification accepted by owner. Create a candidate if this is a new product.","success")}
  catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}
}
async function editOpenWorldIdentification(assetId){
  const asset=assets.find(x=>String(x.id)===String(assetId));
  if(!asset?.openWorldResult)return;
  const correction=prompt("Correct the product identification:",asset.openWorldResult.productName||"");
  if(!correction||!correction.trim())return;
  try{
    await recordOpenWorldDecision(assetId,"OWNER_CORRECTED",correction.trim());
    asset.openWorldResult.productName=correction.trim();
    setQueueFeedback("Owner correction recorded; original AI output remains in the audit record.","success");
    render();
  }catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}
}
async function keepOpenWorldUnresolved(assetId){
  try{await recordOpenWorldDecision(assetId,"KEEP_UNRESOLVED");setQueueFeedback("Open-world result kept unresolved.","success")}
  catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}
}
async function createNewProductCandidate(assetId){
  const asset=assets.find(x=>String(x.id)===String(assetId));
  if(!asset)return null;
  setActionStatus(assetId,"Creating candidate…","pending");
  try{
    const result=await api("/api/admin/media/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({assetIds:[assetId],openWorldResult:asset.openWorldResult||null})});
    const progress=loadBatchProgress()||{clientBatchId:"current",total:assets.length,completed:0,summary:{}};
    progress.summary=progress.summary||{};progress.summary.newCandidates=(Number(progress.summary.newCandidates)||0)+1;saveBatchProgress(progress);renderBatchProgress(progress);
    setActionStatus(assetId,"New Product Candidate created — awaiting owner approval","success");
    setQueueFeedback("New product candidate created. Review it below.","success");
    await loadCandidates();
    return result;
  }catch(e){
    const message=(e.status?"HTTP "+e.status+": ":"")+e.message;
    setActionStatus(assetId,message,"error");
    setQueueFeedback(message,"error");
    return null;
  }
}
async function markNewProductCandidate(button){
  const card=button.closest(".asset-card");
  const assetId=card?.querySelector("[data-id]")?.getAttribute("data-id");
  if(assetId) await createNewProductCandidate(assetId);
}
async function loadCandidates(){
  const box=document.getElementById("candidates");
  if(!box)return;
  const feedback=document.getElementById("candidateFeedback");
  if(feedback){feedback.className="operation-feedback pending";feedback.textContent="Refreshing candidates…";}
  try{
    const d=await api("/api/admin/media/candidates?status=PENDING_OWNER");
    const candidates=d.candidates||[];
    box.innerHTML=candidates.length?candidates.map(candidate=>{
      const evidence=candidate.evidence||{};
      const photos=(candidate.assetIds||[]).map(id=>assets.find(a=>String(a.id)===String(id))).filter(Boolean);
      const photoHtml=photos.map(a=>'<img src="'+escapeHtml(mediaContentUrl(a.id))+'" alt="'+escapeHtml(a.filename)+'" loading="lazy">').join("");
      const evidenceHtml=Array.isArray(evidence.tokens)&&evidence.tokens.length?'<small>Evidence: '+escapeHtml(evidence.tokens.join(", "))+'</small>':'<small>Evidence: insufficient — owner must provide the product name.</small>';
      return '<article class="candidate-card"><div class="candidate-photos">'+(photoHtml||'<div class="candidate-photo-empty">No preview available</div>')+'</div><div class="candidate-meta"><span class="badge">NEW PRODUCT CANDIDATE</span><h3>'+escapeHtml(candidate.suggestedName||"New Product — Review Required")+'</h3><small>'+photos.length+' photo(s) · Awaiting Owner Approval</small>'+evidenceHtml+'<div class="candidate-actions"><button class="btn red" data-candidate-action="approve" data-candidate-id="'+escapeHtml(candidate.id)+'">Approve &amp; Create Product</button><button class="btn light" data-candidate-action="edit" data-candidate-id="'+escapeHtml(candidate.id)+'">Edit Name</button><button class="btn light" data-candidate-action="pending" data-candidate-id="'+escapeHtml(candidate.id)+'">Keep Pending</button><button class="btn light danger-outline" data-candidate-action="reject" data-candidate-id="'+escapeHtml(candidate.id)+'">Reject Candidate</button></div></div></article>';
    }).join(""):'<div class="panel"><p class="muted">No new product candidates are awaiting approval.</p></div>';
  }catch(e){
    const message=(e.status?("HTTP "+e.status+": "):"")+e.message;
    box.innerHTML='<div class="panel"><p class="muted">Candidate queue unavailable: '+escapeHtml(message)+'</p></div>';
    if(feedback){feedback.className="operation-feedback error";feedback.textContent=message;}
    throw e;
  }
  if(feedback){feedback.className="operation-feedback success";feedback.textContent="Candidate queue refreshed";}
}
async function candidateData(id){
  const d=await api("/api/admin/media/candidates?status=PENDING_OWNER");
  return (d.candidates||[]).find(x=>String(x.id)===String(id))||null;
}
async function approveNewProductCandidate(id){
  const candidate=await candidateData(id);
  if(!candidate)return;
  let name=candidate.suggestedName||"";
  if(name==="New Product — Review Required"){
    name=prompt("Evidence is insufficient. Enter the product name to approve this candidate:","");
    if(!name||!name.trim())return;
  }
  if(!confirm("Approve this candidate and let the backend assign the next canonical Product ID?"))return;
  try{
    const result=await api("/api/admin/media/candidates/"+encodeURIComponent(id)+"/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim()})});
    setQueueFeedback("Product created by backend: "+result.product.id+" · "+result.product.name,"success");
    await refresh(false); await loadCandidates();
  }catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error");}
}
async function editNewProductCandidate(id){
  const candidate=await candidateData(id);
  if(!candidate)return;
  const name=prompt("Correct the suggested product name if necessary:",candidate.suggestedName||"");
  if(!name||!name.trim())return;
  try{
    await api("/api/admin/media/candidates/"+encodeURIComponent(id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim()})});
    setQueueFeedback("Candidate name updated. It is still awaiting owner approval.","success");
    await loadCandidates();
  }catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error");}
}
async function keepCandidatePending(id){
  try{await api("/api/admin/media/candidates/"+encodeURIComponent(id)+"/keep-pending",{method:"POST"});setQueueFeedback("Candidate kept pending.","success");await loadCandidates();}
  catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error");}
}
async function rejectNewProductCandidate(id){
  if(!confirm("Reject this new product candidate?"))return;
  try{await api("/api/admin/media/candidates/"+encodeURIComponent(id)+"/reject",{method:"POST"});setQueueFeedback("Candidate rejected.","success");await loadCandidates();}
  catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error");}
}

function keepUnresolved(button){button.textContent="Kept Unresolved";button.disabled=true;}
async function updateAsset(id){
  const p=document.querySelector('[data-id="'+id+'"][data-field="productId"]'),r=document.querySelector('[data-id="'+id+'"][data-field="role"]');
  return runAssetAction(id,()=>api("/api/admin/media/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:p&&p.value.trim()?p.value.trim():null,sourceType:$("sourceType").value,rightsStatus:$("rightsStatus").value,provenance:$("provenance").value.trim(),sourceUrl:$("sourceUrl").value.trim(),license:$("license").value.trim(),attribution:$("attribution").value.trim(),role:r.value})}),result=>"Metadata saved. Product: "+(result&&result.status?result.status:"REVIEW"));
}
async function revalidate(id){return runAssetAction(id,()=>api("/api/admin/media/"+id+"/revalidate",{method:"POST"}),result=>"Revalidate complete: "+(result&&result.status?result.status:"success"))}
async function approveAsset(id){if(!confirm("Approve this asset? It will create a protected mapping but will not publish automatically."))return;return runAssetAction(id,()=>api("/api/admin/media/"+id+"/approve",{method:"POST"}),result=>"Owner approval complete: "+(result&&result.status?result.status:"APPROVED"))}
async function rejectAsset(id){if(!confirm("Reject this asset?"))return;return runAssetAction(id,()=>api("/api/admin/media/"+id+"/reject",{method:"POST"}),result=>"Asset rejected")
}
async function deleteAsset(id){
  if(!confirm("Delete this media asset? This cannot be undone."))return;
  return runAssetAction(id,()=>api("/api/admin/media/"+id,{method:"DELETE"}),()=> "Asset deleted successfully.");
}
function renderSelectedFiles(){
  const box=$("selectedFiles");
  if(!selected.length){
    box.classList.add("hidden");
    box.innerHTML="";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML='<div class="selected-files-head"><strong>Selected files</strong><span>'+selected.length+' file(s) ready to upload</span></div><div class="selected-files-grid">'+selected.map((file,index)=>{
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    const isImage=file.type.startsWith("image/")||["jpg","jpeg","png","webp"].includes(ext);
    const isPdf=file.type==="application/pdf"||ext==="pdf";
    const label=isImage?"Image":isPdf?"PDF":"ZIP";
    const visual=isImage?'<img data-preview-index="'+index+'" alt="'+escapeHtml(file.name)+'">':'<div class="selected-file-icon">'+label+'</div>';
    return '<div class="selected-file-card">'+visual+'<div class="selected-file-info"><strong>'+escapeHtml(file.name)+'</strong><span>'+label+' · '+(Math.ceil(file.size/1024))+' KB</span></div></div>';
  }).join("")+'</div>';
  selected.forEach((file,index)=>{
    const img=box.querySelector('img[data-preview-index="'+index+'"]');
    if(img)img.src=URL.createObjectURL(file);
  });
}
function setSelectedFiles(files){
  selected=[...files];
  $("uploadBtn").disabled=!selected.length;
  $("progressText").textContent=selected.length?selected.length+" file(s) selected":"Ready";
  renderSelectedFiles();
}
function clearSelectedFiles(){
  selected=[];
  $("files").value="";
  $("uploadBtn").disabled=true;
  $("progressText").textContent="Ready";
  renderSelectedFiles();
}
function xhrErrorMessage(xhr){
  let data={};
  try{data=xhr.responseText?JSON.parse(xhr.responseText):{}}catch{}
  let message=data.detail||data.message||xhr.responseText||("Request failed ("+xhr.status+")");
  if(Array.isArray(message))message=message.map(x=>x.msg||JSON.stringify(x)).join("; ");
  return (xhr.status?"HTTP "+xhr.status+": ":"")+message;
}
$("productId").addEventListener("input",renderProductPreview);$("productId").addEventListener("change",renderProductPreview);
$("files").addEventListener("change",e=>setSelectedFiles(e.target.files));
$("dropzone").addEventListener("click",e=>{if(e.target!==$("files"))$("files").click()});
$("dropzone").addEventListener("dragover",e=>{e.preventDefault();$("dropzone").classList.add("dragover")});
$("dropzone").addEventListener("dragleave",()=>$("dropzone").classList.remove("dragover"));
$("dropzone").addEventListener("drop",e=>{e.preventDefault();$("dropzone").classList.remove("dragover");setSelectedFiles(e.dataTransfer.files)});
const BATCH_PROGRESS_KEY="twins-media-center-batch-progress-v1";
function loadBatchProgress(){
  try{return JSON.parse(localStorage.getItem(BATCH_PROGRESS_KEY)||"null")}catch{return null}
}
function saveBatchProgress(progress){
  try{localStorage.setItem(BATCH_PROGRESS_KEY,JSON.stringify(progress))}catch{}
}
function renderBatchProgress(progress){
  if(!progress){$("progressText").textContent="Ready";return}
  $("progressText").textContent="Processing "+Number(progress.completed||0)+" / "+Number(progress.total||0);
  const summary=progress.summary||{};
  $("summary").innerHTML='<div class="summary"><b>Batch '+escapeHtml(progress.clientBatchId||"current")+'</b> · '+Number(progress.completed||0)+' / '+Number(progress.total||0)+' processed · '+Number(summary.matched||0)+' matched · '+Number(summary.review||0)+' review · '+Number(summary.newCandidates||0)+' new candidates · '+Number(summary.duplicates||0)+' duplicates · '+Number(summary.rejected||0)+' rejected · '+Number(summary.unresolved||0)+' unresolved · '+Number(summary.failed||0)+' failed</div>';
}
async function uploadChunk(filesToUpload,clientBatchId,index,totalChunks,retries=1){
  const fd=new FormData();
  filesToUpload.forEach(f=>fd.append("files",f));
  fd.append("metadata",metadata());
  fd.append("clientBatchId",clientBatchId);
  fd.append("chunkIndex",String(index));
  fd.append("totalChunks",String(totalChunks));
  let attempt=0;
  while(true){
    try{
      return await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open("POST",API+"/api/admin/media/upload");xhr.withCredentials=true;
        xhr.upload.onprogress=e=>{if(e.lengthComputable){const percent=Math.round(e.loaded/e.total*100);$("progressText").textContent="Uploading chunk "+(index+1)+" / "+totalChunks+" · "+percent+"%";}};
        xhr.onload=()=>{
          if(xhr.status>=200&&xhr.status<300){try{resolve(JSON.parse(xhr.responseText))}catch(e){reject(new Error("Upload succeeded but response was invalid"))}}
          else reject(new Error(xhrErrorMessage(xhr)));
        };
        xhr.onerror=()=>reject(new Error("Network request could not be completed"));
        xhr.send(fd);
      });
    }catch(error){
      if(attempt>=retries)throw error;
      attempt++;
      setUploadFeedback("Retrying chunk "+(index+1)+" ("+attempt+"/"+retries+")…","pending");
    }
  }
}
async function runBulkUpload(filesToUpload){
  const chunkSize=100;
  const totalChunks=Math.ceil(filesToUpload.length/chunkSize);
  const clientBatchId=(crypto?.randomUUID?crypto.randomUUID():"batch-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  const progress={clientBatchId,total:filesToUpload.length,completed:0,uploaded:0,duplicates:0,failed:0,chunksCompleted:0,totalChunks,summary:{matched:0,review:0,newCandidates:0,duplicates:0,rejected:0,unresolved:0,failed:0}};
  saveBatchProgress(progress);renderBatchProgress(progress);
  const allResults=[];
  for(let index=0;index<totalChunks;index++){
    const chunk=filesToUpload.slice(index*chunkSize,(index+1)*chunkSize);
    let response;
    try{
      response=await uploadChunk(chunk,clientBatchId,index,totalChunks);
    }catch(error){
      progress.failed+=chunk.length;progress.summary.failed+=chunk.length;progress.chunksCompleted=index;
      progress.lastError=error.message;saveBatchProgress(progress);renderBatchProgress(progress);
      setUploadFeedback("Chunk "+(index+1)+" failed. The remaining chunks were not discarded; retry the failed upload.","error");
      throw error;
    }
    const uploadedCount=Array.isArray(response.uploaded)?response.uploaded.length:0;
    const duplicateCount=Array.isArray(response.duplicates)?response.duplicates.length:0;
    const failedCount=Array.isArray(response.failed)?response.failed.length:0;
    progress.uploaded+=uploadedCount;progress.duplicates+=duplicateCount;progress.failed+=failedCount;progress.completed+=chunk.length;progress.chunksCompleted=index+1;
    progress.summary.duplicates+=duplicateCount;progress.summary.failed+=failedCount;
    allResults.push(response);
    if(failedCount) progress.lastFailures=(response.failed||[]).slice(-20);
    saveBatchProgress(progress);renderBatchProgress(progress);
    try{await refresh(false)}catch{}
  }
  progress.status="UPLOADED";progress.finishedAt=new Date().toISOString();saveBatchProgress(progress);
  renderBatchProgress(progress);
  return {clientBatchId,parts:allResults,progress};
}
$("uploadBtn").addEventListener("click",async()=>{
  if(!selected.length)return;
  const filesToUpload=[...selected],button=$("uploadBtn");
  button.disabled=true;button.textContent="Uploading batch…";setUploadFeedback("Uploading "+filesToUpload.length+" file(s) in bounded chunks of 100…","pending");
  try{
    const result=await runBulkUpload(filesToUpload);
    setUploadFeedback("Batch upload completed. Validation and local visual processing continue without exposing unapproved media.","success");
    clearSelectedFiles();
    await refresh(false);
  }catch(error){
    setUploadFeedback("Batch upload stopped safely: "+error.message,"error");
  }finally{
    button.textContent="Upload & validate";button.disabled=!selected.length;
  }
});
$("search").addEventListener("input",render);$("deleteAllQueue").addEventListener("click",deleteAllQueue);
$("status").addEventListener("change",async()=>{try{await refresh(false);setQueueFeedback($("status").value?"Filtered to "+$("status").value+".":"Showing all statuses.","success")}catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}});
async function deleteAllQueue(){
  const dialog=$("deleteAllDialog"),confirmButton=$("deleteAllConfirm"),cancelButton=$("deleteAllCancel"),trigger=$("deleteAllQueue");
  if(dialog.open)return;
  dialog.showModal();
  const confirmed=await new Promise(resolve=>{
    const finish=value=>{
      dialog.close();
      resolve(value);
    };
    cancelButton.onclick=()=>finish(false);
    confirmButton.onclick=()=>finish(true);
  });
  if(!confirmed)return;
  trigger.disabled=true;confirmButton.disabled=true;cancelButton.disabled=true;trigger.textContent="Deleting…";
  setQueueFeedback("Deleting all queued assets…","pending");
  try{
    const result=await api("/api/admin/media/queue",{method:"DELETE"});
    await refresh(false);
    const deleted=Number(result.deletedCount||0);
    const protectedCount=Number(result.protectedCount||0);
    const remaining=Number(result.queueRemaining??protectedCount);
    const suffix=protectedCount?" "+protectedCount+" protected queued asset(s) were left untouched.":"";
    setQueueFeedback("Delete All completed: "+deleted+" queued asset(s) deleted; "+remaining+" queued asset(s) remain."+suffix,"success");
  }catch(e){
    setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error");
  }finally{
    trigger.disabled=false;confirmButton.disabled=false;cancelButton.disabled=false;trigger.textContent="Delete All Queue";
  }
}
$("refresh").addEventListener("click",async()=>{
  const button=$("refresh");button.disabled=true;button.textContent="Refreshing…";setQueueFeedback("Refreshing…","pending");
  try{await refresh(false);setQueueFeedback("Queue refreshed","success")}catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}
  finally{button.disabled=false;button.textContent="Refresh queue"}
});
(async()=>{
  try{
    const d=await api("/api/account/me");
    if(d.user.role!=="owner")throw new Error("Owner access required");
    $("identity").textContent=d.user.name+" · OWNER";
    renderBatchProgress(loadBatchProgress());
    $("locked").classList.add("hidden");
    $("app").classList.remove("hidden");
    await refresh();
    await loadCandidates();
  }catch(e){
    $("app").classList.add("hidden");
    $("locked").classList.remove("hidden");
  }
})();
document.getElementById("refreshCandidates")?.addEventListener("click",async()=>{const button=document.getElementById("refreshCandidates");button.disabled=true;button.textContent="Refreshing…";try{await loadCandidates();}catch{}finally{button.disabled=false;button.textContent="Refresh candidates";}});
document.getElementById("candidates")?.addEventListener("click",event=>{const b=event.target.closest("[data-candidate-action]");if(!b)return;const id=b.getAttribute("data-candidate-id");const action=b.getAttribute("data-candidate-action");if(action==="approve")approveNewProductCandidate(id);else if(action==="edit")editNewProductCandidate(id);else if(action==="pending")keepCandidatePending(id);else if(action==="reject")rejectNewProductCandidate(id);});

document.getElementById("queue")?.addEventListener("click",event=>{
  const b=event.target.closest("[data-open-world-action]");
  if(!b)return;
  const id=b.getAttribute("data-open-world-id");
  const action=b.getAttribute("data-open-world-action");
  if(action==="accept")acceptOpenWorldIdentification(id);
  else if(action==="edit")editOpenWorldIdentification(id);
  else if(action==="candidate")createNewProductCandidate(id);
  else if(action==="keep")keepOpenWorldUnresolved(id);
});
