const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  loadCatalogue, readExistingRules, computeMediaState
} = require("../validator");
const {
  buildPendingAssetManifest, discoverLocalAssets, inspectImage, fileSha256,
  processAsset, processAssets, scoreAssetAgainstProduct, buildAppliedManifest,
  expectedAssetPath
} = require("../asset-intake");

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "twins-asset-intake-")); }
function pngBuffer(width=800,height=600) {
  const b=Buffer.alloc(24); Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(b,0); b.writeUInt32BE(13,8); Buffer.from("IHDR").copy(b,12); b.writeUInt32BE(width,16); b.writeUInt32BE(height,20); return b;
}
function jpegBuffer(width=800,height=600) {
  const b=Buffer.alloc(25); b[0]=0xff;b[1]=0xd8;b[2]=0xff;b[3]=0xc0;b.writeUInt16BE(17,4);b[6]=8;b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);b[11]=3; return b;
}
function webpBuffer(width=800,height=600) {
  const b=Buffer.alloc(30); Buffer.from("RIFF").copy(b,0); b.writeUInt32LE(22,4); Buffer.from("WEBPVP8X").copy(b,8); b[20]=0; b.writeUIntLE(width-1,24,3); b.writeUIntLE(height-1,27,3); return b;
}
function makeAsset(root, relative, buffer=pngBuffer()) {
  const file=path.join(root,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,buffer); return file;
}
function pendingState() { return computeMediaState(loadCatalogue(), readExistingRules()); }

test("pending asset manifest is deterministic, dynamic, and includes expected paths", () => {
  const a=buildPendingAssetManifest(); const b=buildPendingAssetManifest();
  assert.deepEqual(a,b);
  assert.equal(a.catalogue.population,530);
  assert.equal(a.counts.pending,304);
  assert.equal(a.products.length,a.counts.pending);
  assert.ok(a.products.every(x=>x.currentMediaStatus==="PENDING"));
  assert.ok(a.products.every(x=>x.expectedAssetPath.startsWith("supplier-assets/")));
  assert.equal(a.products[0].productId, [...a.products].sort((x,y)=>Number(x.productId)-Number(y.productId))[0].productId);
});

test("expected asset path is deterministic", () => {
  assert.equal(expectedAssetPath({id:58,n:"Planetary Mixer 20L"}),"supplier-assets/58-planetary-mixer-20l.jpg");
});

test("local asset discovery is recursive and supports jpg jpeg png webp", () => {
  const root=tempDir();
  makeAsset(root,"supplier-a/a.jpg",jpegBuffer());
  makeAsset(root,"supplier-a/b.jpeg",jpegBuffer());
  makeAsset(root,"supplier-b/c.png",pngBuffer());
  makeAsset(root,"supplier-b/d.webp",webpBuffer());
  makeAsset(root,"supplier-b/readme.txt",Buffer.from("ignore"));
  const result=discoverLocalAssets(root);
  assert.equal(result.assets.filter(x=>!x.ignored).length,4);
  assert.equal(result.unsupported.length,1);
});

test("obvious placeholder/logo/icon/banner files are ignored", () => {
  const root=tempDir();
  makeAsset(root,"logo.png"); makeAsset(root,"commercial-oven.jpg");
  const result=discoverLocalAssets(root);
  assert.equal(result.assets.find(x=>x.relativePath==="logo.png").ignored,true);
  assert.equal(result.assets.find(x=>x.relativePath==="commercial-oven.jpg").ignored,false);
});

test("image validator rejects unsupported, corrupt, and undersized files", () => {
  const root=tempDir();
  const txt=makeAsset(root,"bad.jpg",Buffer.from("not an image"));
  const tiny=makeAsset(root,"tiny.png",pngBuffer(20,20));
  assert.match(inspectImage(txt).reason,/valid supported image/i);
  assert.match(inspectImage(tiny).reason,/minimum/i);
});

