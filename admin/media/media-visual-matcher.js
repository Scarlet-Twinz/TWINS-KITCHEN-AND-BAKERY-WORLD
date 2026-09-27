(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.TwinsMediaVisualMatcher=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const DEFAULTS={highThreshold:0.86,mediumThreshold:0.72,highMargin:0.08,mediumMargin:0.03,maxSuggestions:5};
  function normalize(values){const sum=values.reduce((a,b)=>a+Math.max(0,Number(b)||0),0);return sum?values.map(v=>Math.max(0,Number(v)||0)/sum):values.map(()=>0);}
  function histogramIntersection(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return 0;const left=normalize(a),right=normalize(b);return left.reduce((sum,v,i)=>sum+Math.min(v,right[i]),0);}
  function cosineSimilarity(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return 0;let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){const x=Number(a[i])||0,y=Number(b[i])||0;dot+=x*y;na+=x*x;nb+=y*y;}return na&&nb?dot/(Math.sqrt(na)*Math.sqrt(nb)):0;}
  function visualSimilarity(a,b){
    if(!a||!b)return 0;
    const color=histogramIntersection(a.colorHistogram,b.colorHistogram);
    const gray=histogramIntersection(a.grayHistogram,b.grayHistogram);
    const spatial=cosineSimilarity(a.spatial,b.spatial);
    const edge=histogramIntersection(a.edgeHistogram,b.edgeHistogram);
    const thumb=cosineSimilarity(a.thumbnail,b.thumbnail);
    const aspectA=Number(a.aspectRatio)||1,aspectB=Number(b.aspectRatio)||1;
    const aspect=Math.max(0,1-Math.min(1,Math.abs(Math.log(aspectA/aspectB))));
    return Math.max(0,Math.min(1,(color*.25)+(gray*.10)+(spatial*.20)+(edge*.20)+(thumb*.20)+(aspect*.05)));
  }
  function rankVisualMatches(ranked){
    const byProduct=new Map();
    for(const item of Array.isArray(ranked)?ranked:[]){
      if(!item||item.productId==null||!Number.isFinite(Number(item.score)))continue;
      const id=String(item.productId),existing=byProduct.get(id);
      if(!existing||Number(item.score)>Number(existing.score))byProduct.set(id,{...item,productId:id});
    }
    return [...byProduct.values()].sort((a,b)=>Number(b.score)-Number(a.score)||String(a.productId).localeCompare(String(b.productId),undefined,{numeric:true}));
  }
  function classifyVisualMatches(ranked,options={}){
    const cfg={...DEFAULTS,...options},clean=rankVisualMatches(ranked);
    if(!clean.length)return{status:"UNRESOLVED",suggestions:[],reason:"no local visual reference images available"};
    const top=clean[0],second=clean[1],margin=second?Number(top.score)-Number(second.score):Number(top.score);
    if(Number(top.score)>=cfg.highThreshold&&margin>=cfg.highMargin)return{status:"HIGH",suggestions:[{...top,confidence:"HIGH"}],reason:"strong local visual similarity with a clear margin"};
    if(Number(top.score)>=cfg.mediumThreshold&&margin>=cfg.mediumMargin)return{status:"MEDIUM",suggestions:clean.filter(x=>Number(x.score)>=cfg.mediumThreshold).slice(0,cfg.maxSuggestions).map(x=>({...x,confidence:"MEDIUM"})),reason:"local visual similarity is plausible but requires human review"};
    if(Number(top.score)>=0.45&&margin>=0.02)return{status:"MEDIUM",suggestions:clean.slice(0,cfg.maxSuggestions).map(x=>({...x,confidence:"REVIEW"})),reason:"local visual evidence is suggestive but below automatic-match confidence; human review is required"};
    return{status:"UNRESOLVED",suggestions:[],reason:"local visual evidence is insufficient or ambiguous"};
  }
  function classifySemanticVisualMatch(result,candidates,localScores={}){
    const allowed=new Set((Array.isArray(candidates)?candidates:[]).map(x=>String(x.productId)));
    if(!result||!allowed.size)return{status:"UNRESOLVED",suggestions:[],reason:"on-device vision returned no trustworthy catalogue candidate"};
    const id=result.productId==null?"":String(result.productId),confidence=String(result.confidence||"").toUpperCase(),decision=String(result.result||"").toUpperCase();
    if(!id||!allowed.has(id)||decision==="NO_MATCH"||confidence==="LOW")return{status:"UNRESOLVED",suggestions:[],reason:"on-device vision could not establish a sufficiently clear product identity"};
    const local=Number(localScores[id]||0),candidate=(Array.isArray(candidates)?candidates:[]).find(x=>String(x.productId)===id);
    if(!candidate)return{status:"UNRESOLVED",suggestions:[],reason:"on-device vision selected an invalid catalogue candidate"};
    if(confidence==="HIGH"&&local>=0.55)return{status:"HIGH",suggestions:[{...candidate,score:local,confidence:"HIGH",visionReason:result.reason||""}],reason:"on-device vision found a strong match supported by local image similarity"};
    if((confidence==="HIGH"||confidence==="MEDIUM")&&local>=0.40)return{status:"MEDIUM",suggestions:[{...candidate,score:local,confidence:"MEDIUM",visionReason:result.reason||""}],reason:"on-device vision found a plausible match; human review is required"};
    return{status:"UNRESOLVED",suggestions:[],reason:"semantic and local visual evidence did not agree strongly enough"};
  }
  function signatureFromPixels(pixels,width,height){
    if(!pixels||!width||!height)return null;
    const color=new Array(64).fill(0),gray=new Array(16).fill(0),edgeHistogram=new Array(8).fill(0),spatial=[],thumbnail=[];
    for(let gy=0;gy<4;gy++)for(let gx=0;gx<4;gx++)spatial.push(0,0,0);
    const count=Math.max(1,width*height),grayGrid=new Array(64).fill(0),grayCount=new Array(64).fill(0);
    const lumAt=(x,y)=>{const i=(Math.max(0,Math.min(height-1,y))*width)+Math.max(0,Math.min(width-1,x));return grayGrid[i]||0;};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,r=pixels[i]||0,g=pixels[i+1]||0,b=pixels[i+2]||0,a=(pixels[i+3]??255)/255;
      if(a<.05)continue;
      const ri=Math.min(3,r>>6),gi=Math.min(3,g>>6),bi=Math.min(3,b>>6);color[(ri*16)+(gi*4)+bi]++;
      const lum=(.299*r)+(.587*g)+(.114*b);gray[Math.min(15,lum>>4)]++;
      const sx=Math.min(3,Math.floor(x/Math.max(1,width/4))),sy=Math.min(3,Math.floor(y/Math.max(1,height/4))),si=(sy*4+sx)*3;spatial[si]+=r;spatial[si+1]+=g;spatial[si+2]+=b;
      const tx=Math.min(7,Math.floor(x/Math.max(1,width/8))),ty=Math.min(7,Math.floor(y/Math.max(1,height/8))),ti=ty*8+tx;grayGrid[ti]+=lum;grayCount[ti]++;
    }
    for(let i=0;i<spatial.length;i++)spatial[i]/=count;
    for(let i=0;i<64;i++)thumbnail[i]=grayCount[i]?grayGrid[i]/grayCount[i]/255:0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const here=lumAt(x,y),right=lumAt(x+1,y),down=lumAt(x,y+1),dx=right-here,dy=down-here,m=Math.sqrt(dx*dx+dy*dy);
      if(m<8)continue;
      const angle=(Math.atan2(dy,dx)+Math.PI)/(2*Math.PI),bin=Math.min(7,Math.floor(angle*8));edgeHistogram[bin]+=m;
    }
    return{colorHistogram:normalize(color),grayHistogram:normalize(gray),spatial,edgeHistogram:normalize(edgeHistogram),thumbnail,aspectRatio:width/height};
  }
  async function localVisionAvailability(){
    try{
      if(typeof globalThis.LanguageModel==="undefined"||typeof globalThis.LanguageModel.availability!=="function")return"unavailable";
      return await globalThis.LanguageModel.availability({expectedInputs:[{type:"text",languages:["en"]},{type:"image"}],expectedOutputs:[{type:"text",languages:["en"]}]});
    }catch{return"unavailable";}
  }
  async function semanticVisualMatch(sourceBlob,candidates){
    if(!sourceBlob||!Array.isArray(candidates)||!candidates.length)return null;
    try{
      if(typeof globalThis.LanguageModel==="undefined")return null;
      const options={expectedInputs:[{type:"text",languages:["en"]},{type:"image"}],expectedOutputs:[{type:"text",languages:["en"]}]};
      const availability=await globalThis.LanguageModel.availability(options);
      if(availability!=="available")return null;
      const session=await globalThis.LanguageModel.create(options);
      try{
        const content=[{type:"text",value:"Identify the uploaded Twins Kitchen product photo by comparing it ONLY with the numbered local catalogue reference photos below. Do not use filenames or outside knowledge. If none is clearly the same product, return NO_MATCH. Return HIGH only when the product identity is distinctive and well supported; return MEDIUM when plausible but another candidate could reasonably be the same. Never invent a catalogue ID.\n\nUploaded photo:"},{type:"image",value:sourceBlob}];
        for(const candidate of candidates){content.push({type:"text",value:`Catalogue candidate ${candidate.productId}: ${candidate.name}`});content.push({type:"image",value:candidate.blob});}
        const schema={type:"object",properties:{result:{type:"string",enum:["MATCH","AMBIGUOUS","NO_MATCH"]},productId:{anyOf:[{type:"string"},{type:"null"}]},confidence:{type:"string",enum:["HIGH","MEDIUM","LOW"]},reason:{type:"string"}},required:["result","productId","confidence","reason"]};
        const raw=await session.prompt([{role:"user",content}],{responseConstraint:schema});
        return JSON.parse(raw);
      }finally{session.destroy();}
    }catch{return null;}
  }
  return{histogramIntersection,cosineSimilarity,visualSimilarity,rankVisualMatches,classifyVisualMatches,classifySemanticVisualMatch,signatureFromPixels,localVisionAvailability,semanticVisualMatch,DEFAULTS};
});