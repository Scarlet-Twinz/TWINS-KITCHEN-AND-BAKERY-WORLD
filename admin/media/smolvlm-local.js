(function(root){
  const BASE=(root.TWINS_SMOLVLM_URL||"http://127.0.0.1:8787").replace(/\/$/,"");
  let availabilityPromise=null;
  async function request(path,options={}){
    const response=await fetch(BASE+path,{...options,cache:"no-store"});
    const text=await response.text();
    let data={};try{data=text?JSON.parse(text):{}}catch{}
    if(!response.ok)throw new Error(data.error||"Local SmolVLM request failed ("+response.status+")");
    return data;
  }
  function available(){
    if(!availabilityPromise)availabilityPromise=request("/health").then(data=>({available:true,...data})).catch(error=>({available:false,error:String(error.message||error)}));
    return availabilityPromise;
  }
  async function analyze(blob,filename){
    const health=await available();
    if(!health.available)return{available:false,error:health.error};
    const data=await request("/analyze",{
      method:"POST",
      headers:{"content-type":blob.type||"application/octet-stream","x-mime-type":blob.type||"image/jpeg","x-filename":filename||"unknown"},
      body:blob
    });
    return{available:true,...data.result};
  }
  root.TwinsSmolVlmLocal={
    MODEL_ID:"HuggingFaceTB/SmolVLM-500M-Instruct",
    MODEL_VERSION:"SmolVLM-500M-Instruct / ONNX q4",
    BASE,
    available,
    analyze
  };
})(typeof globalThis!=="undefined"?globalThis:this);
