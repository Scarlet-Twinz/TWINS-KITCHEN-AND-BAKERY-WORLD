function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
class RateLimiter { constructor(rps=2){this.interval=1000/Math.max(1,rps);this.nextAt=0;} async wait(){const now=Date.now();const delay=Math.max(0,this.nextAt-now);this.nextAt=Math.max(now,this.nextAt)+this.interval;if(delay) await sleep(delay);} }
async function fetchPage(url,options={}) {
 if(!/^https?:\\/\\//i.test(url)) return {ok:false,status:0,url,error:'invalid-url'};
 const fetchImpl=options.fetchImpl||globalThis.fetch;if(typeof fetchImpl!=='function') return {ok:false,status:0,url,error:'fetch-unavailable'};
 const timeoutMs=options.timeoutMs||10000,retries=options.retries??0,backoff=options.backoffMs??500;
 for(let attempt=0;attempt<=retries;attempt++){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const r=await fetchImpl(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':'TwinsMediaDiscovery/1.0'}});if(r.status===403||r.status===404)return {ok:false,status:r.status,url,error:r.status===403?'forbidden':'not-found'};if(!r.ok){if(attempt<retries){await sleep(backoff*2**attempt);continue;}return {ok:false,status:r.status,url,error:'http-'+r.status};}const html=await r.text();return {ok:true,status:r.status,url:r.url||url,html,contentType:r.headers?.get?.('content-type')||''};}catch(e){if(attempt<retries){await sleep(backoff*2**attempt);continue;}return {ok:false,status:0,url,error:e.name==='AbortError'?'timeout':'fetch-error'};}finally{clearTimeout(timer);}}
 return {ok:false,status:0,url,error:'unreachable'};
}
module.exports={sleep,RateLimiter,fetchPage};