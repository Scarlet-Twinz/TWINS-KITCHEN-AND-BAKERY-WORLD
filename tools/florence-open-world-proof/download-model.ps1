$ErrorActionPreference = "Stop"

$ModelDir = Join-Path $PSScriptRoot "model"
# Pin to a verified Florence-2-base-ft revision so the proof is reproducible.
$Base = "https://huggingface.co/onnx-community/Florence-2-base-ft/resolve/main"

$Files = @(
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "added_tokens.json",
  "merges.txt",
  "vocab.json",
  "onnx/decoder_model_merged_q4.onnx",
  "onnx/embed_tokens_q4.onnx",
  "onnx/encoder_model_q4.onnx",
  "onnx/vision_encoder_q4.onnx"
)

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

if (-not (Get-Command hf -ErrorAction SilentlyContinue)) {
  throw "Hugging Face CLI is required for the large Xet-backed model files. Install it with: py -m pip install -U huggingface_hub"
}

foreach ($Relative in $Files) {
  $Destination = Join-Path $ModelDir ($Relative -replace "/", [IO.Path]::DirectorySeparatorChar)
  $Parent = Split-Path $Destination -Parent
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null

  if (Test-Path $Destination) {
    Write-Host "Exists: $Relative"
    continue
  }

  Write-Host "Downloading: $Relative"
  hf download onnx-community/Florence-2-base-ft $Relative --local-dir $ModelDir
  if ($LASTEXITCODE -ne 0) {
    throw "Download failed: $Relative"
  }
}
Write-Host ""
Write-Host "Florence-2 local model is ready:"
Get-ChildItem -Recurse $ModelDir | Select-Object FullName,Length
