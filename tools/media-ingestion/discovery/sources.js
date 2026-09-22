class SearchProvider { constructor(name){this.name=name||'unknown';} async search(){throw new Error('SearchProvider.search() must be implemented');} }
async function timedFetch(fetchImpl,input,options,timeoutMs){
  const controller=new AbortController();let timer;
  try{return await Promise.race([
    Promise.resolve().then(()=>fetchImpl(input,{...options,signal:controller.signal})),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Search request timed out'));},timeoutMs);})
  ]);}finally{clearTimeout(timer);}
}
class BraveSearchProvider extends SearchProvider {
  constructor(options={}){super('brave');this.apiKey=options.apiKey||process.env.MEDIA_SEARCH_API_KEY||'';this.endpoint=options.apiUrl||process.env.MEDIA_SEARCH_API_URL||'https://api.search.brave.com/res/v1/web/search';this.fetchImpl=options.fetchImpl||globalThis.fetch;this.timeoutMs=options.timeoutMs||10000;}
  async search(query,options={}){
    if(!this.apiKey)throw new Error('MEDIA_SEARCH_API_KEY is required for the Brave search provider');
    const u=new URL(this.endpoint);u.searchParams.set('q',query);u.searchParams.set('count',String(options.count||5));const timeoutMs=options.timeoutMs||this.timeoutMs;
    try{
      const r=await timedFetch(this.fetchImpl,u,{headers:{Accept:'application/json','X-Subscription-Token':this.apiKey}},timeoutMs);
      if(!r.ok){const e=new Error('Search provider returned HTTP '+r.status);e.status=r.status;throw e;}
      const body=await withResponseTimeout(r.json(),timeoutMs,'Brave search response timed out');
      const rows=Array.isArray(body.web&&body.web.results)?body.web.results:[];
      return rows.map(x=>({url:typeof x.url==='string'?x.url:'',title:typeof x.title==='string'?x.title:'',snippet:typeof x.description==='string'?x.description:'',provider:this.name})).filter(x=>x.url);
    }catch(e){if(/timed out/i.test(e?.message||''))throw new Error('Brave search request timed out');throw e;}
  }
}
async function withResponseTimeout(promise,timeoutMs,message){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs);})]);}finally{clearTimeout(timer);}
}
class TavilySearchProvider extends SearchProvider {
  constructor(options={}){super('tavily');this.apiKey=options.apiKey||process.env.MEDIA_SEARCH_API_KEY||'';this.endpoint=options.apiUrl||process.env.MEDIA_SEARCH_API_URL||'https://api.tavily.com/search';this.fetchImpl=options.fetchImpl||globalThis.fetch;this.timeoutMs=options.timeoutMs||10000;}
  async search(query,options={}){
    if(!this.apiKey)throw new Error('MEDIA_SEARCH_API_KEY is required for the Tavily search provider');
    if(typeof this.fetchImpl!=='function')throw new Error('fetch is unavailable for the Tavily search provider');
    const timeoutMs=options.timeoutMs||this.timeoutMs;
    try{
      const response=await timedFetch(this.fetchImpl,this.endpoint,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+this.apiKey},body:JSON.stringify({query,search_depth:'basic',max_results:options.count||5})},timeoutMs);
      if(!response.ok){const error=new Error('Tavily search provider returned HTTP '+response.status);error.status=response.status;throw error;}
      const body=await withResponseTimeout(response.json(),timeoutMs,'Tavily search response timed out');
      if(!body||typeof body!=='object'||!Array.isArray(body.results))throw new Error('Malformed Tavily search response: results array is missing');
      const normalized=body.results.map(result=>({url:typeof result?.url==='string'?result.url.trim():'',title:typeof result?.title==='string'?result.title:'',snippet:typeof result?.content==='string'?result.content:'',provider:this.name})).filter(result=>result.url);
      if(body.results.length>0&&normalized.length===0)throw new Error('Malformed Tavily search response: results contained no usable URL fields');
      return normalized;
    }catch(error){if(/timed out/i.test(error?.message||'')||error?.name==='AbortError')throw new Error('Tavily search request timed out');throw error;}
  }
}
function createSearchProvider(config,overrides={}){const name=String(config.provider||'brave').toLowerCase();if(overrides[name])return overrides[name];if(name==='brave')return new BraveSearchProvider(config);if(name==='tavily')return new TavilySearchProvider(config);throw new Error('Unsupported MEDIA_SEARCH_PROVIDER: '+name);}
module.exports={SearchProvider,BraveSearchProvider,TavilySearchProvider,createSearchProvider};
