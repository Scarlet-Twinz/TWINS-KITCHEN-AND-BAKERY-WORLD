(function(root){
  const MODEL_ID="HuggingFaceTB/SmolVLM-500M-Instruct";
  const MODEL_VERSION="SmolVLM-500M-Instruct / ONNX q4 / WebGPU";
  const MODEL_BASE=(root.TWINS_SMOLVLM_MODEL_URL||"/tools/smolvlm-local/model").replace(/\/$/,"");
  const CPU_BASE=(root.TWINS_SMOLVLM_URL||"http://127.0.0.1:8787").replace(/\/$/,"");
  const TRANSFORMERS_URL=root.TWINS_TRANSFORMERS_URL||"https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
  let runtimePromise=null;
  let availabilityPromise=null;

  function cleanGeneratedText(text){
    let value=String(text||"").replace(/\s+/g," ").trim();
    const answer=value.match(/Answer\s*:\s*(.*)$/i);
    if(answer)value=answer[1].trim();
    value=value.replace(/^assistant\s*:\s*/i,"").trim();
    value=value.replace(/^user\s*:\s*/i,"").trim();
    return value;
  }

  function firstSentence(text){
    const value=cleanGeneratedText(text);
    const match=value.match(/^(.+?[.!?])(?:\s|$)/);
    return (match?match[1]:value).trim();
  }

  function productType(text){
    let value=cleanGeneratedText(text)
      .replace(/^[\s"'“”]+|[\s"'“”]+$/g,"")
      .replace(/[.!?]+$/g,"")
      .trim();
    value=value
      .replace(/^(the\s+)?(?:image|photo|picture)\s+(shows?|contains?|depicts?)\s+/i,"")
      .replace(/^this\s+is\s+/i,"")
      .trim();
    const words=value.split(/\s+/).filter(Boolean);
    return words.length>6?words.slice(0,6).join(" "):value;
  }

  function buildResult(rawOutput,inferenceMs,telemetry){
    const description=productType(rawOutput);
    const productName=productType(description);
    return {
      model:MODEL_ID,
      modelVersion:MODEL_VERSION,
      productName:productName||"Unresolved",
      category:productName||"Unresolved",
      description,
      visibleAttributes:[],
      confidence:0,
      status:productName&&productName!=="Unresolved"?"REVIEW":"UNRESOLVED",
      catalogueReference:"NONE",
      inferenceMs:Math.round(inferenceMs||0),
      inferenceAt:new Date().toISOString(),
      rawOutput:String(rawOutput||""),
      telemetry:telemetry||null
    };
  }

  async function loadRuntime(){
    if(runtimePromise)return runtimePromise;
    runtimePromise=(async()=>{
      if(!navigator.gpu)throw new Error("WebGPU is not available in this browser.");
      const adapter=await navigator.gpu.requestAdapter();
      if(!adapter)throw new Error("WebGPU adapter unavailable.");
      const {AutoProcessor,AutoModelForVision2Seq,RawImage,env}=await import(TRANSFORMERS_URL);
      env.allowLocalModels=true;
      env.allowRemoteModels=false;
      env.useBrowserCache=false;
      env.localModelPath=MODEL_BASE.replace(/\/$/,"/").replace(/\/?$/,"/");
      const processor=await AutoProcessor.from_pretrained(MODEL_BASE,{local_files_only:true});
      const model=await AutoModelForVision2Seq.from_pretrained(MODEL_BASE,{
        device:"webgpu",
        dtype:{
          embed_tokens:"q4",
          vision_encoder:"q4",
          decoder_model_merged:"q4"
        },
        local_files_only:true
      });
      return{processor,model,RawImage,device:"webgpu"};
    })().catch(error=>{
      runtimePromise=null;
      throw error;
    });
    return runtimePromise;
  }

  async function browserAnalyze(blob,filename){
    const started=performance.now();
    const runtime=await loadRuntime();
    const image=await runtime.RawImage.fromBlob(blob);
    const prompt="Identify the most specific defensible commercial product type from visible physical features only. Output ONLY a short noun phrase, 2 to 6 words. Do not write a sentence. Do not mention brands, model numbers, capacity, dimensions, fuel type, power source, burner count, materials, price, catalogue IDs, or hidden specifications. If uncertain, use a broader product type. Example format: commercial multi-burner cooking range.";
    const inputs=await runtime.processor("<image>\n"+prompt,image);
    const generationStarted=performance.now();
    const outputIds=await runtime.model.generate({
      ...inputs,
      max_new_tokens:24,
      do_sample:false
    });
    const generationMs=performance.now()-generationStarted;
    const inputLength=Number(runtime.processor?.tokenizer ? (inputs?.input_ids?.dims?.[1]||0) : 0);
    let generatedIds=outputIds;
    if(typeof outputIds?.tolist==="function"){
      const rows=outputIds.tolist();
      if(Array.isArray(rows)&&Array.isArray(rows[0]))generatedIds=[rows[0].slice(inputLength)];
    }
    const decoded=runtime.processor.tokenizer.batch_decode(generatedIds,{skip_special_tokens:true});
    const rawOutput=Array.isArray(decoded)?decoded[0]||"":String(decoded||"");
    const totalMs=performance.now()-started;
    return buildResult(rawOutput,totalMs,{
      engine:"Transformers.js / ONNX Runtime WebGPU",
      device:"webgpu",
      modelLoadCached:true,
      generationMs:Math.round(generationMs),
      totalMs:Math.round(totalMs),
      filename:filename||"unknown",
      inputBytes:Number(blob?.size)||0
    });
  }

  async function cpuAvailable(){
    try{
      const response=await fetch(CPU_BASE+"/health",{cache:"no-store"});
      if(!response.ok)return{available:false};
      const data=await response.json();
      return{available:true,...data};
    }catch(error){
      return{available:false,error:String(error?.message||error)};
    }
  }

  async function cpuAnalyze(blob,filename){
    const response=await fetch(CPU_BASE+"/analyze",{
      method:"POST",
      headers:{
        "content-type":blob.type||"application/octet-stream",
        "x-mime-type":blob.type||"image/jpeg",
        "x-filename":filename||"unknown"
      },
      body:blob,
      cache:"no-store"
    });
    const text=await response.text();
    let data={};
    try{data=text?JSON.parse(text):{}}catch{}
    if(!response.ok)throw new Error(data.error||"Local SmolVLM CPU service failed ("+response.status+")");
    return{available:true,...data.result};
  }

  async function probeWebGPU(){
    if(!navigator.gpu)return null;
    for(let attempt=0;attempt<3;attempt++){
      const adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"}).catch(()=>null);
      if(adapter)return adapter;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return null;
  }

  async function available(){
    const adapter=await probeWebGPU();
    if(adapter){
      return{
        available:true,
        mode:"webgpu",
        model:MODEL_ID,
        modelVersion:MODEL_VERSION,
        modelPath:MODEL_BASE,
        message:"WebGPU available — SmolVLM loads locally on first inference."
      };
    }
    const cpu=await cpuAvailable();
    if(cpu.available)return{
      available:true,
      mode:"cpu-fallback",
      model:cpu.model||MODEL_ID,
      modelVersion:cpu.modelVersion||"SmolVLM-500M-Instruct / ONNX q4",
      message:"WebGPU adapter unavailable — local CPU fallback available."
    };
    return{
      available:false,
      mode:"unavailable",
      error:navigator.gpu
        ?"WebGPU is present but no adapter could be obtained after retrying."
        :"Neither browser WebGPU nor the local SmolVLM CPU service is available."
    };
  }

  async function analyze(blob,filename){
    if(!blob)throw new Error("SmolVLM requires an image blob.");
    try{
      return{available:true,...await browserAnalyze(blob,filename)};
    }catch(webgpuError){
      const cpu=await cpuAvailable();
      if(cpu.available){
        const fallback=await cpuAnalyze(blob,filename);
        return{
          available:true,
          ...fallback,
          model:fallback.model||MODEL_ID,
          modelVersion:fallback.modelVersion||"SmolVLM-500M-Instruct / ONNX q4",
          telemetry:{
            ...(fallback.telemetry||{}),
            fallbackFrom:"webgpu",
            webgpuError:String(webgpuError?.message||webgpuError)
          }
        };
      }
      throw webgpuError;
    }
  }

  root.TwinsSmolVlmLocal={
    MODEL_ID,
    MODEL_VERSION,
    MODEL_BASE,
    CPU_BASE,
    TRANSFORMERS_URL,
    available,
    analyze
  };
})(typeof globalThis!=="undefined"?globalThis:this);
