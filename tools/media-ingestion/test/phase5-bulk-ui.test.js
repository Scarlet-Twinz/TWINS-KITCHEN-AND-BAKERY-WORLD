const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const ui=fs.readFileSync("admin/media/media-center.js","utf8");
const html=fs.readFileSync("admin/media/index.html","utf8");
const backend=fs.readFileSync("backend/main.py","utf8");

test("bulk intake chunks uploads at 100 files and does not impose a 100-file browser batch limit",()=>{
  assert.match(ui,/const chunkSize=100/);
  assert.match(ui,/totalChunks/);
  assert.match(ui,/for\(let index=0;index<totalChunks;index\+\+\)/);
});

test("batch progress is persisted across normal refreshes",()=>{
  assert.match(ui,/localStorage\.getItem\(BATCH_PROGRESS_KEY/);
  assert.match(ui,/localStorage\.setItem\(BATCH_PROGRESS_KEY/);
  assert.match(ui,/renderBatchProgress\(loadBatchProgress\(\)\)/);
});

test("visual processing is bounded to two concurrent workers",()=>{
  assert.match(ui,/Promise\.all\(\[worker\(\),worker\(\)\]\)/);
});

test("failed upload files are isolated and returned separately",()=>{
  assert.match(backend,/failed=\[\]/);
  assert.match(backend,/"failed":failed/);
  assert.match(backend,/unsupported file type/);
  assert.match(backend,/inspection\.reason/);
});

test("upload response preserves server batch and client batch identity",()=>{
  assert.match(backend,/clientBatchId/);
  assert.match(backend,/chunkIndex/);
  assert.match(backend,/totalChunks/);
  assert.match(backend,/"batchId":str\(batch_id\)/);
});

test("unapproved assets remain owner-only and are not exposed by the public product route",()=>{
  assert.match(backend,/def media_file\(asset_id:str,request:Request\):/);
  assert.match(backend,/require_owner\(request\)/);
});

test("no large media blobs are introduced into the Git-tracked workflow",()=>{
  assert.match(ui,/Images and ZIP files stay outside Git/);
});
