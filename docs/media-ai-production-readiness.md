# Media AI production-readiness note

## Model license

The current browser matcher uses `Xenova/mobileclip_s0`, an ONNX conversion of MobileCLIP-S0. The Xenova model card currently reports `License: other`; the upstream Apple MobileCLIP-S0 model is under the Apple ML Research Model terms. Apple's current model terms restrict use of the model to research purposes and define research purposes as non-commercial use. citeturn4search0turn2search0

The repository's MobileCLIP software code is MIT-licensed, but the model weights are governed separately by Apple's model terms. citeturn2search2

### Gate

**Technical implementation:** PASS.

**Commercial-production license clearance for the current MobileCLIP-S0 weights:** NOT CLEARED.

The model may remain in the local development/evaluation path, but the current implementation must not be represented as commercially production-cleared until the model-license position is resolved. No paid image-search API is substituted.

## Benchmark gate

The repository now contains a benchmark manifest generator and evaluator. CI validates the manifest and evaluator logic, but does not claim a real-model accuracy percentage because the 815 MB browser checkpoint is not downloaded or executed by the CI test suite. citeturn4search2

A real benchmark run should use the local browser model against the generated manifest and record:
- Top-1 accuracy
- High-confidence precision
- unresolved rate
- false-high count
- mean similarity margin
- latency
- cache hit rate
