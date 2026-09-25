const API=(window.TWINS_API_BASE||"http://localhost:8000").replace(/\/$/,"");const $=id=>document.getElementById(id);let selected=[];let assets=[];
async function api(path,opts={}){const r=await fetch(API+path,{credentials:"include",...opts});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok){let message=d.detail||d.message||raw||("Request failed ("+r.status+")");if(Array.isArray(message))message=message.map(x=>x.msg||JSON.stringify(x)).join("; ");const e=new Error(message);e.status=r.status;throw e}return d}
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
function mediaContentUrl(id){return API+"/api/admin/media/"+encodeURIComponent(id)+"/content"}
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
function render(){const q=$("search").value.trim().toLowerCase(),s=$("status").value;const list=assets.filter(a=>(!q||a.filename.toLowerCase().includes(q)||(a.productId??"").toString().includes(q)));$("queue").innerHTML=list.length?list.map(a=>'<article class="asset-card"><div class="asset-thumb">'+(a.mimeType&&a.mimeType.startsWith("image/")?'<img src="'+escapeHtml(mediaContentUrl(a.id))+'" alt="'+escapeHtml(a.filename)+'" loading="lazy">':'<div class="file-thumb">'+(a.mimeType==="application/pdf"?"PDF":"FILE")+'</div>')+'</div><div class="asset-meta"><strong>'+escapeHtml(a.filename)+'</strong><span class="badge">'+escapeHtml(a.status)+'</span><small>Product: '+escapeHtml(productLabel(a.productId))+' · '+a.width+'×'+a.height+' · '+escapeHtml(a.sha256.slice(0,16))+'…</small><small>Rights: '+escapeHtml(a.rightsStatus)+' · Source: '+escapeHtml(a.sourceType)+'</small><small>'+escapeHtml(a.provenance||"No provenance recorded")+'</small></div><div class="actions"><input data-id="'+a.id+'" data-field="productId" value="'+(a.productId||"")+'" placeholder="Product ID"><input data-id="'+a.id+'" data-field="role" value="'+escapeHtml(a.role)+'" placeholder="role"><button class="btn light" data-action-id="'+a.id+'" onclick="updateAsset(this.dataset.actionId)">Save metadata</button><button class="btn light" data-action-id="'+a.id+'" onclick="revalidate(this.dataset.actionId)">Revalidate</button><button class="btn red" data-action-id="'+a.id+'" onclick="approveAsset(this.dataset.actionId)">Owner approve</button><button class="btn light" data-action-id="'+a.id+'" onclick="rejectAsset(this.dataset.actionId)">Reject</button><button class="btn light danger-outline" data-action-id="'+a.id+'" onclick="deleteAsset(this.dataset.actionId)">Delete</button><div class="action-status" data-status-id="'+a.id+'" aria-live="polite"></div></div></article>').join(""):'<div class="panel"><h3>No media assets match.</h3><p class="muted">Upload a batch or change the filters.</p></div>'}
async function refresh(showFeedback=false){
  try{
    const d=await api("/api/admin/media?status="+encodeURIComponent($("status").value)+"&q="+encodeURIComponent($("search").value));
    assets=d.assets||[];
    render();
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
async function updateAsset(id){
  const p=document.querySelector('[data-id="'+id+'"][data-field="productId"]'),r=document.querySelector('[data-id="'+id+'"][data-field="role"]');
  return runAssetAction(id,()=>api("/api/admin/media/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:p.value.trim()||null,sourceType:$("sourceType").value,rightsStatus:$("rightsStatus").value,provenance:$("provenance").value.trim(),sourceUrl:$("sourceUrl").value.trim(),license:$("license").value.trim(),attribution:$("attribution").value.trim(),role:r.value})}),result=>"Metadata saved. Product: "+(result&&result.status?result.status:"REVIEW"));
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
$("uploadBtn").addEventListener("click",()=>{
  if(!selected.length)return;
  const filesToUpload=[...selected],button=$("uploadBtn");
  button.disabled=true;button.textContent="Uploading…";setUploadFeedback("Uploading "+filesToUpload.length+" file(s)…","pending");$("progressText").textContent="Uploading…";
  const fd=new FormData();filesToUpload.forEach(f=>fd.append("files",f));fd.append("metadata",metadata());
  const xhr=new XMLHttpRequest();xhr.open("POST",API+"/api/admin/media/upload");xhr.withCredentials=true;
  xhr.upload.onprogress=e=>{if(e.lengthComputable){const percent=Math.round(e.loaded/e.total*100);$("progressText").textContent=percent+"% uploading";}};
  xhr.onload=async()=>{
    if(xhr.status>=200&&xhr.status<300){
      try{
        const data=JSON.parse(xhr.responseText);
        renderSummary(data);$("progressText").textContent="Upload complete";setUploadFeedback("Upload completed successfully.","success");clearSelectedFiles();
        try{await refresh(false);setQueueFeedback("Upload completed and queue refreshed.","success")}catch(e){setQueueFeedback("Upload completed, but queue refresh failed: "+(e.message||e),"error")}
      }catch(e){setUploadFeedback("Upload succeeded but the response could not be read: "+e.message,"error")}
    }else{
      const message=xhrErrorMessage(xhr);$("progressText").textContent="Upload failed";setUploadFeedback(message,"error");
    }
    button.textContent="Upload & validate";button.disabled=!selected.length;
  };
  xhr.onerror=()=>{const message="Upload failed: network request could not be completed.";$("progressText").textContent="Upload failed";setUploadFeedback(message,"error");button.textContent="Upload & validate";button.disabled=!selected.length};
  xhr.send(fd);
});
$("search").addEventListener("input",render);
$("status").addEventListener("change",async()=>{try{await refresh(false);setQueueFeedback($("status").value?"Filtered to "+$("status").value+".":"Showing all statuses.","success")}catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}});
$("refresh").addEventListener("click",async()=>{
  const button=$("refresh");button.disabled=true;button.textContent="Refreshing…";setQueueFeedback("Refreshing…","pending");
  try{await refresh(false);setQueueFeedback("Queue refreshed","success")}catch(e){setQueueFeedback((e.status?"HTTP "+e.status+": ":"")+e.message,"error")}
  finally{button.disabled=false;button.textContent="Refresh queue"}
});
(async()=>{try{const d=await api("/api/account/me");if(d.user.role!=="owner")throw new Error("Owner access required");$("identity").textContent=d.user.name+" · OWNER";$("app").classList.remove("hidden");await refresh()}catch(e){$("locked").classList.remove("hidden")}})();