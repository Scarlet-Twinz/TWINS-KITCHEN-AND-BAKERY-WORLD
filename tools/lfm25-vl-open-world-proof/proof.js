import {
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

const MODEL_ID = "onnx-community/LFM2.5-VL-450M-ONNX";
const statusEl = document.querySelector("#status");
const runButton = document.querySelector("#run");
const filesEl = document.querySelector("#files");
const resultsEl = document.querySelector("#results");

let model;
let processor;

function setStatus(message){ statusEl.textContent = message; }

async function main(){
  const started = performance.now();
  setStatus("Checking WebGPU…");
  if (!navigator.gpu) throw new Error("WebGPU is unavailable in this browser.");

  const adapter = await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
  if (!adapter) throw new Error("No WebGPU adapter was returned.");

  setStatus("WebGPU available. Loading LFM2.5-VL-450M…\nFirst load downloads the model files into the browser cache.");
  processor = await AutoProcessor.from_pretrained(MODEL_ID, { revision: "main" });

  model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
    revision: "main",
    device: "webgpu",
    dtype: {
      vision_encoder: "fp32",
      embed_tokens: "fp32",
      decoder_model_merged: "q4",
    },
  });

  setStatus(`READY — LFM2.5-VL loaded locally in ${((performance.now()-started)/1000).toFixed(1)}s.\nNo external inference API. Select real product photos and run the proof.`);
  runButton.disabled = false;
}

async function analyze(file){
  const started = performance.now();
  const image = await RawImage.fromBlob(file);
  const messages = [{
    role:"user",
    content:[
      {type:"image"},
      {type:"text", text:
        "Analyze this product photo as an open-world visual understanding task. Do not assume a fixed list of product names. Identify what physical product or equipment is shown, its likely product type, its main visible characteristics, and any uncertainty. If you cannot identify the exact model, give the most specific defensible generic product type. Do not invent a brand, model number, or specification that is not visible."
      }
    ]
  }];
  const prompt = processor.apply_chat_template(messages,{add_generation_prompt:true});
  const inputs = await processor(image,prompt,{add_special_tokens:false});
  const outputs = await model.generate({
    ...inputs,
    do_sample:false,
    max_new_tokens:128,
  });
  const inputLength = inputs.input_ids.dims.at(-1);
  const generated = outputs.slice(null,[inputLength,null]);
  const text = processor.batch_decode(generated,{skip_special_tokens:true})[0];
  return {text,seconds:(performance.now()-started)/1000};
}

filesEl.addEventListener("change",()=>{
  runButton.disabled = !model || !filesEl.files.length;
});

runButton.addEventListener("click",async()=>{
  runButton.disabled=true;
  resultsEl.innerHTML="";
  for(const file of filesEl.files){
    const card=document.createElement("div");
    card.className="card";
    const title=document.createElement("h3");
    title.textContent=file.name;
    const img=document.createElement("img");
    img.src=URL.createObjectURL(file);
    const result=document.createElement("div");
    result.className="result";
    result.textContent="Analyzing…";
    card.append(title,img,result);
    resultsEl.append(card);
    try{
      const out=await analyze(file);
      result.textContent=`${out.text}\n\nInference time: ${out.seconds.toFixed(1)}s`;
    }catch(error){
      result.textContent=`FAILED: ${error?.stack || error}`;
    }
  }
  runButton.disabled=false;
});

main().catch(error=>{
  setStatus(`MODEL FAILED\n\n${error?.stack || error}`);
});
