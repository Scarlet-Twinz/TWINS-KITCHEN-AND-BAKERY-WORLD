const {loadCatalogue,readExistingRules,computeMediaState}=require('./validator');
const {loadDiscoveryConfig}=require('./discovery/config');
const {createSearchProvider}=require('./discovery/sources');
const {fetchPage,probeImage,RateLimiter}=require('./discovery/fetch');
const {extractEvidence}=require('./discovery/extract');
const {matchProduct}=require('./discovery/matcher');
const {classifyMatch}=require('./discovery/scorer');
const {buildExistingUrlSet,checkDuplicate}=require('./discovery/dedupe');
function quote(v){return '"' + String(v||'').trim().replace(/"/g,'') + '"';}
function queryTerms(p){
  const n=String(p.n||'').trim();
  if(!n)return[];
  const identity=[p.model,p.capacity].map(v=>String(v||'').trim()).filter(Boolean);
  const context=[p.type,p.productType,p.tag,p.c,p.spec].map(v=>String(v||'').trim()).filter(Boolean);
  const ctx=[...new Set(context)].slice(0,3);
  const contextText=ctx.map(quote).join(' ');
  const identityText=identity.map(quote).join(' ');
  const q=[];
  if(identityText)q.push([quote(n),identityText,'product page'].join(' '));
  else if(contextText)q.push([quote(n),contextText,'product page'].join(' '));
  else q.push([quote(n),'product page'].join(' '));
  q.push([quote(n),contextText,'manufacturer'].filter(Boolean).join(' '));
  q.push([quote(n),contextText,'distributor retailer product'].filter(Boolean).join(' '));
  q.push([quote(n),contextText,identityText,quote(p.spec),'product'].filter(Boolean).join(' '));
  return [...new Set(q)].filter(Boolean);
}
function val(e,f){return e?.fields?.[f]?.value||'';}
function contextOverlap(product,evidence){
  const catalogueContext=[product.c,product.type,product.productType,product.tag,product.model,product.capacity,product.spec].filter(Boolean).join(' ');
  const sourceContext=[val(evidence,'brand'),val(evidence,'model'),val(evidence,'category'),val(evidence,'description'),val(evidence,'capacity'),val(evidence,'dimensions')].filter(Boolean).join(' ');
  return overlap(catalogueContext,sourceContext);
}
function isCandidateRelevant(product,evidence,match){
  const nameTokens=String(product.n||'').trim().split(/\\s+/).filter(Boolean);
  const hasCatalogueContext=[product.c,product.type,product.productType,product.tag,product.model,product.capacity,product.spec].some(Boolean);
  if(nameTokens.length<=2&&hasCatalogueContext)return contextOverlap(product,evidence)>0;
  return match.contextScore>0;
}
function pageQuality(candidate,evidence,match,product){
  const raw=String(candidate?.url||'').toLowerCase();
  let host='',path='';
  try{const u=new URL(raw);host=u.hostname;path=u.pathname;}catch{}
  let score=0;
  if(/\\/(?:product|products|item|shop|store|sku|model)(?:\\/|$)/i.test(path))score+=5;
  if(/\\/(?:p)(?:\\/|$)/i.test(path))score+=4;
  if(/(?:product|item|sku|model)/i.test(String(candidate?.title||'')))score+=2;
  if(evidence?.fields?.name)score+=2;
  if(evidence?.fields?.brand)score+=1;
  if(evidence?.fields?.model)score+=1;
  if(evidence?.images?.some(x=>/(json-ld|open-graph|product|gallery)/i.test(x.source)))score+=1;
  if(match?.modelMatch)score+=4;
  if(match?.capacityMatch)score+=3;
  if((match?.contextScore||0)>=.5)score+=2;
  if((match?.nameScore||0)>=.9)score+=2;
  if(/\\/(?:category|categories|collection|collections|blog|article|news|about|directory|directories|search|tag|tags|company|companies)(?:\\/|$)/i.test(path))score-=6;
  if(/(?:shutterstock|istockphoto|gettyimages|alamy|freepik|unsplash|pexels|pixabay|depositphotos|dreamstime)\\./i.test(host))score-=10;
  if(/(?:software|3d|animation|gaming|game|market-report|market-reporting|news|article|tutorial)/i.test(String(candidate?.title||'')+' '+String(evidence?.fields?.description?.value||'')))score-=8;\n  if(/(?:official site|manufacturer|catalog|catalogue|solutions|company profile)/i.test(String(candidate?.title||''))&&!/\\/(?:product|products|item|shop|store|sku|model)(?:\\/|$)/i.test(path))score-=3;
  if(product&&String(product.n||'').trim().split(/\\s+/).length<=2&&contextOverlap(product,evidence)===0)score-=8;
  return score;
}
function rankCandidate(item){const statusRank=item?.classification?.status==='HIGH'?2:item?.classification?.status==='REVIEW'?1:0;return [pageQuality(item?.candidate,item?.evidence,item?.match,item?.product),statusRank,Number(item?.classification?.confidence||0)];}
async function withConcurrency(items,limit,worker){const out=new Array(items.length);let cursor=0;async function run(){while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return out;}
function pickImages(images){return images.filter(x=>!/(logo|icon|banner|placeholder|sprite|avatar)/i.test(x.url)).sort((a,b)=>Number(/json-ld|open-graph|product|gallery/i.test(b.source))-Number(/json-ld|open-graph|product|gallery/i.test(a.source)));}
async function discoverProduct(product,ctx){const found=[];const searchStages=[];for(const q of queryTerms(product).slice(0,ctx.config.maxQueriesPerProduct)){await ctx.rateLimiter.wait();let rows=[];try{rows=await ctx.provider.search(q,{count:ctx.config.maxResultsPerQuery,timeoutMs:ctx.config.timeoutMs});}catch(e){searchStages.push({query:q,status:'ERROR',error:e.message,reason:e.message,provider:ctx.provider.name});continue;}if(!Array.isArray(rows)){const error='Search provider contract violation: search() must return an array';searchStages.push({query:q,status:'ERROR',error,reason:error,provider:ctx.provider.name});continue;}if(rows.length===0){const reason='Search provider returned 0 results';searchStages.push({query:q,status:'NO_RESULTS',error:reason,reason,provider:ctx.provider.name});continue;}searchStages.push({query:q,status:'RESULTS',resultCount:rows.length,provider:ctx.provider.name});for(const r of rows){if(!r.url||!/^https?:\/\//i.test(r.url)||found.some(x=>x.url===r.url))continue;found.push({...r});}}const evaluated=[];for(const c of found.filter(x=>x.url)){await ctx.rateLimiter.wait();const page=await fetchPage(c.url,{fetchImpl:ctx.fetchImpl,timeoutMs:ctx.config.timeoutMs,retries:ctx.config.retries,backoffMs:ctx.config.retryBackoffMs});if(!page.ok){evaluated.push({candidate:c,inaccessible:page.error,status:page.status});continue;}const evidence=extractEvidence(page.html,page.url);const imageCandidates=pickImages(evidence.images);let imageUrl='';let imageFailure='';for(const image of imageCandidates){const probe=await probeImage(image.url,{fetchImpl:ctx.fetchImpl,timeoutMs:ctx.config.timeoutMs});if(probe.ok){imageUrl=image.url;break;}imageFailure=probe.error;}const match=matchProduct(product,evidence);const relevant=isCandidateRelevant(product,evidence,match);const classification=imageUrl?(relevant?classifyMatch(match,evidence):{status:'UNRESOLVED',confidence:0,reason:'generic product name lacks matching catalogue context'}):{status:'UNRESOLVED',confidence:0,reason:imageFailure?'image inaccessible: '+imageFailure:'no trustworthy product image extracted'};if(!imageUrl){evaluated.push({candidate:c,evidence,match,classification});continue;}const dup=checkDuplicate(imageUrl,ctx.existingUrls,ctx.seenUrls);if(!dup.ok){evaluated.push({candidate:c,evidence,match,classification,duplicate:dup.reason});continue;}evaluated.push({candidate:c,evidence,match,product,classification,imageUrl:dup.url});}
const acceptable=evaluated.filter(x=>(x.classification?.status==='HIGH'||x.classification?.status==='REVIEW')&&x.imageUrl).sort((a,b)=>{const ar=rankCandidate(a),br=rankCandidate(b);for(let i=0;i<ar.length;i++)if(br[i]!==ar[i])return br[i]-ar[i];return String(a.candidate?.url||'').localeCompare(String(b.candidate?.url||''));});const best=acceptable[0];if(!best)return {productId:String(product.id),productName:String(product.n||''),status:'UNRESOLVED',confidence:0,candidate:null,reasons:['no acceptable candidate'],searchStages,evaluated:evaluated.map(x=>({url:x.candidate?.url||'',query:x.query||'',status:x.classification?.status||'INACCESSIBLE',error:x.inaccessible||x.searchError||'',reason:x.classification?.reason||x.duplicate||x.searchError||''}))};ctx.seenUrls.add(best.imageUrl);return {productId:String(product.id),productName:String(product.n||''),status:best.classification.status,confidence:best.classification.confidence,candidate:{imageUrl:best.imageUrl||null,sourceUrl:best.candidate.url,sourceProvider:best.candidate.provider||ctx.provider.name,discoveredAt:ctx.discoveredAt,catalogueEvidence:{productId:String(product.id),name:String(product.n||''),category:String(product.c||''),type:String(product.type||product.productType||product.tag||''),capacity:String(product.capacity||''),model:String(product.model||''),specification:String(product.spec||'')},sourceEvidence:best.evidence.fields,imageEvidence:best.evidence.images,matching:best.match,reason:best.classification.reason},reasons:[best.classification.reason],searchStages,evaluated:evaluated.map(x=>({url:x.candidate?.url||'',query:x.query||'',status:x.classification?.status||'INACCESSIBLE',error:x.inaccessible||x.searchError||'',reason:x.classification?.reason||x.duplicate||x.searchError||''}))};}
function buildProposal(results,state,config){return {schemaVersion:1,proposalType:'catalogue-wide-media-discovery',generatedAt:'deterministic-runtime',catalogue:{population:state.counts.catalogue,pendingAtStart:state.counts.pending},config:{provider:config.provider,concurrency:config.concurrency,maxQueriesPerProduct:config.maxQueriesPerProduct,maxResultsPerQuery:config.maxResultsPerQuery,timeoutMs:config.timeoutMs,retries:config.retries,retryBackoffMs:config.retryBackoffMs,requestsPerSecond:config.requestsPerSecond},results:results.slice().sort((a,b)=>Number(a.productId)-Number(b.productId))};}
async function discover(options={}){const data=options.data||loadCatalogue();const rules=options.rules||readExistingRules();const state=options.state||computeMediaState(data,rules);const config=options.config||loadDiscoveryConfig();const provider=options.provider||createSearchProvider(config,options.providers);const requestedIds=Array.isArray(options.productIds)?new Set(options.productIds.map(String)):null;const eligible=requestedIds?state.pending.filter(p=>requestedIds.has(String(p.id))):state.pending;const pending=eligible.slice(0,config.maxProducts>0?config.maxProducts:undefined);const ctx={config,provider,fetchImpl:options.fetchImpl||globalThis.fetch,existingUrls:buildExistingUrlSet(state),seenUrls:new Set(),rateLimiter:options.rateLimiter||new RateLimiter(config.requestsPerSecond),discoveredAt:options.discoveredAt||new Date().toISOString()};return buildProposal(await withConcurrency(pending,config.concurrency,p=>discoverProduct(p,ctx)),state,config);}
module.exports={queryTerms,contextOverlap,isCandidateRelevant,pageQuality,rankCandidate,withConcurrency,discoverProduct,buildProposal,discover};