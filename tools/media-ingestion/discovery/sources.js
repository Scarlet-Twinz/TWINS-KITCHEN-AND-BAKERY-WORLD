class SearchProvider { constructor(name){this.name=name||'unknown';} async search(){throw new Error('SearchProvider.search() must be implemented');} }
class BraveSearchProvider extends SearchProvider {
  constructor(options={}) { super('brave'); this.apiKey=options.apiKey||process.env.MEDIA_SEARCH_API_KEY||''; this.endpoint=options.apiUrl||process.env.MEDIA_SEARCH_API_URL||'https://api.search.brave.com/res/v1/web/search'; this.fetchImpl=options.fetchImpl||globalThis.fetch; this.timeoutMs=options.timeoutMs||10000; }
  async search(query,options={}) {
    if(!this.apiKey) throw new Error('MEDIA_SEARCH_API_KEY is required for the Brave search provider');
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),options.timeoutMs||this.timeoutMs);
    try { const u=new URL(this.endpoint); u.searchParams.set('q',query); u.searchParams.set('count',String(options.count||5)); const r=await this.fetchImpl(u,{headers:{Accept:'application/json','X-Subscription-Token':this.apiKey},signal:controller.signal}); if(!r.ok){const e=new Error('Search provider returned HTTP '+r.status);e.status=r.status;throw e;} const body=await r.json(); const rows=Array.isArray(body.web&&body.web.results)?body.web.results:[]; return rows.map(x=>({url:typeof x.url==='string'?x.url:'',title:typeof x.title==='string'?x.title:'',snippet:typeof x.description==='string'?x.description:'',provider:this.name})).filter(x=>x.url); } finally { clearTimeout(timer); }
  }
}
function createSearchProvider(config,overrides={}) { const name=String(config.provider||'brave').toLowerCase(); if(overrides[name]) return overrides[name]; if(name==='brave') return new BraveSearchProvider(config); throw new Error('Unsupported MEDIA_SEARCH_PROVIDER: '+name); }
module.exports={SearchProvider,BraveSearchProvider,createSearchProvider};