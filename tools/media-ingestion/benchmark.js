const fs=require("node:fs");
const path=require("node:path");
const {buildPublicMediaAudit}=require("./public-media-audit");
const {ROOT}=require("./validator");

function toRelativeMediaPath(url){
  const value=String(url||"").replace(/^\//,"");
  return value;
}

function buildBenchmarkManifest(options={}){
  const audit=options.audit||buildPublicMediaAudit(options);
  const exact=audit.published
    .filter(item=>fs.existsSync(path.resolve(ROOT,toRelativeMediaPath(item.url))))
    .map(item=>({
      id:"exact-"+item.productId,
      type:"EXACT",
      productId:String(item.productId),
      asset:item.url,
      expectedState:"HIGH_OR_MEDIUM"
    }));
  const ambiguous=audit.duplicateUrls
    .filter(item=>fs.existsSync(path.resolve(ROOT,toRelativeMediaPath(item.url))))
    .map((item,index)=>({
      id:"ambiguous-"+(index+1),
      type:"AMBIGUOUS_DUPLICATE",
      productIds:item.productIds.map(String),
      asset:item.url,
      expectedState:"UNRESOLVED"
    }));
  return {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    model:{id:"Xenova/mobileclip_s0",revision:"main"},
    catalogue:audit.catalogue,
    cases:{exact,ambiguous},
    counts:{exact:exact.length,ambiguous:ambiguous.length,total:exact.length+ambiguous.length},
    executionNote:"This manifest is benchmark-ready. Accuracy percentages require executing the local ONNX model against the real assets; CI does not download/run the 815 MB browser checkpoint."
  };
}

function evaluatePredictions(cases,predictions){
  const byId=new Map((predictions||[]).map(item=>[String(item.id),item]));
  let evaluated=0,correctTop1=0,highCount=0,highCorrect=0,falseHigh=0,unresolved=0;
  for(const item of cases||[]){
    const prediction=byId.get(String(item.id));
    if(!prediction)continue;
    evaluated++;
    if(prediction.state==="UNRESOLVED")unresolved++;
    if(prediction.state==="HIGH"){
      highCount++;
      if(item.productId&&String(prediction.productId)===String(item.productId))highCorrect++;
      else falseHigh++;
    }
    if(item.productId&&String(prediction.productId)===String(item.productId))correctTop1++;
  }
  return {
    evaluated,
    top1Accuracy:evaluated?correctTop1/evaluated:null,
    highConfidencePrecision:highCount?highCorrect/highCount:null,
    highConfidenceCount:highCount,
    falseHighCount:falseHigh,
    unresolvedRate:evaluated?unresolved/evaluated:null
  };
}

module.exports={buildBenchmarkManifest,evaluatePredictions};
