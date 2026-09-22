const test=require('node:test');const assert=require('node:assert/strict');
const {discover}=require('../discovery');const {TavilySearchProvider}=require('../discovery/sources');

test('a timed-out search request cannot hang discovery indefinitely',async()=>{
 const p={id:1,n:'Timeout Product'},state={pending:[p],counts:{catalogue:1,pending:1},resolved:[],byId:new Map([['1',p]]),blocklist:{}},started=Date.now();
 const result=await discover({state,config:{concurrency:1,maxQueriesPerProduct:1,maxResultsPerQuery:1,timeoutMs:20,retries:0,retryBackoffMs:0,requestsPerSecond:100},provider:{name:'tavily',async search(){return new Promise(()=>{});}},fetchImpl:async()=>({ok:false,status:500})});
 assert.ok(Date.now()-started<500);assert.equal(result.results.length,1);assert.equal(result.results[0].status,'UNRESOLVED');assert.match(result.results[0].searchStages[0].error,/timed out/i);
});
test('a failed product does not prevent subsequent products from completing',async()=>{
 const products=[{id:1,n:'Broken Product'},{id:2,n:'Healthy Product'}],state={pending:products,counts:{catalogue:2,pending:2},resolved:[],byId:new Map(products.map(p=>[String(p.id),p])),blocklist:{}},progress=[];let calls=0;
 const result=await discover({state,config:{concurrency:1,maxQueriesPerProduct:1,maxResultsPerQuery:1,timeoutMs:20,retries:0,retryBackoffMs:0,requestsPerSecond:100},provider:{name:'fixture',async search(){calls++;if(calls===1)throw new Error('forced failure');return[];}},fetchImpl:async()=>({ok:false,status:500}),onProgress:e=>progress.push(e)});
 assert.equal(result.results.length,2);assert.equal(result.results[0].status,'UNRESOLVED');assert.equal(result.results[1].status,'UNRESOLVED');assert.deepEqual(progress.map(x=>x.completed),[1,2]);
});
test('progress accounting reports every product exactly once',async()=>{
 const products=[{id:1,n:'One'},{id:2,n:'Two'},{id:3,n:'Three'}],state={pending:products,counts:{catalogue:3,pending:3},resolved:[],byId:new Map(products.map(p=>[String(p.id),p])),blocklist:{}},progress=[];
 await discover({state,config:{concurrency:2,maxQueriesPerProduct:1,maxResultsPerQuery:1,timeoutMs:20,retries:0,retryBackoffMs:0,requestsPerSecond:100},provider:{name:'fixture',async search(){return[];}},onProgress:e=>progress.push(e)});
 assert.deepEqual(progress.map(e=>e.completed).sort((a,b)=>a-b),[1,2,3]);assert.equal(new Set(progress.map(e=>String(e.product.id))).size,3);
});
test('Tavily timeout handling remains intact',async()=>{
 const tavily=new TavilySearchProvider({apiKey:'test-key',fetchImpl:async()=>new Promise(()=>{}),timeoutMs:20});
 await assert.rejects(()=>tavily.search('timeout'),/timed out/i);
});
