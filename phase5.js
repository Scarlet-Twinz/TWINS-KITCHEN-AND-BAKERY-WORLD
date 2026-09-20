/* Twins Kitchen — Phase 5 Premium Commerce Experience
   Visual merchandising layer. Additive and deliberately non-destructive.
*/
(function(){
"use strict";

var MEDIA_POOLS={
"Cooking Equipment":[
"https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1585659722983-3a675dabf23d?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1400&q=88"
],
"Bakery Equipment":[
"https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1519869325930-281384150729?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1400&q=88"
],
"Kitchen Equipment":[
"https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=88"
],
"Cold Storage":[
"https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=1400&q=88"
],
"Restaurant & Hotel":[
"https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1400&q=88"
],
"Bar & Beverage":[
"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1400&q=88"
],
"Food Preparation":[
"https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1400&q=88"
],
"Storage":[
"https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=88"
],
"Serving Equipment":[
"https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1400&q=88"
],
"Catering Supplies":[
"https://images.unsplash.com/photo-1576866209830-589e1bfbaa4a?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1400&q=88"
],
"Satellite & TV":[
"https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1601944177325-f8867652837f?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1400&q=88"
],
"Entertainment & Leisure":[
"https://images.unsplash.com/photo-1522069213448-443a614da9b6?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1606503153255-59d8b8b821aa?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1400&q=88"
],
"Games & Recreation":[
"https://images.unsplash.com/photo-1606503153255-59d8b8b821aa?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1522069213448-443a614da9b6?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1400&q=88"
],
"Home & General Appliances":[
"https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=1400&q=88",
"https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1400&q=88"
]
};

var PREMIUM=typeof PREMIUM_MEDIA_LIBRARY!=="undefined"?PREMIUM_MEDIA_LIBRARY:{};

function hash(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h)+s.charCodeAt(i)|0;return Math.abs(h);}
function poolFor(p){return MEDIA_POOLS[p.c]||MEDIA_POOLS["Kitchen Equipment"];}
function premiumFor(p){return PREMIUM[String(p.n||"").toLowerCase()]||"";}
function visual(p){
  var premium=premiumFor(p);
  if(premium)return {src:premium,status:"reference",source:"Premium category reference"};
  var pool=poolFor(p), src=pool[hash(String(p.id)+"|"+String(p.n))%pool.length];
  return {src:src,status:"category-reference",source:"Curated category reference"};
}
function media(p){return visual(p);}
function productMedia(p){return visual(p);}
function mediaAudit(){
  var all=P.map(visual),counts={};
  all.forEach(function(m){counts[m.src]=(counts[m.src]||0)+1});
  var unique=Object.keys(counts).length;
  return {verified:all.length,pending:0,total:all.length,unique:unique,repeated:Object.values(counts).filter(function(n){return n>1}).length};
}
window.phase5Media=visual;
window.phase5MediaAudit=mediaAudit;

function label(m){
  return m.status==="reference"?"CURATED REFERENCE":"CATEGORY REFERENCE";
}
function cards5(list){
 return list.map(function(p){
   var m=visual(p);
   return '<article class="card productcard p5card">'+
     '<a class="p5image" href="product.html?id='+p.id+'"><img loading="lazy" src="'+m.src+'" alt="'+String(p.n||"").replace(/"/g,"&quot;")+'"><span class="p5badge">'+label(m)+'</span><span class="p5quick">View product →</span></a>'+
     '<div class="cardbody"><div class="eyebrow darkey">'+String(p.c||"Equipment")+' · '+String(p.tag||"Equipment")+'</div>'+
     '<h3><a href="product.html?id='+p.id+'">'+String(p.n||"Equipment")+'</a></h3>'+
     '<p>'+String(p.desc||"Commercial equipment for professional operations.")+'</p>'+
     '<div class="p5meta"><span>Quote on request</span><span>Stock to confirm</span></div>'+
     '<div class="p5actions"><a class="btn dark mini" href="product.html?id='+p.id+'">View details</a><a class="p5wa" target="_blank" rel="noopener" href="'+whatsappUrl("Hello Twins Kitchen. I am interested in "+p.n+" (product ID "+p.id+"). Please confirm exact model, current price, stock and delivery.")+'">WhatsApp →</a></div></div></article>';
 }).join("");
}
window.phase5Cards=cards5;

function injectStoreEnhancements(){
 var root=document.getElementById("products"); if(!root)return;
 var head=root.querySelector(".p3storehead");
 if(head && !root.querySelector(".p5merchbar")){
   var bar=document.createElement("div");bar.className="p5merchbar";
   bar.innerHTML='<div><span class="eyebrow darkey">SHOPPING MODE</span><strong>Browse like a showroom, buy with confidence.</strong><small>Start with a product, a business area or the kind of operation you are building.</small></div><div class="p5merchlinks"><a href="industries.html">Shop by business →</a><a href="bundles.html">View packages →</a><a href="equipment-finder.html">Find equipment →</a></div>';
   head.parentNode.insertBefore(bar,head.nextSibling);
 }
}
function renderHomeShelf(){
 var app=document.getElementById("app");if(!app||app.dataset.p5==="1")return;
 var candidates=P.filter(function(p){return ["Popular","Featured","Essential","Bakery","Cold Storage"].indexOf(p.tag)>-1}).slice(0,12);
 if(!candidates.length)return;
 var sec=document.createElement("section");sec.className="section p5shelf";sec.innerHTML='<div class="wrap"><div class="sectionhead"><div><span class="eyebrow darkey">THE TWINS SHOWROOM</span><h2>Shop the equipment people build businesses around.</h2><p class="muted">A visual starting point for cooking, baking, cold storage, prep and hospitality.</p></div><a class="btn light" href="products.html">View all equipment →</a></div><div class="p5rail">'+cards5(candidates)+'</div></div>';
 var target=app.querySelector(".section")||app.lastElementChild;
 if(target)target.parentNode.insertBefore(sec,target);
 app.dataset.p5="1";
}
function enhanceProduct(){
 var root=document.getElementById("product");if(!root)return;
 var gallery=root.querySelector(".p3gallery"), info=root.querySelector(".p3info");
 if(gallery&&!gallery.querySelector(".p5gallerynote")){
   var note=document.createElement("div");note.className="p5gallerynote";
   note.innerHTML='<b>Visual reference</b><span>Confirm the exact make, model, dimensions and finish with Twins before purchase.</span>';
   gallery.appendChild(note);
 }
 if(info&&!info.querySelector(".p5buybar")){
   var b=document.createElement("div");b.className="p5buybar";
   b.innerHTML='<span><b>Buying with confidence</b><small>Current price · stock · delivery · official payment method are confirmed before payment.</small></span><a class="btn red mini" href="quote.html">Build a quote →</a>';
   var facts=info.querySelector(".p3facts"); if(facts)facts.parentNode.insertBefore(b,facts);
 }
}
function enhanceMedia(){
 var root=document.getElementById("media");if(!root)return;
 var stat=mediaAudit();
 var intro=root.querySelector(".p3storehead,.mediahead");
 if(intro&&!root.querySelector(".p5mediaintro")){
   var el=document.createElement("div");el.className="p5mediaintro";
   el.innerHTML='<span><b>'+stat.unique+'</b> curated visual references</span><span><b>0</b> generic “photo pending” cards in the main catalogue experience</span><span>Exact Twins-supplied photos remain clearly distinguished</span>';
   intro.parentNode.insertBefore(el,intro.nextSibling);
 }
}
document.addEventListener("DOMContentLoaded",function(){
 if(document.getElementById("products")&&typeof phaseProducts==="function"){window.cards=cards5;phaseProducts();} injectStoreEnhancements();renderHomeShelf();enhanceProduct();enhanceMedia();
});
})();