test("image validator accepts jpeg png and webp headers", () => {
  const root=tempDir();
  assert.equal(inspectImage(makeAsset(root,"a.jpg",jpegBuffer())).valid,true);
  assert.equal(inspectImage(makeAsset(root,"b.png",pngBuffer())).valid,true);
  assert.equal(inspectImage(makeAsset(root,"c.webp",webpBuffer())).valid,true);
});

test("explicit productId has precedence and can become VERIFIED with authorized provenance", () => {
  const state=pendingState(), root=tempDir(), product=state.pending.find(p=>String(p.id)==="58") || state.pending[0];
  const rel="supplier-a/planetary-mixer-20l.jpg"; const file=makeAsset(root,rel);
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map([[rel,{productId:String(product.id),source:"Supplier A",sourceUrl:"https://supplier.example/item",rights:"supplier-authorized"}]]),{existingHashes:new Map(),seenHashes:new Map()});
  assert.equal(result.state,"VERIFIED");
  assert.equal(result.productId,String(product.id));
});

test("filename matching is deterministic", () => {
  const asset={absolutePath:"/tmp/commercial-oven.jpg",relativePath:"commercial-oven.jpg"};
  const product={id:999,n:"Commercial Oven",c:"Bakery Equipment",type:"oven"};
  const scored=scoreAssetAgainstProduct(asset,product);
  assert.ok(scored.match.nameScore>=0.5);
  assert.equal(scoreAssetAgainstProduct(asset,product).match.score,scored.match.score);
});

test("model matching contributes to existing scoring architecture", () => {
  const scored=scoreAssetAgainstProduct({absolutePath:"/tmp/b20.jpg",relativePath:"planetary-mixer-b20.jpg"},{id:1,n:"Planetary Mixer 20L",model:"B20",capacity:"20L"});
  assert.equal(scored.match.modelMatch,true);
});

test("capacity matching contributes to existing scoring architecture", () => {
  const scored=scoreAssetAgainstProduct({absolutePath:"/tmp/20l.jpg",relativePath:"planetary-mixer-20l.jpg"},{id:1,n:"Planetary Mixer 20L",capacity:"20L"});
  assert.equal(scored.match.capacityMatch,true);
});

test("ambiguous fuzzy matching becomes REVIEW instead of guessing", () => {
  const root=tempDir(); const state={pending:[{id:1,n:"Mixer"},{id:2,n:"Mixer"}],byId:new Map([["1",{id:1,n:"Mixer"}],["2",{id:2,n:"Mixer"}]]),mappedIds:new Set(),blocklist:{},resolved:[]};
  const rel="mixer.jpg"; const file=makeAsset(root,rel);
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map(),{existingHashes:new Map(),seenHashes:new Map()});
  assert.ok(["REVIEW","UNRESOLVED"].includes(result.state));
});

test("duplicate asset content is rejected within an intake", () => {
  const root=tempDir(); const a=makeAsset(root,"a/oven.png"), b=makeAsset(root,"b/oven.png");
  const state=pendingState(), seen=new Map(), explicit=new Map();
  const first=processAsset({absolutePath:a,relativePath:"a/oven.png"},state,explicit,{existingHashes:new Map(),seenHashes:seen});
  const second=processAsset({absolutePath:b,relativePath:"b/oven.png"},state,explicit,{existingHashes:new Map(),seenHashes:seen});
  assert.notEqual(first.state,"REJECTED");
  assert.equal(second.state,"REJECTED");
  assert.match(second.reason,/duplicated within this intake/i);
});

test("existing mapped product is protected", () => {
  const root=tempDir(), state=pendingState(), rel="mapped.jpg", file=makeAsset(root,rel);
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map([[rel,{productId:"1",rights:"owned"}]]),{existingHashes:new Map(),seenHashes:new Map()});
  assert.equal(result.state,"REJECTED");
  assert.match(result.reason,/existing media mapping/i);
});

test("legacy duplicate mappings remain untouched", () => {
  const data=loadCatalogue(), before=data.rawIdPairs.map(x=>x.slice());
  processAssets(tempDir(),data,readExistingRules(),new Map());
  assert.deepEqual(data.rawIdPairs,before);
});

