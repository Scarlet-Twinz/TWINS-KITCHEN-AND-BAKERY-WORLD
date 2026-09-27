const test=require("node:test");
const assert=require("node:assert/strict");
const {buildPublicMediaAudit}=require("../public-media-audit");

test("public media audit never counts external URLs as publishable",()=>{
  const data={P:[
    {id:1,n:"Local",i:"assets/media/local.jpg"},
    {id:2,n:"External",i:"https://example.test/external.jpg"}
  ],byId:{},byName:{}};
  const audit=buildPublicMediaAudit({data,rules:{blocklist:{} }});
  assert.equal(audit.catalogue,2);
  assert.equal(audit.publicEligible,1);
  assert.equal(audit.externalCandidates.length,1);
  assert.deepEqual(audit.published.map(x=>x.productId),["1"]);
});

test("public media audit blocks every duplicate URL",()=>{
  const data={P:[
    {id:1,n:"One",i:"assets/media/shared.jpg"},
    {id:2,n:"Two",i:"assets/media/shared.jpg"}
  ],byId:{},byName:{}};
  const audit=buildPublicMediaAudit({data,rules:{blocklist:{}}});
  assert.equal(audit.publicEligible,0);
  assert.equal(audit.duplicateUrlGroups,1);
  assert.equal(audit.duplicateAssignments,2);
  assert.deepEqual(audit.pendingProductIds,["1","2"]);
});

test("public media audit respects strict blocklist",()=>{
  const data={P:[
    {id:1,n:"Blocked",i:"assets/media/blocked.jpg"},
    {id:2,n:"Allowed",i:"assets/media/allowed.jpg"}
  ],byId:{},byName:{}};
  const audit=buildPublicMediaAudit({data,rules:{blocklist:{"1":"mismatch"}}});
  assert.equal(audit.publicEligible,1);
  assert.deepEqual(audit.published.map(x=>x.productId),["2"]);
  assert.deepEqual(audit.pendingProductIds,["1"]);
});
