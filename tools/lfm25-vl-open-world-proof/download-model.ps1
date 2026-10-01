$ErrorActionPreference = "Stop"

$ModelDir = Join-Path $PSScriptRoot "model"
$Base = "https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX/resolve/main"

$Files = @(
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "processor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "chat_template.jinja",
  "onnx/decoder_model_merged_q4.onnx",
  "onnx/decoder_model_merged_q4.onnx_data",
  "onnx/embed_tokens_q4.onnx",
  "onnx/embed_tokens_q4.onnx_data",
  "onnx/vision_encoder_q4.onnx",
  "onnx/vision_encoder_q4.onnx_data"
)

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

foreach ($Relative in $Files) {
  $Destination = Join-Path $ModelDir ($Relative -replace "/", [IO.Path]::DirectorySeparatorChar)
  $Parent = Split-Path $Destination -Parent
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null

  if (Test-Path $Destination) {
    Write-Host "Exists: $Relative"
    continue
  }

  $Url = "$Base/$Relative?download=true"
  Write-Host "Downloading: $Relative"
  curl.exe --fail --location --retry 5 --retry-delay 2 --http1.1 --output $Destination $Url
  if ($LASTEXITCODE -ne 0) {
    throw "Download failed: $Relative"
  }
}

Write-Host ""
Write-Host "LFM2.5-VL local model is ready:"
Get-ChildItem -Recurse $ModelDir | Select-Object FullName,Length