test("missing provenance produces REVIEW", () => {
  const state=pendingState(), root=tempDir(), product=state.pending[0], rel="candidate.jpg", file=makeAsset(root,rel);
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map(),{existingHashes:new Map(),seenHashes:new Map()});
  assert.equal(result.state,"REVIEW");
  assert.equal(result.provenance.rights,"unknown");
});

test("unknown or non-authorizing rights cannot become VERIFIED", () => {
  const state=pendingState(), root=tempDir(), product=state.pending[0], rel="candidate.jpg", file=makeAsset(root,rel);
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map([[rel,{productId:String(product.id),source:"Supplier",rights:"unknown"}]]),{existingHashes:new Map(),seenHashes:new Map()});
  assert.equal(result.state,"REVIEW");
});

test("invalid image is REJECTED", () => {
  const state=pendingState(), root=tempDir(), product=state.pending[0], rel="candidate.jpg", file=makeAsset(root,rel,Buffer.from("fake"));
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map([[rel,{productId:String(product.id),rights:"owned"}]]),{existingHashes:new Map(),seenHashes:new Map()});
  assert.equal(result.state,"REJECTED");
});

test("unresolvable product association is UNRESOLVED", () => {
  const state={pending:[{id:1,n:"Completely Different Product"}],byId:new Map([["1",{id:1,n:"Completely Different Product"}]]),mappedIds:new Set(),blocklist:{},resolved:[]};
  const root=tempDir(), rel="planetary-mixer.jpg", file=makeAsset(root,rel);
  const result=processAsset({absolutePath:file,relativePath:rel},state,new Map(),{existingHashes:new Map(),seenHashes:new Map()});
  assert.equal(result.state,"UNRESOLVED");
});

test("bulk processing handles 100 local assets without external search", () => {
  const root=tempDir(), state=pendingState();
  for(let i=0;i<100;i++) makeAsset(root,"supplier-"+(i%5)+"/asset-"+i+".png",pngBuffer(800,600));
  const report=processAssets(root,loadCatalogue(),readExistingRules(),new Map());
  assert.equal(report.externalSearch,false);
  assert.equal(report.counts.assetsDiscovered,100);
  assert.equal(report.results.length,100);
});

test("dry-run processing does not modify data.js or app.js", () => {
  const dataPath=path.join(__dirname,"..","..","..","data.js");
  const appPath=path.join(__dirname,"..","..","..","app.js");
  const beforeData=fs.readFileSync(dataPath,"utf8"), beforeApp=fs.readFileSync(appPath,"utf8");
  const report=processAssets(tempDir(),loadCatalogue(),readExistingRules(),new Map());
  assert.equal(report.counts.assetsDiscovered,0);
  assert.equal(fs.readFileSync(dataPath,"utf8"),beforeData);
  assert.equal(fs.readFileSync(appPath,"utf8"),beforeApp);
});

test("apply manifest contains only VERIFIED results and refuses duplicate product/hash", () => {
  const out=path.join(tempDir(),"applied.json");
  const report={results:[
    {state:"VERIFIED",productId:"999",productName:"Example",asset:"example.jpg",assetSha256:"abc",provenance:{source:"Supplier",sourceUrl:"https://supplier.example/p",rights:"supplier-authorized"},reason:"verified"}
  ]};
  const first=buildAppliedManifest(report,out);
  assert.equal(first.assets.length,1);
  assert.equal(first.assets[0].verificationStatus,"VERIFIED");
  assert.throws(()=>buildAppliedManifest(report,out),/already exists/i);
});

test("applied manifest is a separate ledger and does not mutate data.js", () => {
  const dataPath=path.join(__dirname,"..","..","..","data.js"), before=fs.readFileSync(dataPath,"utf8");
  const out=path.join(tempDir(),"applied.json");
  buildAppliedManifest({results:[{state:"VERIFIED",productId:"999",productName:"Example",asset:"example.jpg",assetSha256:fileSha256(__filename),provenance:{rights:"owned"},reason:"verified"}]},out);
  assert.equal(fs.readFileSync(dataPath,"utf8"),before);
});
