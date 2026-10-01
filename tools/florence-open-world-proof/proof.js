import {
  env,
  AutoProcessor,
  Florence2ForConditionalGeneration,
  RawImage,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

const MODEL_PATH = "./model";
const statusEl = document.querySelector("#status");
const filesEl = document.querySelector("#files");
const runButton = document.querySelector("#run");
const resultsEl = document.querySelector("#results");

let model;
let processor;

function setStatus(message) {
  statusEl.textContent = message;
}

async function main() {
  const started = performance.now();

  if (!navigator.gpu) {
    throw new Error("WebGPU is unavailable in this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No WebGPU adapter was returned.");
  }

  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = MODEL_PATH + "/";

  setStatus("WebGPU available. Loading Florence-2 locally…");

  processor = await AutoProcessor.from_pretrained(MODEL_PATH, {
    local_files_only: true,
  });

  model = await Florence2ForConditionalGeneration.from_pretrained(MODEL_PATH, {
    local_files_only: true,
    device: "webgpu",
    dtype: {
      vision_encoder: "q4",
      embed_tokens: "q4",
      encoder_model: "q4",
      decoder_model_merged: "q4",
    },
  });

  setStatus(
    "READY — Florence-2 loaded locally in " +
      ((performance.now() - started) / 1000).toFixed(1) +
      "s.\n" +
      "No catalogue, Product IDs, fixed product labels, or external inference are used."
  );

  runButton.disabled = !filesEl.files.length;
}

async function analyze(file) {
  const started = performance.now();
  const image = await RawImage.fromBlob(file);

  const task = "<MORE_DETAILED_CAPTION>";
  const prompts = processor.construct_prompts(task);
  const inputs = await processor(image, prompts);

  const generatedIds = await model.generate({
    ...inputs,
    do_sample: false,
    max_new_tokens: 128,
  });

  const generatedText = processor.batch_decode(generatedIds, {
    skip_special_tokens: false,
  })[0];

  const parsed = processor.post_process_generation(
    generatedText,
    task,
    image.size
  );

  return {
    text: parsed?.[task] || generatedText,
    seconds: (performance.now() - started) / 1000,
  };
}

filesEl.addEventListener("change", () => {
  runButton.disabled = !model || !filesEl.files.length;
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  resultsEl.innerHTML = "";

  for (const file of filesEl.files) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = file.name;

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);

    const result = document.createElement("div");
    result.className = "result";
    result.textContent = "Analyzing…";

    card.append(title, img, result);
    resultsEl.append(card);

    try {
      const output = await analyze(file);
      result.textContent =
        output.text + "\n\nInference time: " + output.seconds.toFixed(1) + "s";
    } catch (error) {
      result.textContent = "FAILED: " + (error?.stack || error);
    }
  }

  runButton.disabled = false;
});

main().catch((error) => {
  setStatus("MODEL FAILED\n\n" + (error?.stack || error));
});
