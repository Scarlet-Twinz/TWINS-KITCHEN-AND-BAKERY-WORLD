const test=require("node:test");
const assert=require("node:assert/strict");
const {processBatchAssets}=require("../asset-intake");

function items(count){
  return Array.from({length:count},(_,i)=>({asset:"asset-"+i+".jpg",sha256:"sha-"+i}));
}

test("10-asset batch completes with bounded concurrency and summary",async()=>{
  let active=0,maxActive=0;
  const result=await processBatchAssets(items(10),async(item)=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(r=>setTimeout(r,1));
    active--;
    return {state:"VERIFIED"};
  },{concurrency:3});
  assert.equal(result.summary.total,10);
  assert.equal(result.summary.completed,10);
  assert.equal(result.summary.matched,10);
  assert.ok(maxActive<=3);
});

test("25-asset batch completes without loading all work concurrently",async()=>{
  let calls=0,active=0,maxActive=0;
  const result=await processBatchAssets(items(25),async()=>{
    calls++;active++;maxActive=Math.max(maxActive,active);
    await new Promise(r=>setTimeout(r,1));
    active--;return {state:"REVIEW"};
  },{concurrency:4});
  assert.equal(calls,25);
  assert.equal(result.summary.review,25);
  assert.ok(maxActive<=4);
});

test("exact duplicate checksum reuses cached work",async()=>{
  let calls=0;
  const source=[{asset:"a.jpg",sha256:"same"},{asset:"b.jpg",sha256:"same"},{asset:"c.jpg",sha256:"other"}];
  const result=await processBatchAssets(source,async()=>{calls++;return {state:"VERIFIED",value:"computed"}},{concurrency:2});
  assert.equal(calls,2);
  assert.equal(result.summary.cached,1);
  assert.equal(result.results[1].cached,true);
});

test("one failed asset does not terminate the batch",async()=>{
  const result=await processBatchAssets(items(10),async(item)=>{
    if(item.asset==="asset-4.jpg")throw new Error("synthetic failure");
    return {state:"VERIFIED"};
  },{concurrency:3,retries:1});
  assert.equal(result.summary.total,10);
  assert.equal(result.summary.completed,10);
  assert.equal(result.summary.failed,1);
  assert.equal(result.results.filter(x=>x.state==="VERIFIED").length,9);
});

test("retry succeeds without failing the batch",async()=>{
  let calls=0;
  const result=await processBatchAssets([{asset:"retry.jpg",sha256:"retry"}],async()=>{
    calls++;
    if(calls===1)throw new Error("transient");
    return {state:"VERIFIED"};
  },{concurrency:1,retries:1});
  assert.equal(calls,2);
  assert.equal(result.summary.failed,0);
  assert.equal(result.results[0].attempts,2);
});

test("mixed existing, new candidate, unresolved, duplicate and rejected states are summarized",async()=>{
  const states=["VERIFIED","NEW_PRODUCT_CANDIDATE","UNRESOLVED","DUPLICATE","REJECTED"];
  const result=await processBatchAssets(states.map((state,i)=>({asset:"x"+i,sha256:"x"+i})),async(item)=>({state:states[Number(item.asset.slice(1))]}),{concurrency:2});
  assert.equal(result.summary.matched,1);
  assert.equal(result.summary.newCandidates,1);
  assert.equal(result.summary.unresolved,1);
  assert.equal(result.summary.duplicates,1);
  assert.equal(result.summary.rejected,1);
});

test("progress callback reports every completed asset and never exceeds total",async()=>{
  const events=[];
  const result=await processBatchAssets(items(25),async()=>({state:"UNRESOLVED"}),{
    concurrency:4,
    onProgress:event=>events.push({...event})
  });
  assert.equal(events.length,25);
  assert.equal(events.at(-1).completed,25);
  assert.ok(events.every(e=>e.completed<=e.total));
  assert.equal(result.summary.completed,25);
});

test("caller-provided cache can be reused across batches",async()=>{
  const cache=new Map([["known",{state:"VERIFIED",value:"cached"}]]);
  let calls=0;
  const result=await processBatchAssets([{asset:"known.jpg",sha256:"known"},{asset:"fresh.jpg",sha256:"fresh"}],async()=>{calls++;return {state:"REVIEW"}},{cache,concurrency:2});
  assert.equal(calls,1);
  assert.equal(result.summary.cached,1);
  assert.equal(result.results[0].cached,true);
});
