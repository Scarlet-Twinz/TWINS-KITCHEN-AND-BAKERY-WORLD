/* Twins Kitchen — commerce UX completion layer
   Discovery, project continuity and product-to-project helpers.
   No media assets are modified here. */
(function(){
"use strict";

function escX(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]});}
function qs(sel,root){return (root||document).querySelector(sel);}
function all(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
function currentPath(){return location.pathname.split("/").pop()||"index.html";}
function getX(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}}
function putX(k,v){localStorage.setItem(k,JSON.stringify(v));}
function toastX(t){if(typeof toast==="function"){toast(t);return}var e=document.getElementById("toast");if(!e){e=document.createElement("div");e.id="toast";document.body.appendChild(e)}e.textContent=t;e.classList.add("show");setTimeout(function(){e.classList.remove("show")},1800);}

function searchData(){
 var products=typeof P!=="undefined"?P:[], businesses=typeof B!=="undefined"?B:[], cats=typeof C!=="undefined"?C:[];
 return {products:products,businesses:businesses,cats:cats};
}
function addSearchAutocomplete(){
 var forms=all("form.search, .p6search");
 forms.forEach(function(form){
   var input=form.querySelector("input[name='q']");
   if(!input||input.dataset.uxSearch==="1")return;
   input.dataset.uxSearch="1";
   var box=document.createElement("div");box.className="ux-searchbox";box.hidden=true;
   input.parentNode.style.position="relative";input.parentNode.appendChild(box);
   var active=-1;
   function render(){
     var q=(input.value||"").trim().toLowerCase();
     if(q.length<2){box.hidden=true;active=-1;return}
     var d=searchData(),items=[];
     d.businesses.forEach(function(b){if(b[0].toLowerCase().indexOf(q)>-1)items.push({kind:"Business",label:b[0],href:"products.html?business="+encodeURIComponent(b[0])})});
     d.cats.forEach(function(c){if(c[0].toLowerCase().indexOf(q)>-1)items.push({kind:"Area",label:c[0],href:"products.html?cat="+encodeURIComponent(c[0])})});
     d.products.forEach(function(p){var blob=(p.n+" "+p.c+" "+(p.desc||"")).toLowerCase();if(blob.indexOf(q)>-1)items.push({kind:"Equipment",label:p.n,meta:p.c,href:"product.html?id="+p.id})});
     var seen={};items=items.filter(function(x){var k=x.kind+"|"+x.label;if(seen[k])return false;seen[k]=1;return true}).slice(0,8);
     if(!items.length){box.innerHTML='<div class="ux-search-empty">No direct match. Try a business, equipment area or broader product term.</div>';box.hidden=false;return}
     box.innerHTML=items.map(function(x,i){return '<a class="ux-searchitem" data-index="'+i+'" href="'+x.href+'"><span>'+escX(x.kind)+'</span><b>'+escX(x.label)+'</b>'+(x.meta?'<small>'+escX(x.meta)+'</small>':"")+'</a>'}).join("");
     box.hidden=false;active=-1;
   }
   input.addEventListener("input",render);
   input.addEventListener("focus",render);
   input.addEventListener("keydown",function(e){
     if(box.hidden)return;
     var links=all(".ux-searchitem",box);
     if(e.key==="ArrowDown"){e.preventDefault();active=Math.min(active+1,links.length-1);links.forEach(function(x,i){x.classList.toggle("active",i===active)});}
     else if(e.key==="ArrowUp"){e.preventDefault();active=Math.max(active-1,0);links.forEach(function(x,i){x.classList.toggle("active",i===active)});}
     else if(e.key==="Enter"&&active>=0){e.preventDefault();links[active].click();}
     else if(e.key==="Escape"){box.hidden=true;}
   });
   document.addEventListener("click",function(e){if(!form.contains(e.target))box.hidden=true;});
 });
}

