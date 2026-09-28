(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.TwinsMediaVisualMatcher=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const MODEL_ID="Xenova/mobileclip_s0";
  const MODEL_REVISION="main";
  const TRANSFORMERS_MODULE="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
  const DB_NAME="twins-media-vision";
  const DB_VERSION=2;
  const STORE_NAME="embeddings";
  const DEFAULTS={highThreshold:0.78,mediumThreshold:0.62,highMargin:0.07,mediumMargin:0.025,maxSuggestions:5};
  const memoryCache=new Map();
  let runtimePromise=null;

  function cosineSimilarity(a,b){
    if(!a||!b||a.length!==b.length)return 0;
    let dot=0,na=0,nb=0;
    for(let i=0;i<a.length;i++){
      const x=Number(a[i])||0,y=Number(b[i])||0;
      dot+=x*y;na+=x*x;nb+=y*y;
    }
    return na&&nb?dot/(Math.sqrt(na)*Math.sqrt(nb)):0;
  }

  function normalizeEmbedding(values){
    const input=Array.from(values||[],Number);
    let norm=0;
    for(const value of input)norm+=value*value;
    norm=Math.sqrt(norm);
    return norm?input.map(value=>value/norm):input;
  }

  function rankVisualMatches(ranked){
    const byProduct=new Map();
    for(const item of Array.isArray(ranked)?ranked:[]){
      if(!item||item.productId==null||!Number.isFinite(Number(item.score)))continue;
      const id=String(item.productId);
      const existing=byProduct.get(id);
      if(!existing||Number(item.score)>Number(existing.score))byProduct.set(id,{...item,productId:id});
    }
    return [...byProduct.values()].sort((a,b)=>Number(b.score)-Number(a.score)||String(a.productId).localeCompare(String(b.productId),undefined,{numeric:true}));
  }

  function classifyVisualMatches(ranked,options={}){
    const cfg={...DEFAULTS,...options};
    const clean=rankVisualMatches(ranked);
    if(!clean.length)return{status:"UNRESOLVED",suggestions:[],reason:"no usable catalogue reference embeddings are available"};
    const top=clean[0],second=clean[1];
    const margin=second?Number(top.score)-Number(second.score):Number(top.score);
    if(Number(top.score)>=cfg.highThreshold&&margin>=cfg.highMargin){
      return{status:"HIGH",suggestions:[{...top,confidence:"HIGH"}],reason:"strong vision-embedding similarity with a clear candidate margin"};
    }
    if(Number(top.score)>=cfg.mediumThreshold&&margin>=cfg.mediumMargin){
      return{status:"MEDIUM",suggestions:clean.filter(x=>Number(x.score)>=cfg.mediumThreshold).slice(0,cfg.maxSuggestions).map(x=>({...x,confidence:"MEDIUM"})),reason:"vision-embedding similarity is plausible but requires human review"};
    }
    return{status:"UNRESOLVED",suggestions:[],reason:"vision-embedding evidence is weak or ambiguous"};
  }

  function openDb(){
    if(typeof indexedDB==="undefined")return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>request.result.createObjectStore(STORE_NAME,{keyPath:"key"});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function getCachedEmbedding(key){
    if(memoryCache.has(key))return memoryCache.get(key);
    const db=await openDb().catch(()=>null);
    if(!db)return null;
    return new Promise(resolve=>{
      const request=db.transaction(STORE_NAME,"readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess=()=>{
        const value=request.result?.embedding?Array.from(request.result.embedding):null;
        if(value)memoryCache.set(key,value);
        resolve(value);
      };
      request.onerror=()=>resolve(null);
    });
  }

  async function putCachedEmbedding(key,embedding,metadata={}){
    const value=Array.from(embedding||[]);
    memoryCache.set(key,value);
    const db=await openDb().catch(()=>null);
    if(!db)return;
    await new Promise(resolve=>{
      const tx=db.transaction(STORE_NAME,"readwrite");
      tx.objectStore(STORE_NAME).put({key,embedding:value,...metadata});
      tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
    });
  }

  function cacheKey(kind,identity){
    return [MODEL_ID,MODEL_REVISION,kind,String(identity)].join("|");
  }

  function setStatus(callback,message,state="loading"){
    if(typeof callback==="function")callback({message,state,model:MODEL_ID});
  }

  async function loadRuntime(onStatus){
    if(runtimePromise)return runtimePromise;
    runtimePromise=(async()=>{
      setStatus(onStatus,"Loading model…","loading");
      const transformers=await import(TRANSFORMERS_MODULE);
      const {env,AutoProcessor,CLIPVisionModelWithProjection,RawImage}=transformers;
      env.useBrowserCache=true;
      env.useWasmCache=true;
      let device="webgpu";
      let dtype="fp16";
      if(typeof navigator==="undefined"||!navigator.gpu){
        device="wasm";dtype="fp32";
        setStatus(onStatus,"WebGPU unavailable — using CPU fallback","fallback");
      }
      const load=async(targetDevice,targetDtype)=>{
        const progress_callback=info=>{
          if(info?.status==="progress_total"&&Number.isFinite(info.progress)){
            setStatus(onStatus,"Loading model… "+Math.round(info.progress)+"%","loading");
          }
        };
        const processor=await AutoProcessor.from_pretrained(MODEL_ID,{revision:MODEL_REVISION});
        const model=await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID,{
          revision:MODEL_REVISION,
          device:targetDevice,
          dtype:targetDtype,
          progress_callback
        });
        return{processor,model,RawImage,device:targetDevice,dtype:targetDtype};
      };
      try{
        const runtime=await load(device,dtype);
        setStatus(onStatus,runtime.device==="webgpu"?"Ready — WebGPU":"Ready — CPU/WASM","ready");
        return runtime;
      }catch(error){
        if(device!=="webgpu")throw error;
        setStatus(onStatus,"WebGPU unavailable — using CPU fallback","fallback");
        const runtime=await load("wasm","fp32");
        setStatus(onStatus,"Ready — CPU/WASM","ready");
        return runtime;
      }
    })().catch(error=>{
      runtimePromise=null;
      setStatus(onStatus,"Unavailable — visual matching disabled","unavailable");
      throw error;
    });
    return runtimePromise;
  }

  async function embedBlob(blob,onStatus){
    const runtime=await loadRuntime(onStatus);
    const image=await runtime.RawImage.fromBlob(blob);
    const inputs=await runtime.processor(image);
    const output=await runtime.model(inputs);
    const embedding=output?.image_embeds?.normalize?.().tolist?.()[0]||output?.image_embeds?.tolist?.()[0];
    if(!embedding||!embedding.length)throw new Error("Vision model returned no image embedding");
    return normalizeEmbedding(embedding);
  }

  async function embeddingForBlob(blob,identity,onStatus){
    const key=cacheKey("asset",identity);
    const cached=await getCachedEmbedding(key);
    if(cached)return{embedding:cached,cached:true};
    const embedding=await embedBlob(blob,onStatus);
    await putCachedEmbedding(key,embedding,{kind:"asset",identity:String(identity)});
    return{embedding,cached:false};
  }

  async function embeddingForReference(url,onStatus){
    const key=cacheKey("reference",url);
    const cached=await getCachedEmbedding(key);
    if(cached)return{embedding:cached,cached:true,referenceUnavailable:false};
    try{
      const response=await fetch(url,{credentials:"include",cache:"force-cache"});
      if(!response.ok)throw new Error("HTTP "+response.status);
      const blob=await response.blob();
      const embedding=await embedBlob(blob,onStatus);
      await putCachedEmbedding(key,embedding,{kind:"reference",url,referenceAssetId:metadata.referenceAssetId||url,checksum:metadata.checksum||"",model:MODEL_ID,modelRevision:MODEL_REVISION,embeddingVersion:metadata.embeddingVersion||1,indexVersion:metadata.indexVersion||1});
      return{embedding,cached:false,referenceUnavailable:false};
    }catch(error){
      return{embedding:null,cached:false,referenceUnavailable:true,status:"REFERENCE_UNAVAILABLE",error:String(error?.message||error)};
    }
  }

  async function buildReferenceIndex(products,referenceResolver,onProgress,onStatus,options={}){
    const index=[];
    const unavailableReferences=[];
    const embedReference=typeof options.embedReference==="function"?options.embedReference:embeddingForReference;
    const candidates=(Array.isArray(products)?products:[]).filter(product=>product&&product.id!=null&&product.n);
    let usable=0,unavailable=0,completed=0;
    for(const product of candidates){
      const rawReferences=referenceResolver(product);
      const references=Array.isArray(rawReferences)?rawReferences:[]; 
      if(!references.length){completed++;if(onProgress)onProgress({completed,total:candidates.length,usable,unavailable});continue;}
      let added=0;
      for(const raw of references){
        const metadata=typeof raw==="string"?{url:raw}:raw||{};
        const url=metadata.url||metadata.referenceUrl||metadata.mediaPath;
        if(!url)continue;
        const result=await embedReference(url,onStatus,metadata);
        if(!result.embedding){unavailable++;unavailableReferences.push({url,status:"REFERENCE_UNAVAILABLE",error:result.error||""});continue;}
        index.push({productId:String(product.id),name:String(product.n),category:product.category||product.categoryName||product.c||product.tag||"",referenceAssetId:metadata.referenceAssetId||null,checksum:metadata.checksum||null,model:MODEL_ID,modelRevision:MODEL_REVISION,embeddingVersion:metadata.embeddingVersion||1,indexVersion:metadata.indexVersion||1,referenceUrl:url,embedding:result.embedding});
        usable++;added++;
      }
      if(!added&&references.length)unavailable++;
      completed++;
      if(onProgress)onProgress({completed,total:candidates.length,usable,unavailable});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return{index,usable,unavailable,unavailableReferences,totalProducts:candidates.length};
  }

  function rankByEmbedding(sourceEmbedding,index){
    return (Array.isArray(index)?index:[]).map(item=>({
      productId:String(item.productId),
      name:item.name,
      category:item.category||"",
      referenceUrl:item.referenceUrl,
      score:cosineSimilarity(sourceEmbedding,item.embedding)
    })).sort((a,b)=>Number(b.score)-Number(a.score)||String(a.productId).localeCompare(String(b.productId),undefined,{numeric:true}));
  }

  return{
    MODEL_ID,MODEL_REVISION,DEFAULTS,cosineSimilarity,normalizeEmbedding,rankVisualMatches,classifyVisualMatches,
    loadRuntime,embeddingForBlob,buildReferenceIndex,rankByEmbedding,getCachedEmbedding,putCachedEmbedding
  };
});