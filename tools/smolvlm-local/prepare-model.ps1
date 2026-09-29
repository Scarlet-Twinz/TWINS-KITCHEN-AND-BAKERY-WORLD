$ErrorActionPreference="Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$model = Join-Path $root "model"
$onnx = Join-Path $model "onnx"
New-Item -ItemType Directory -Force -Path $onnx | Out-Null

$source = Join-Path $env:USERPROFILE "twins-smolvlm-proof"
Copy-Item (Join-Path $source "vision_encoder_q4.test.onnx") (Join-Path $onnx "vision_encoder_q4.onnx") -Force
Copy-Item (Join-Path $source "decoder_model_merged_q4.onnx") (Join-Path $onnx "decoder_model_merged_q4.onnx") -Force
Copy-Item (Join-Path $source "embed_tokens_q4.onnx") (Join-Path $onnx "embed_tokens_q4.onnx") -Force

$base="https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct/resolve/main"
$metadata=@(
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "processor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "chat_template.jinja"
)
foreach($name in $metadata){
  $target=Join-Path $model $name
  try {
    Invoke-WebRequest -Uri "$base/$name" -OutFile $target
    Write-Host "Downloaded $name"
  } catch {
    if($name -eq "config.json"){ throw }
    Write-Warning "Optional processor file unavailable: $name"
  }
}
Write-Host ""
Write-Host "SmolVLM local model prepared at $model"
Get-ChildItem $onnx | Select-Object Name,Length
