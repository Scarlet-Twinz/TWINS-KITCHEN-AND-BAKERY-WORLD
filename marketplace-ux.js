/* Twins Marketplace — UX and trust hardening layer
   Static phase only: improves seller/buyer flow without pretending local drafts are live marketplace inventory. */
(function(){
"use strict";
function escM(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]});}
function getM(){try{return JSON.parse(localStorage.getItem("twins_marketplace_listings")||"[]")}catch(e){return[]}}
function setM(v){localStorage.setItem("twins_marketplace_listings",JSON.stringify(v))}
function marketToast(t){if(typeof toast==="function"){toast(t);return}alert(t)}

function marketplaceUx(){
 var root=document.getElementById("marketplace");if(!root)return;
 var listings=getM(),publicListings=listings.filter(function(x){return x.status==="Approved"||x.status==="Live"});
 var controls=document.createElement("section");controls.className="section marketplaceuxcontrols";
 controls.innerHTML='<div class="wrap"><div class="panel"><div class="sectionhead"><div><span class="eyebrow darkey">COMMUNITY MARKETPLACE</span><h2>Find seller listings</h2><p class="muted">Community listings are separate from official Twins catalogue references. Only approved/live listings belong in the public marketplace.</p></div><span class="statuspill">'+publicListings.length+' public listing(s)</span></div><div class="marketsearchgrid"><input id="mxSearch" placeholder="Search seller listings"><select id="mxCategory"><option value="">All marketplace categories</option>'+((typeof MARKETPLACE_CATEGORIES!=="undefined"?MARKETPLACE_CATEGORIES:[]).map(function(x){return'<option>'+escM(x)+'</option>'}).join(""))+'</select><select id="mxSort"><option value="newest">Newest</option><option value="title">Title A–Z</option></select></div><div class="markettrustrow"><span><b>SELLER STATUS</b>Verified status will be shown on production listings.</span><span><b>LISTING REVIEW</b>Twins moderation comes before public publishing.</span><span><b>PAYMENTS</b>Marketplace payments stay disabled until the gateway and seller verification flow are live.</span></div></div></div>';
 var hero=root.querySelector("main");if(hero)root.insertBefore(controls,hero.nextSibling);else root.appendChild(controls);
 var existing=root.querySelector(".section.soft");if(existing)existing.remove();
 var results=document.createElement("section");results.className="section soft marketplaceuxresults";results.innerHTML='<div class="wrap"><div class="sectionhead"><div><span class="eyebrow darkey">PUBLIC LISTINGS</span><h2 id="mxTitle">No public community listings yet</h2><p class="muted">Seller drafts stay in the seller workspace until approved.</p></div><a class="btn red" href="sell-on-twins.html">Sell on Twins →</a></div><div id="mxGrid"></div><div class="panel mxSellerNotice"><b>Have a seller draft?</b><span>Open Seller Hub to review, update or remove your local draft. Drafts are never presented as verified marketplace inventory.</span><a href="seller-dashboard.html">Open Seller Hub →</a></div></div>';
 root.appendChild(results);
 function render(){
   var q=(document.getElementById("mxSearch").value||"").toLowerCase().trim(),cat=document.getElementById("mxCategory").value,sort=document.getElementById("mxSort").value;
   var list=getM().filter(function(x){return (x.status==="Approved"||x.status==="Live")&&(!cat||x.category===cat)&&(!q||(x.title+" "+x.description+" "+x.category+" "+x.location+" "+(x.condition||"")).toLowerCase().indexOf(q)>-1)});
   if(sort==="title")list.sort(function(a,b){return String(a.title).localeCompare(String(b.title))});else list.sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt))});
   var title=document.getElementById("mxTitle"),grid=document.getElementById("mxGrid");
   title.textContent=list.length?list.length+" public listing"+(list.length===1?"":"s"):"No public community listings yet";
   grid.innerHTML=list.length?'<div class="grid">'+list.map(function(x){return'<article class="card marketcard"><div class="marketlistingmedia">'+(x.image?'<img src="'+escM(x.image)+'" alt="'+escM(x.title)+'">':'<div class="marketimageplaceholder">Seller image required</div>')+'</div><div class="cardbody"><span class="realbadge">COMMUNITY · '+escM(x.status)+'</span><h3>'+escM(x.title)+'</h3><p class="muted">'+escM(x.category)+' · '+escM(x.location)+'</p><p>'+escM(x.description)+'</p><div class="p6tags"><span>'+escM(x.condition||"Condition to confirm")+'</span><span>'+escM(x.stock||"Stock to confirm")+'</span></div><div class="cardactions"><a class="btn light mini" href="contact.html">Enquire with Twins</a><a class="btn light mini" href="trust-center.html">Trust & safety</a></div></div></article>}).join("")+'</div>':'<div class="empty"><h2>The public marketplace is waiting for approved sellers.</h2><p class="muted">This static phase deliberately keeps pending drafts out of public discovery. Production publishing will require authenticated sellers, moderation, managed media storage and payment controls.</p><a class="btn red" href="sell-on-twins.html">Create a seller listing →</a></div>';
 }
 ["input","change"].forEach(function(evt){controls.addEventListener(evt,function(e){if(e.target.id==="mxSearch"||e.target.id==="mxCategory"||e.target.id==="mxSort")render()})});
 render();
}