function enhanceSearchResults(){
 var path=currentPath();if(path!=="products.html")return;
 var params=new URLSearchParams(location.search),q=params.get("q")||"",cat=params.get("cat")||"",business=params.get("business")||"";
 var root=document.getElementById("products");if(!root)return;
 var bar=qs(".p6resultbar",root);if(!bar)return;
 if((q||cat||business)&&!qs(".ux-applied",root)){
   var wrap=document.createElement("div");wrap.className="ux-applied";
   var chips=[];
   if(q)chips.push(["Search: "+q,"q"]);
   if(cat)chips.push(["Area: "+cat,"cat"]);
   if(business)chips.push(["Business: "+business,"business"]);
   wrap.innerHTML='<span>Active path</span>'+chips.map(function(x){return '<a href="'+removeParam(x[1])+'">'+escX(x[0])+' ×</a>'}).join("");
   bar.parentNode.insertBefore(wrap,bar);
 }
 function removeParam(k){var u=new URLSearchParams(location.search);u.delete(k);u.delete("page");return "products.html"+(u.toString()?"?"+u.toString():"");}
 var empty=qs(".empty",root);
 if(empty&&q&&!qs(".ux-noresults",root)){
   var wrap=document.createElement("div");wrap.className="ux-noresults";
   var alternatives=[];
   var d=searchData();
   d.businesses.forEach(function(b){if(q.toLowerCase().indexOf(b[0].toLowerCase())>-1)alternatives.push(["Shop "+b[0],"products.html?business="+encodeURIComponent(b[0])])});
   d.cats.forEach(function(c){if(q.toLowerCase().indexOf(c[0].toLowerCase())>-1)alternatives.push(["Browse "+c[0],"products.html?cat="+encodeURIComponent(c[0])])});
   wrap.innerHTML='<b>Try a different path</b><div>'+alternatives.slice(0,4).map(function(x){return '<a class="btn light mini" href="'+x[1]+'">'+escX(x[0])+' →</a>'}).join("")+'<a class="btn light mini" href="project-planner.html">Plan the operation →</a><a class="btn light mini" href="quote.html">Ask Twins →</a></div>';
   empty.appendChild(wrap);
 }
}

function enhanceProductToProject(){
 var root=document.getElementById("product");if(!root)return;
 var id=Number(new URLSearchParams(location.search).get("id")),p=typeof P!=="undefined"?P.find(function(x){return x.id===id}):null;
 if(!p||qs(".ux-projectaction",root))return;
 var actions=qs(".p3actions",root);
 if(!actions)return;
 var business=(p.businesses&&p.businesses[0])||"";
 var btn=document.createElement("button");btn.type="button";btn.className="btn light ux-projectaction";btn.textContent="Add to project";
 btn.onclick=function(){
   var plan=getX("twins_business_plan",null)||{type:business||"",equipmentIds:[]};
   plan.equipmentIds=Array.isArray(plan.equipmentIds)?plan.equipmentIds:[];
   if(plan.equipmentIds.indexOf(p.id)<0)plan.equipmentIds.push(p.id);
   if(!plan.type&&business)plan.type=business;
   plan.savedAt=new Date().toISOString();putX("twins_business_plan",plan);
   toastX(p.n+" added to your business plan");
 };
 actions.appendChild(btn);
 var info=qs(".p3info",root);
 if(info&&!qs(".ux-projectnote",info)){
   var note=document.createElement("div");note.className="panel ux-projectnote";
   note.innerHTML='<b>Planning this equipment?</b><p class="muted">Add it to a business plan, then carry the shortlist into a project brief and quotation.</p><div><a class="btn light mini" href="build-your-business.html'+(business?"?type="+encodeURIComponent(business):"")+'">Plan this operation →</a><a class="btn red mini" href="quote.html">Request a quote →</a></div>';
   info.appendChild(note);
 }
}

function enhanceDashboard(){
 var root=document.getElementById("dashboard");if(!root)return;
 var plan=getX("twins_business_plan",null),project=getX("twins_project_plan",null);
 if(!plan&&!project)return;
 var target=qs("#projects",root);if(!target||qs(".ux-projectchain",target))return;
 var box=document.createElement("div");box.className="panel ux-projectchain";
 box.innerHTML='<span class="eyebrow darkey">PROJECT CHAIN</span><h3>'+escX((plan&&plan.type)||(project&&project.business)||"Business setup")+'</h3><div><a href="build-your-business.html">Business plan</a><span>→</span><a href="project-planner.html">Project brief</a><span>→</span><a href="quote.html">Quotation</a></div><small>'+(plan&&plan.equipmentIds?plan.equipmentIds.length:0)+' equipment reference(s) selected in the business plan.</small>';
 target.appendChild(box);
}

document.addEventListener("DOMContentLoaded",function(){
 addSearchAutocomplete();
 enhanceSearchResults();
 enhanceProductToProject();
 enhanceDashboard();
});
})();