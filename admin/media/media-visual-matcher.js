(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.TwinsMediaVisualMatcher=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const DEFAULTS={
    highThreshold:0.86,
    mediumThreshold:0.72,
    highMargin:0.08,
    mediumMargin:0.03,
    maxSuggestions:5
  };

  function normalize(values){
    const sum=values.reduce((a,b)=>a+Math.max(0,Number(b)||0),0);
    return sum?values.map(v=>Math.max(0,Number(v)||0)/sum):values.map(()=>0);
  }

  function histogramIntersection(a,b){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return 0;
    const left=normalize(a),right=normalize(b);
    return left.reduce((sum,v,i)=>sum+Math.min(v,right[i]),0);
  }

  function cosineSimilarity(a,b){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return 0;
    let dot=0,na=0,nb=0;
    for(let i=0;i<a.length;i++){
      const x=Number(a[i])||0,y=Number(b[i])||0;
      dot+=x*y;na+=x*x;nb+=y*y;
    }
    return na&&nb?dot/(Math.sqrt(na)*Math.sqrt(nb)):0;
  }

  function visualSimilarity(a,b){
    if(!a||!b)return 0;
    const color=histogramIntersection(a.colorHistogram,b.colorHistogram);
    const gray=histogramIntersection(a.grayHistogram,b.grayHistogram);
    const spatial=cosineSimilarity(a.spatial,b.spatial);
    const aspectA=Number(a.aspectRatio)||1,aspectB=Number(b.aspectRatio)||1;
    const aspect=Math.max(0,1-Math.min(1,Math.abs(Math.log(aspectA/aspectB))));
    return Math.max(0,Math.min(1,(color*0.40)+(gray*0.15)+(spatial*0.35)+(aspect*0.10)));
  }

  function classifyVisualMatches(ranked,options={}){
    const cfg={...DEFAULTS,...options};
    const clean=(Array.isArray(ranked)?ranked:[])
      .filter(x=>x&&x.productId!=null&&Number.isFinite(Number(x.score)))
      .sort((a,b)=>Number(b.score)-Number(a.score)||String(a.productId).localeCompare(String(b.productId),undefined,{numeric:true}));
    if(!clean.length)return{status:"UNRESOLVED",suggestions:[],reason:"no local visual reference images available"};
    const top=clean[0],second=clean[1];
    const margin=second?Number(top.score)-Number(second.score):Number(top.score);
    if(Number(top.score)>=cfg.highThreshold&&margin>=cfg.highMargin){
      return{status:"HIGH",suggestions:[{...top,confidence:"HIGH"}],reason:"strong visual similarity with a clear margin"};
    }
    if(Number(top.score)>=cfg.mediumThreshold&&margin>=cfg.mediumMargin){
      return{status:"MEDIUM",suggestions:clean.filter(x=>Number(x.score)>=cfg.mediumThreshold).slice(0,cfg.maxSuggestions).map(x=>({...x,confidence:"MEDIUM"})),reason:"visual similarity is plausible but requires human review"};
    }
    return{status:"UNRESOLVED",suggestions:[],reason:"visual evidence is insufficient or ambiguous"};
  }

  function signatureFromPixels(pixels,width,height,grid=8){
    if(!pixels||!width||!height)return null;
    const color=new Array(64).fill(0),gray=new Array(16).fill(0),spatial=[];
    for(let gy=0;gy<4;gy++)for(let gx=0;gx<4;gx++)spatial.push(0,0,0);
    const count=Math.max(1,width*height);
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const i=(y*width+x)*4;
        const r=pixels[i]||0,g=pixels[i+1]||0,b=pixels[i+2]||0,a=(pixels[i+3]??255)/255;
        if(a<0.05)continue;
        const ri=Math.min(3,r>>6),gi=Math.min(3,g>>6),bi=Math.min(3,b>>6);
        color[(ri*16)+(gi*4)+bi]++;
        const lum=(0.299*r)+(0.587*g)+(0.114*b);
        gray[Math.min(15,lum>>4)]++;
        const sx=Math.min(3,Math.floor(x/Math.max(1,width/4)));
        const sy=Math.min(3,Math.floor(y/Math.max(1,height/4)));
        const si=(sy*4+sx)*3;
        spatial[si]+=r;spatial[si+1]+=g;spatial[si+2]+=b;
      }
    }
    for(let i=0;i<spatial.length;i++)spatial[i]/=count;
    return{
      colorHistogram:normalize(color),
      grayHistogram:normalize(gray),
      spatial,
      aspectRatio:width/height
    };
  }

  return{histogramIntersection,cosineSimilarity,visualSimilarity,classifyVisualMatches,signatureFromPixels,DEFAULTS};
});