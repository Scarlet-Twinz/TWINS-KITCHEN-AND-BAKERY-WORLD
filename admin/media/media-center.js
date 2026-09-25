const API=(window.TWINS_API_BASE||"http://localhost:8000").replace(/\/$/,"");const $=id=>document.getElementById(id);let selected=[];let assets=[];
async function api(path,opts={}){const r=await fetch(API+path,{credentials:"include",...opts});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok){let message=d.detail||d.message||raw||("Request failed ("+r.status+")");if(Array.isArray(message))message=message.map(x=>x.msg||JSON.stringify(x)).join("; ");const e=new Error(message);e.status=r.status;throw e}return d}
function normalizeCatalogueMediaPath(src){
  if(!src)return "";
  let value=String(src).trim().replace(/\\/g,"/");
  if(/^https?:\\/\\//i.test(value))return value;
  const marker="assets/media/";
  const markerIndex=value.indexOf(marker);
  if(markerIndex>=0)return "/"+value.slice(markerIndex).replace(/^\\/+/, "");
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
function render(){const q=$("search").value.toLowerCase(),s=$("status").value;const list=assets.filter(a=>(!s||a.status===s)&&(!q||a.filename.toLowerCase().includes(q)||(a.productId||"").toString().includes(q)));$("queue").innerHTML=list.length?list.map(a=>'<article class="asset-card"><div class="asset-thumb"></div><div class="asset-meta"><strong>'+escapeHtml(a.filename)+'</strong><span class="badge">'+escapeHtml(a.status)+'</span><small>Product: '+escapeHtml(productLabel(a.productId))+' · '+a.width+'×'+a.height+' · '+escapeHtml(a.sha256.slice(0,16))+'…</small><small>Rights: '+escapeHtml(a.rightsStatus)+' · Source: '+escapeHtml(a.sourceType)+'</small><small>'+escapeHtml(a.provenance||"No provenance recorded")+'</small></div><div class="actions"><input data-id="'+a.id+'" data-field="productId" value="'+(a.productId||"")+'" placeholder="Product ID"><input data-id="'+a.id+'" data-field="role" value="'+escapeHtml(a.role)+'" placeholder="role"><button class="btn light" data-action-id="'+a.id+'" onclick="updateAsset(this.dataset.actionId)">Save metadata</button><button class="btn light" data-action-id="'+a.id+'" onclick="revalidate(this.dataset.actionId)">Revalidate</button><button class="btn red" data-action-id="'+a.id+'" onclick="approveAsset(this.dataset.actionId)">Owner approve</button><button class="btn light" data-action-id="'+a.id+'" onclick="rejectAsset(this.dataset.actionId)">Reject</button><div class="action-status" data-status-id="'+a.id+'" aria-live="polite"></div></div></article>').join(""):'<div class="panel"><h3>No media assets match.</h3><p class="muted">Upload a batch or change the filters.</p></div>'}
async function refresh(){try{const d=await api("/api/admin/media?status="+encodeURIComponent($("status").value)+"&q="+encodeURIComponent($("search").value));assets=d.assets||[];render()}catch(e){$("queue").innerHTML='<div class="panel bad">'+escapeHtml(e.message)+'</div>'}}
async function runAssetAction(id,action,successMessage){
  setActionStatus(id,"Working…","pending");
  try{
    const result=await action();
    await refresh();
    setActionStatus(id,successMessage(result),"success");
    return result;
  }catch(e){
    setActionStatus(id,(e.status?"HTTP "+e.status+": ":"")+e.message,"error");
    return null;
  }
}
async function updateAsset(id){
  const p=document.querySelector('[data-id="'+id+'"][data-field="productId"]');
  const r=document.querySelector('[data-id="'+id+'"][data-field="role"]');
  return runAssetAction(id,()=>api("/api/admin/media/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:p.value.trim()||null,sourceType:$("sourceType").value,rightsStatus:$("rightsStatus").value,provenance:$("provenance").value.trim(),sourceUrl:$("sourceUrl").value.trim(),license:$("license").value.trim(),attribution:$("attribution").value.trim(),role:r.value})}),result=>"Metadata saved. Product: "+(result&&result.status?result.status:"REVIEW"));
}
async function revalidate(id){return runAssetAction(id,()=>api("/api/admin/media/"+id+"/revalidate",{method:"POST"}),result=>"Revalidate complete: "+(result&&result.status?result.status:"success"))}
async function approveAsset(id){if(!confirm("Approve this asset? It will create a protected mapping but will not publish automatically."))return;return runAssetAction(id,()=>api("/api/admin/media/"+id+"/approve",{method:"POST"}),result=>"Owner approval complete: "+(result&&result.status?result.status:"APPROVED"))}
async function rejectAsset(id){if(!confirm("Reject this asset?"))return;return runAssetAction(id,()=>api("/api/admin/media/"+id+"/reject",{method:"POST"}),result=>"Asset rejected")}
$("productId").addEventListener("input",renderProductPreview);$("productId").addEventListener("change",renderProductPreview);$("files").addEventListener("change",e=>{selected=[...e.target.files];$("uploadBtn").disabled=!selected.length;$("progressText").textContent=selected.length+" file(s) selected"});
$("dropzone").addEventListener("click",()=> $("files").click());
$("dropzone").addEventListener("dragover",e=>{e.preventDefault()});
$("dropzone").addEventListener("drop",e=>{e.preventDefault();selected=[...e.dataTransfer.files];$("uploadBtn").disabled=!selected.length;$("progressText").textContent=selected.length+" file(s) selected"});
$("uploadBtn").addEventListener("click",()=>{const fd=new FormData();selected.forEach(f=>fd.append("files",f));fd.append("metadata",metadata());const xhr=new XMLHttpRequest();xhr.open("POST",API+"/api/admin/media/upload");xhr.withCredentials=true;xhr.upload.onprogress=e=>{if(e.lengthComputable)$("progressText").textContent=Math.round(e.loaded/e.total*100)+"% uploading"};xhr.onload=async()=>{if(xhr.status>=200&&xhr.status<300){renderSummary(JSON.parse(xhr.responseText));$("progressText").textContent="Upload complete";selected=[];$("files").value="";$("uploadBtn").disabled=true;await refresh()}else $("progressText").textContent="Upload failed"};xhr.onerror=()=>$("progressText").textContent="Upload failed";xhr.send(fd)});
$("search").addEventListener("input",render);$("status").addEventListener("change",refresh);$("refresh").addEventListener("click",refresh);
(async()=>{try{const d=await api("/api/account/me");if(d.user.role!=="owner")throw new Error("Owner access required");$("identity").textContent=d.user.name+" · OWNER";$("app").classList.remove("hidden");await refresh()}catch(e){$("locked").classList.remove("hidden")}})();