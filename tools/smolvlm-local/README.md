# Local SmolVLM open-world layer

This is an isolated local inference service for the Media Center. It uses the official
HuggingFaceTB/SmolVLM-500M-Instruct ONNX model with q4 vision, q4 decoder, and q4
token embeddings. No inference request leaves the machine.

## Setup

From this directory:

    npm install
    powershell -ExecutionPolicy Bypass -File .\prepare-model.ps1
    npm start

The service listens on http://127.0.0.1:8787.

The browser Media Center treats this service as optional. Existing MobileCLIP/reference
matching remains the first-stage catalogue matcher. SmolVLM is only an open-world
semantic fallback for unassigned assets and never changes a canonical product ID.

The model directory is intentionally ignored from Git because it contains large ONNX
weights. Only metadata/code is committed.

## Required local proof

Use the Media Center with 3–4 real product photographs, including at least one product
that has no catalogue/reference match. The VLM result records filename, model,
modelVersion, productName, category, description, visibleAttributes, confidence, status,
catalogueReference=NONE, and inferenceMs.