function sellerFormUx(){
 var root=document.getElementById("sell");if(!root)return;
 var form=root.querySelector(".sellerForm");if(!form)return;
 var desc= document.getElementById("sellerDescription");
 if(desc&&!document.getElementById("sellerCondition")){
   var wrap=document.createElement("div");wrap.className="twocol";
   wrap.innerHTML='<div class="field"><label>Condition</label><select id="sellerCondition"><option>New</option><option>Used</option><option>Refurbished</option><option>Open box</option><option>Condition to confirm</option></select></div><div class="field"><label>Stock status</label><select id="sellerStock"><option>In stock</option><option>Limited stock</option><option>Pre-order</option><option>Made to order</option><option>Stock to confirm</option></select></div>';
   desc.parentNode.insertBefore(wrap,desc.nextSibling);
 }
 var aside=root.querySelector(".sellerAside");
 if(aside&&!aside.querySelector(".sellerchecklist")){
   var box=document.createElement("div");box.className="sellerchecklist";
   box.innerHTML='<b>Before submitting</b><span>Use an accurate product title.</span><span>Describe condition and stock honestly.</span><span>Include the seller location.</span><span>Use product-specific images where available.</span><span>Do not publish payment credentials or misleading claims.</span>';
   aside.appendChild(box);
 }
 window.saveSellerListing=function(){
   var title=document.getElementById("sellerTitle"),category=document.getElementById("sellerCategory"),description=document.getElementById("sellerDescription"),price=document.getElementById("sellerPrice"),location=document.getElementById("sellerLocation");
   if(!title||!category||!description||!location)return;
   var listing={id:Date.now(),title:title.value.trim(),category:category.value,description:description.value.trim(),price:price.value.trim(),location:location.value.trim(),condition:(document.getElementById("sellerCondition")||{}).value||"Condition to confirm",stock:(document.getElementById("sellerStock")||{}).value||"Stock to confirm",image:window.__sellerImage||"",status:"Pending moderation",createdAt:new Date().toISOString()};
   if(!listing.title||!listing.description||!listing.location){marketToast("Complete the required listing details");return}
   var list=getM();list.unshift(listing);setM(list);location.href="seller-dashboard.html?saved=1";
 };
}

function sellerDashboardUx(){
 var root=document.getElementById("sellerdash");if(!root)return;
 var list=getM();
 var heading=root.querySelector("h1");
 if(heading&&!root.querySelector(".sellerSafetyBanner")){
   var banner=document.createElement("div");banner.className="panel sellerSafetyBanner";
   banner.innerHTML='<b>Seller publishing boundary</b><p class="muted">Your local drafts are not public listings. A production seller must be authenticated, approved, moderated and connected to managed media/payment infrastructure before a listing can go live.</p>';
   heading.parentNode.parentNode.appendChild(banner);
 }
 var cards=Array.prototype.slice.call(root.querySelectorAll(".marketcard"));
 cards.forEach(function(card,i){
   var item=list[i];if(!item||card.querySelector(".sellerdraftactions"))return;
   var body=card.querySelector(".cardbody");if(!body)return;
   var actions=document.createElement("div");actions.className="sellerdraftactions";
   actions.innerHTML='<span>'+escM(item.condition||"Condition to confirm")+' · '+escM(item.stock||"Stock to confirm")+'</span><button class="btn light mini" data-delete-market="'+item.id+'">Delete draft</button>';
   body.appendChild(actions);
 });
 root.addEventListener("click",function(e){
   var btn=e.target.closest("[data-delete-market]");if(!btn)return;
   var id=Number(btn.getAttribute("data-delete-market"));setM(getM().filter(function(x){return Number(x.id)!==id}));location.reload();
 });
}

document.addEventListener("DOMContentLoaded",function(){
 marketplaceUx();sellerFormUx();sellerDashboardUx();
});
})();