const { loadCatalogue, readExistingRules, computeMediaState, normalizeUrl } = require("./validator");

function isPublicMediaPath(value) {
  const normalized=normalizeUrl(value);
  return normalized.startsWith("assets/media/") || normalized.startsWith("/assets/media/");
}

function collectCandidates(product,data) {
  const values=[];
  const override=data.byId?.[String(product.id)];
  if(override) values.push({url:override,source:"product-id-override"});
  if(Array.isArray(product.media?.images)) {
    for(const url of product.media.images) values.push({url,source:product.media.source||"media.images"});
  }
  if(product.i) values.push({url:product.i,source:"product.i"});
  return [...new Map(values.map(item=>[normalizeUrl(item.url),item])).values()];
}

function buildPublicMediaAudit(options={}) {
  const data=options.data||loadCatalogue();
  const rules=options.rules||readExistingRules();
  const state=computeMediaState(data,rules);
  const blocklist=rules.blocklist||{};
  const candidateByProduct=new Map();
  const urlProducts=new Map();

  for(const product of state.products) {
    const candidates=collectCandidates(product,data).filter(item=>isPublicMediaPath(item.url));
    const eligible=candidates.find(item=>!blocklist[String(product.id)]);
    if(eligible) {
      const url=normalizeUrl(eligible.url);
      candidateByProduct.set(String(product.id),{productId:String(product.id),url,source:eligible.source});
      if(!urlProducts.has(url))urlProducts.set(url,[]);
      urlProducts.get(url).push(String(product.id));
    }
  }

  const duplicateUrls=[...urlProducts.entries()].filter(([,ids])=>ids.length>1);
  const published=[...candidateByProduct.values()].filter(item=>!duplicateUrls.some(([url])=>url===item.url));
  const pendingProducts=state.products.filter(p=>!published.some(item=>item.productId===String(p.id)));
  const externalCandidates=state.products.flatMap(product=>
    collectCandidates(product,data)
      .filter(item=>/^https?:\/\//i.test(String(item.url)))
      .map(item=>({productId:String(product.id),url:normalizeUrl(item.url),source:item.source}))
  );

  return {
    schemaVersion:1,
    catalogue:state.counts.catalogue,
    assigned:state.counts.assigned,
    pending:state.counts.pending,
    publicEligible:published.length,
    publicPending:pendingProducts.length,
    duplicateUrlGroups:duplicateUrls.length,
    duplicateAssignments:duplicateUrls.reduce((n,[,ids])=>n+ids.length,0),
    externalCandidates:externalCandidates.length,
    published,
    pendingProductIds:pendingProducts.map(p=>String(p.id)),
    duplicateUrls:duplicateUrls.map(([url,ids])=>({url,productIds:ids})),
    externalCandidates
  };
}

module.exports={isPublicMediaPath,collectCandidates,buildPublicMediaAudit};
