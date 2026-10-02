/* Twins Kitchen Marketplace — production seller/public flow.
   The marketplace is deliberately separate from the official Twins catalogue and Operations Admin.
*/
(function(){
"use strict";

var API="/api/marketplace";

function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function loggedUser(){return get("twins_user",null)}
async function marketFetch(path,options){
  var opts=Object.assign({credentials:"include"},options||{});
  opts.headers=Object.assign({},opts.headers||{});
  if(!(opts.body instanceof FormData)) opts.headers["Content-Type"]="application/json";
  var r=await fetch(apiBase()+API+path,opts),data={};
  try{data=await r.json()}catch(e){}
  if(!r.ok){
    var e=new Error(data.detail||"Marketplace request failed");
    e.status=r.status;
    throw e;
  }
  return data;
}
function requireLogin(){
  if(!loggedUser()){location.href="login.html?next="+encodeURIComponent(location.pathname+location.search);return false}
  return true;
}
function money(value,currency){
  if(value==null)return "Price on request";
  return (currency==="NGN"?"₦":currency+" ")+Number(value).toLocaleString("en-NG");
}
function statusLabel(status){
  return String(status||"").replace(/_/g," ").replace(/\b\w/g,function(x){return x.toUpperCase()});
}
function mediaMarkup(list){
  if(!list||!list.length)return '<div class="marketNoImage">No product photo yet</div>';
  return '<img loading="lazy" decoding="async" src="'+esc(list[0].url)+'" alt="'+esc(list[0].alt||"Marketplace product")+'" onerror="this.style.display=\'none\'">';
}
function marketplace(){
  var root=document.getElementById("marketplace");if(!root)return;
  var category=new URLSearchParams(location.search).get("category")||"";
  var id=new URLSearchParams(location.search).get("id")||"";
  root.innerHTML=head()+'<main class="page"><div class="wrap"><div id="marketContent"><div class="empty"><h2>Loading Marketplace…</h2></div></div></div></main>'+foot()+'<div id="toast"></div>';
  if(id)loadMarketplaceListing(id);else loadMarketplace(category);
}
async function loadMarketplace(category){
  var root=document.getElementById("marketContent");
  try{
    var data=await marketFetch("/listings?limit=60"+(category?"&category="+encodeURIComponent(category):""));
    var cats=(typeof MARKETPLACE_CATEGORIES!=="undefined"?MARKETPLACE_CATEGORIES:[]);
    root.innerHTML='<section class="marketHero"><div class="marketHeroGrid"><div><span class="eyebrow">TWINS MARKETPLACE</span><h1>Community products, clearly separated from official Twins stock.</h1><p>Browse seller-submitted equipment and products. Every published listing has passed the Twins moderation flow.</p><div class="heroactions"><a class="btn red" href="sell-on-twins.html">Sell on Twins →</a><a class="btn light" href="products.html">Official Twins catalogue</a></div></div><div class="marketTrust"><b>SELLER LISTINGS</b><span>Independent marketplace products</span><b>MODERATED</b><span>Published only after review</span><b>OFFICIAL STOCK</b><span>Remains separate</span></div></div></section>'+
    '<section class="section"><div class="sectionhead"><div><span class="eyebrow darkey">MARKETPLACE AREAS</span><h2>Browse by category</h2></div></div><div class="marketcats">'+cats.map(function(c){return'<a class="marketcat" href="marketplace.html?category='+encodeURIComponent(c)+'"><b>'+esc(c)+'</b><span>Community listings</span></a>'}).join("")+'</div></section>'+
    '<section class="section soft"><div class="sectionhead"><div><span class="eyebrow darkey">PUBLISHED LISTINGS</span><h2>'+(category?esc(category):"Latest community products")+'</h2><p class="muted">'+data.listings.length+' published listing(s)</p></div><a class="btn light" href="seller-dashboard.html">Seller Hub →</a></div>'+
    (data.listings.length?'<div class="grid">'+data.listings.map(function(x){return'<article class="card marketcard"><a href="marketplace.html?id='+encodeURIComponent(x.id)+'">'+mediaMarkup(x.media)+'</a><div class="cardbody"><span class="realbadge">COMMUNITY SELLER</span><h3><a href="marketplace.html?id='+encodeURIComponent(x.id)+'">'+esc(x.title)+'</a></h3><p class="muted">'+esc(x.category)+' · '+esc(x.location||"Location not specified")+'</p><p>'+esc(x.description)+'</p><b>'+money(x.price,x.currency)+(x.priceMode==="negotiable"?" · Negotiable":"")+'</b><p class="small muted">Seller: '+esc(x.seller)+(x.sellerVerification==="verified"?" · Verified seller":"")+'</p></div></article>'}).join("")+'</div>':
    '<div class="empty"><h2>No published community listings yet.</h2><p class="muted">Seller submissions appear here only after the Twins moderation process.</p><a class="btn red" href="sell-on-twins.html">Become a seller →</a></div>')+
    '</section></div>';
  }catch(e){
    root.innerHTML='<div class="empty"><h2>Marketplace is temporarily unavailable.</h2><p class="muted">'+esc(e.message)+'</p><button class="btn red" onclick="location.reload()">Try again</button></div>';
  }
}
async function loadMarketplaceListing(id){
  var root=document.getElementById("marketContent");
  try{
    var data=await marketFetch("/listings/"+encodeURIComponent(id)),x=data.listing;
    root.innerHTML='<div class="crumb"><a href="marketplace.html">Marketplace</a> / '+esc(x.title)+'</div><section class="p3product"><div class="p3gallery panel"><div class="p3media">'+mediaMarkup(x.media)+'</div><div class="p3notice"><b>COMMUNITY MARKETPLACE</b><span>This is a seller-submitted listing, not official Twins inventory.</span></div></div><div class="p3info"><span class="eyebrow darkey">'+esc(x.category)+' · COMMUNITY SELLER</span><h1>'+esc(x.title)+'</h1><p class="p3lead">'+esc(x.description)+'</p><div class="p3quote"><span>Listed price</span><strong>'+money(x.price,x.currency)+(x.priceMode==="negotiable"?" · Negotiable":"")+'</strong><small>Confirm availability, condition and final terms directly with the seller.</small></div><div class="p3facts"><div><b>Seller</b><span>'+esc(x.seller)+(x.sellerVerification==="verified"?" · Verified":"")+'</span></div><div><b>Location</b><span>'+esc(x.location||"Not specified")+'</span></div><div><b>Category</b><span>'+esc(x.category)+'</span></div><div><b>Listing</b><span>Published</span></div></div><div class="p3actions"><a class="btn red" href="'+esc(x.sellerContactUrl||"#")+'" target="_blank" rel="noopener" '+(x.sellerContactUrl?"":"aria-disabled=&quot;true&quot; onclick=&quot;return false&quot;")+'>Contact seller →</a><button class="btn light" onclick="reportMarketplaceListing(\''+esc(x.id)+'\')">Report listing</button></div></div></section>';
  }catch(e){root.innerHTML='<div class="empty"><h2>Listing not found.</h2><p class="muted">'+esc(e.message)+'</p><a class="btn red" href="marketplace.html">Back to Marketplace</a></div>';}
}
async function reportMarketplaceListing(id){
  var reason=prompt("Reason for reporting this listing:");
  if(!reason)return;
  var details=prompt("Additional details (optional):")||"";
  try{await marketFetch("/listings/"+encodeURIComponent(id)+"/report",{method:"POST",body:JSON.stringify({reason:reason,details:details})});toast("Report submitted");}
  catch(e){toast(e.message)}
}
function sellerImagePreview(e){
  var files=Array.from(e.target.files||[]),box=document.getElementById("sellerPreviews");
  if(!box)return;
  box.innerHTML="";
  files.forEach(function(file){
    var img=document.createElement("img");img.className="sellerPreview";img.alt=file.name;
    var reader=new FileReader();reader.onload=function(){img.src=reader.result};reader.readAsDataURL(file);box.appendChild(img);
  });
}
async function submitSellerListing(event){
  event.preventDefault();
  if(!requireLogin())return;
  var form=event.target,files=Array.from(document.getElementById("sellerImages").files||[]);
  if(files.length<1||files.length>8){toast("Add between 1 and 8 product photos");return}
  try{
    var profile=await marketFetch("/seller/profile");
    if(!profile.profile){
      await marketFetch("/seller/profile",{method:"POST",body:JSON.stringify({
        displayName:form.displayName.value.trim(),phone:form.phone.value.trim()||null,location:form.location.value.trim()||null
      })});
    }
    var listing=await marketFetch("/listings",{method:"POST",body:JSON.stringify({
      title:form.title.value.trim(),category:form.category.value,description:form.description.value.trim(),
      priceMode:form.priceMode.value,price:form.priceMode.value==="fixed"?Number(form.price.value):null,
      location:form.location.value.trim()||null,mediaRightsAttested:form.mediaRights.checked
    })});
    var fd=new FormData();files.forEach(function(f){fd.append("files",f,f.name)});
    await marketFetch("/listings/"+encodeURIComponent(listing.listing.id)+"/media",{method:"POST",body:fd});
    toast("Listing submitted for review");
    location.href="seller-dashboard.html?saved=1";
  }catch(e){toast(e.message)}
}
async function sellOnTwins(){
  var root=document.getElementById("sell");if(!root)return;
  if(!requireLogin())return;
  var cats=(typeof MARKETPLACE_CATEGORIES!=="undefined"?MARKETPLACE_CATEGORIES:[]);
  var user=loggedUser()||{};
  root.innerHTML=head()+'<main class="page"><section class="marketHero compact"><div class="wrap"><span class="eyebrow">SELL ON TWINS</span><h1>Submit a real product listing.</h1><p>Your photos are uploaded to managed marketplace storage. A listing is not public until Twins reviews it.</p></div></section><section class="section"><div class="wrap sellerLayout"><form class="sellerForm" onsubmit="submitSellerListing(event)"><div class="sectionhead"><div><span class="eyebrow darkey">LISTING DETAILS</span><h2>Product information</h2></div><span class="statuspill">MODERATION REQUIRED</span></div><div class="field"><label>Seller / display name</label><input name="displayName" required maxlength="120" value="'+esc(user.name||"")+'"></div><div class="twocol"><div class="field"><label>Phone</label><input name="phone" maxlength="40" placeholder="+234…"></div><div class="field"><label>Location</label><input name="location" required maxlength="160" placeholder="Lagos, Nigeria"></div></div><div class="field"><label>Product title</label><input name="title" required maxlength="160" placeholder="e.g. 3-Group Commercial Coffee Machine"></div><div class="field"><label>Category</label><select name="category" required>'+cats.map(function(c){return'<option value="'+esc(c)+'">'+esc(c)+'</option>'}).join("")+'</select></div><div class="field"><label>Description</label><textarea name="description" required maxlength="2000" rows="6" placeholder="Describe the product, condition, important specifications and what a buyer should know."></textarea></div><div class="twocol"><div class="field"><label>Price mode</label><select name="priceMode" onchange="document.getElementById(\'sellerPriceWrap\').hidden=this.value!==\'fixed\'"><option value="on_request">Price on request</option><option value="negotiable">Negotiable</option><option value="fixed">Fixed price</option></select></div><div class="field" id="sellerPriceWrap" hidden><label>Price (NGN)</label><input name="price" type="number" min="1" step="0.01" placeholder="450000"></div></div><div class="field"><label>Product photos</label><input id="sellerImages" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple required onchange="sellerImagePreview(event)"><small class="muted">1–8 images. Use your own photos or media you are authorized to sell. Maximum 10 MB per image.</small><div id="sellerPreviews" class="sellerPreviewGrid"></div></div><div class="field"><label><input type="checkbox" name="mediaRights" required> I confirm that I own these product photos or have permission to use them for this marketplace listing.</label></div><button class="btn red" type="submit">Submit listing for review →</button></form><aside class="sellerAside"><span class="eyebrow darkey">HOW IT WORKS</span><h2>Clear seller → review → publish flow.</h2><div class="trustlist"><span>✓ Account required</span><span>✓ Managed image storage</span><span>✓ Duplicate-file protection</span><span>✓ Twins moderation</span><span>✓ Seller verification</span><span>✓ Public only after approval</span></div><p class="muted">Marketplace products remain separate from the official Twins catalogue.</p></aside></div></section></main>'+foot()+'<div id="toast"></div>';
}
async function sellerDashboard(){
  var root=document.getElementById("sellerdash");if(!root)return;
  if(!requireLogin())return;
  root.innerHTML=head()+'<main class="page"><section class="section"><div class="wrap"><div id="sellerDashboardContent"><div class="empty"><h2>Loading Seller Hub…</h2></div></div></div></section></main>'+foot()+'<div id="toast"></div>';
  try{
    var results=await Promise.all([marketFetch("/seller/profile"),marketFetch("/me"),marketFetch("/plans"),marketFetch("/subscriptions/me")]);
    var profile=results[0].profile,listings=results[1].listings,plans=results[2].plans,sub=results[3].subscription;
    var params=new URLSearchParams(location.search),reference=params.get("reference")||params.get("trxref");
    if(reference){try{await marketFetch("/payments/verify?reference="+encodeURIComponent(reference),{method:"POST"});sub=(await marketFetch("/subscriptions/me")).subscription}catch(e){toast("Payment verification is still pending")}}
    var content=document.getElementById("sellerDashboardContent");
    content.innerHTML='<div class="sectionhead"><div><span class="eyebrow darkey">SELLER HUB</span><h1>Manage your marketplace business.</h1><p class="muted">Listings are private until moderation publishes them.</p></div><a class="btn red" href="sell-on-twins.html">Create listing →</a></div>'+
    '<div class="sellerKpis"><div><b>'+listings.length+'</b><span>Total listings</span></div><div><b>'+listings.filter(function(x){return x.status==="published"}).length+'</b><span>Published</span></div><div><b>'+statusLabel(profile?profile.verificationStatus:"pending")+'</b><span>Seller verification</span></div><div><b>'+statusLabel(sub?sub.status:"starter")+'</b><span>Membership</span></div></div>'+
    (!profile?'<div class="panel enquiry"><div><b>Seller profile not created yet.</b><p class="muted">Create your profile when you submit your first listing.</p></div></div>':
    '<div class="panel enquiry"><div><b>'+esc(profile.displayName)+'</b><p class="muted">'+esc(profile.location||"Location not set")+' · '+statusLabel(profile.verificationStatus)+'</p></div>'+(sub&&sub.gateway==="paystack"&&sub.status==="active"?'<button class="btn light" onclick="manageSellerSubscription()">Manage membership</button>':"")+'</div>')+
    '<section class="sectioninner"><div class="sectionhead"><div><span class="eyebrow darkey">SELLER MEMBERSHIP</span><h2>Choose how much marketplace capacity you need.</h2></div></div><div class="grid">'+plans.map(function(p){var active=sub&&sub.plan===p.name&&sub.status==="active";return'<article class="planCard"><span class="eyebrow darkey">'+esc(p.billing)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.price?money(p.price,p.currency):"Free")+'</p><p>'+p.features.map(esc).join(" · ")+'</p><button class="btn '+(active?"light":"red")+'" '+((p.billing!=="free"&&!p.configured)?'disabled':"")+' onclick="chooseSellerPlan(\''+esc(p.name)+'\')">'+(active?"Current plan":(p.billing==="free"?"Use free plan":"Choose plan"))+'</button></article>'}).join("")+'</div><p class="muted small">Paid seller plans use Paystack recurring billing. Payment status is confirmed by the server, not by the browser callback alone.</p></section>'+
    '<section class="sectioninner"><div class="sectionhead"><div><span class="eyebrow darkey">YOUR LISTINGS</span><h2>Listings</h2></div></div>'+(listings.length?'<div class="grid">'+listings.map(function(x){return'<article class="card marketcard"><div>'+mediaMarkup(x.media)+'</div><div class="cardbody"><span class="realbadge">'+statusLabel(x.status)+'</span><h3>'+esc(x.title)+'</h3><p class="muted">'+esc(x.category)+' · '+esc(x.location||"No location")+'</p><p>'+esc(x.description)+'</p><b>'+money(x.price,x.currency)+'</b><div class="cardactions"><a class="btn light mini" href="marketplace.html?id='+encodeURIComponent(x.id)+'">View</a><button class="btn light mini" onclick="editSellerListing(\''+esc(x.id)+'\')">Edit</button>'+(x.status!=="published"?'<button class="btn light mini" onclick="deleteSellerListing(\''+esc(x.id)+'\')">Delete</button>':"")+'</div></div></article>'}).join("")+'</div>':'<div class="empty"><h3>No listings yet.</h3><a class="btn red" href="sell-on-twins.html">Create your first listing →</a></div>')+'</section>';
  }catch(e){
    document.getElementById("sellerDashboardContent").innerHTML='<div class="empty"><h2>Seller Hub could not load.</h2><p class="muted">'+esc(e.message)+'</p><button class="btn red" onclick="location.reload()">Try again</button></div>';
  }
}
async function chooseSellerPlan(name){
  try{
    var r=await marketFetch("/seller-plan",{method:"POST",body:JSON.stringify({plan:name})});
    if(r.payment&&r.payment.authorizationUrl){location.href=r.payment.authorizationUrl;return}
    toast("Membership activated");
    setTimeout(function(){location.reload()},500);
  }catch(e){toast(e.message)}
}
async function manageSellerSubscription(){
  try{var r=await marketFetch("/subscriptions/me/manage-link");if(r.url)location.href=r.url;else toast("Subscription management link unavailable")}catch(e){toast(e.message)}
}
async function editSellerListing(id){
  var title=prompt("New listing title:");if(title===null)return;
  var description=prompt("New description:");if(description===null)return;
  try{
    var current=(await marketFetch("/listings/"+encodeURIComponent(id))).listing;
    await marketFetch("/listings/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({title:title.trim(),category:current.category,description:description.trim(),priceMode:current.priceMode,price:current.price,location:current.location})});
    toast("Listing updated and sent back for review");setTimeout(function(){location.reload()},500);
  }catch(e){toast(e.message)}
}
async function deleteSellerListing(id){
  if(!confirm("Delete this listing?"))return;
  try{await marketFetch("/listings/"+encodeURIComponent(id),{method:"DELETE"});toast("Listing deleted");setTimeout(function(){location.reload()},500)}catch(e){toast(e.message)}
}
if(page==="marketplace.html")marketplace();
if(page==="sell-on-twins.html")sellOnTwins();
if(page==="seller-dashboard.html")sellerDashboard();
window.reportMarketplaceListing=reportMarketplaceListing;
window.sellerImagePreview=sellerImagePreview;
window.chooseSellerPlan=chooseSellerPlan;
window.manageSellerSubscription=manageSellerSubscription;
window.editSellerListing=editSellerListing;
window.deleteSellerListing=deleteSellerListing;
})();
