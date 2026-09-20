var page=location.pathname.split('/').pop()||'index.html';

// Phase 6 final media guard: every catalogue card gets a relevant visual reference.
var FINAL_MEDIA_RULES=[
[/deep freezer|chest freezer|upright freezer|display chiller|refrigerator|freezer/i,"https://ng.jumia.is/unsafe/fit-in/150x150/filters%3Afill%28white%29/product/78/0913104/1.jpg?1026="],
[/food warmer|bain marie|warming cabinet|display warmer/i,"https://ng.jumia.is/unsafe/fit-in/150x150/filters%3Afill%28white%29/product/12/4456814/1.jpg?5287="],
[/meat slicer|meat cutter|food slicer/i,"https://ng.jumia.is/unsafe/fit-in/150x150/filters%3Afill%28white%29/product/61/7686914/1.jpg?1535="],
[/extraction hood|extractor hood|exhaust hood|ventilation hood|range hood/i,"https://pictures-nigeria.jijistatic.net/201050015_NjIwLTQ2NS1hOWYxNTk4ZGUz.webp"],
[/dstv|gotv|decoder|satellite/i,"https://www.dstv.com/media/secccbpm/7s-hd-single-view.png?anchor=center&mode=crop&rnd=132894551843430000&width=737"],
[/single burner|one burner|1 burner/i,"https://www.mutbex.com/remta-cej21l-taban-rafli-tek-gozlu-gazli-ocak-45x505x806-cm-gazli-ocaklar-remta-59097-26-B.jpg"],
[/two burner|2 burner/i,"https://image.made-in-china.com/2f0j00wKmYEMVkfPop/Commercial-Kitchen-Equipment-Table-Top-Gas-Stove.webp"],
[/three burner|3 burner/i,"https://cdn.myikas.com/images/42158d38-d603-46cf-81ea-1639749e332d/0e45f817-b321-4f3e-9b86-5be1d127a60a/3840/cej25l.webp"],
[/four burner|4 burner/i,"https://www.gastrodiscount.info/media/image/product/6212/lg/gasherd-serie-900-4-brenner-9999-36-kw-g20-900x900x850-mm-bxtxh.jpg"],
[/six burner|6 burner|gas range|cooking range/i,"https://cdn11.bigcommerce.com/s-bco4q2hsce/images/stencil/572x712/products/11486/26037/gbs6ts_1__73519.1735426729.JPG?c=2"],
[/spiral mixer|dough mixer/i,"https://www.hobartcorp.com/sites/default/files/styles/max_1300x1300/public/webdam-assets/Spiral%20Mixer%20HSL130%20f%20.png?itok=XAbWgPIq"],
[/planetary mixer|cake mixer/i,"https://cdnimg.webstaurantstore.com/images/products/large/52221/833586.jpg"],
[/convection oven|deck oven|bakery oven|commercial oven/i,"https://www.ekmekciler.gen.tr/Dosyalar/UrunResim/maksan-mkf-10-digi-konveksiyonlu-firin_3172.jpg"],
[/food processor/i,"https://uploads.prod01.sydney.platformos.com/instances/647/assets/modules/homepage/webapp_uploads/blog/images/robotcoupe-r301ultrafoodprocessor21772766060899-1772766063538.png"],
[/vegetable cutter|vegetable slicer/i,"https://www.italyline.rs/f/pics/Seckalice-za-povrce/seckalica-za-povrce-samic-CA301_b.jpg"],
[/deep fryer|fryer/i,"https://static.wixstatic.com/media/5a52bd_9f8c850b0b774d08a518f345fa350174~mv2.webp/v1/fill/w_570%2Ch_570%2Cal_c%2Cq_80%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/5a52bd_9f8c850b0b774d08a518f345fa350174~mv2.webp"],
[/juice extractor|juice machine|juicer/i,"https://www.robot-coupe.com/robot-coupe-global/Products/Extracteurs%20de%20Jus/image-thumb__21468__RBC_cover_center_1140_580/J%2080.webp"],
[/coffee machine|espresso machine|coffee grinder/i,"https://coffeeya.net/data/editor/goods/1/2020/07/3996_a517ae935e170bfaf94ea2e0a803ef401335531.jpg"],
[/storage rack|shelving|wall shelf|wall cabinet/i,"https://s.alicdn.com/@sc04/kf/H3a01c6919809452a9e4267fc8a5564a6H/CFT-Customized-Stainless-Steel-Square-Tube-Kitchen-Shelving-NSF-Certification-Heavy-Duty-Capacity-Casters-for-Commercial-Use.jpg"],
[/three compartment sink|hand wash sink|sink station|stainless sink/i,"https://cdnimg.webstaurantstore.com/images/products/large/29087/2402747.jpg"],
[/ice cream machine|frozen dessert/i,"https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=1200&q=85"],
[/work table|prep table|stainless table/i,"https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=85"],
[/dining chair|restaurant chair|banquet table/i,"https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85"],
[/gas griddle|griddle|shawarma grill|pizza oven/i,"https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=1200&q=85"]
];
var FINAL_CATEGORY_MEDIA={
"Cooking Equipment":["https://cdn11.bigcommerce.com/s-bco4q2hsce/images/stencil/572x712/products/11486/26037/gbs6ts_1__73519.1735426729.JPG?c=2","https://image.made-in-china.com/2f0j00wKmYEMVkfPop/Commercial-Kitchen-Equipment-Table-Top-Gas-Stove.webp","https://static.wixstatic.com/media/5a52bd_9f8c850b0b774d08a518f345fa350174~mv2.webp/v1/fill/w_570%2Ch_570%2Cal_c%2Cq_80%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/5a52bd_9f8c850b0b774d08a518f345fa350174~mv2.webp"],
"Bakery Equipment":["https://www.hobartcorp.com/sites/default/files/styles/max_1300x1300/public/webdam-assets/Spiral%20Mixer%20HSL130%20f%20.png?itok=XAbWgPIq","https://cdnimg.webstaurantstore.com/images/products/large/52221/833586.jpg","https://www.ekmekciler.gen.tr/Dosyalar/UrunResim/maksan-mkf-10-digi-konveksiyonlu-firin_3172.jpg"],
"Food Preparation":["https://uploads.prod01.sydney.platformos.com/instances/647/assets/modules/homepage/webapp_uploads/blog/images/robotcoupe-r301ultrafoodprocessor21772766060899-1772766063538.png","https://www.italyline.rs/f/pics/Seckalice-za-povrce/seckalica-za-povrce-samic-CA301_b.jpg","https://ng.jumia.is/unsafe/fit-in/150x150/filters%3Afill%28white%29/product/61/7686914/1.jpg?1535="],
"Cold Storage":["https://ng.jumia.is/unsafe/fit-in/150x150/filters%3Afill%28white%29/product/78/0913104/1.jpg?1026=","https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=1200&q=85"],
"Bar & Beverage":["https://coffeeya.net/data/editor/goods/1/2020/07/3996_a517ae935e170bfaf94ea2e0a803ef401335531.jpg","https://www.robot-coupe.com/robot-coupe-global/Products/Extracteurs%20de%20Jus/image-thumb__21468__RBC_cover_center_1140_580/J%2080.webp","https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=1200&q=85"],
"Storage":["https://s.alicdn.com/@sc04/kf/H3a01c6919809452a9e4267fc8a5564a6H/CFT-Customized-Stainless-Steel-Square-Tube-Kitchen-Shelving-NSF-Certification-Heavy-Duty-Capacity-Casters-for-Commercial-Use.jpg","https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=85"],
"Ventilation":["https://pictures-nigeria.jijistatic.net/201050015_NjIwLTQ2NS1hOWYxNTk4ZGUz.webp"],
"Serving Equipment":["https://ng.jumia.is/unsafe/fit-in/150x150/filters%3Afill%28white%29/product/12/4456814/1.jpg?5287=","https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85"],
"Restaurant & Hotel":["https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85"],
"Catering Supplies":["https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85"],
"Kitchen Equipment":["https://cdnimg.webstaurantstore.com/images/products/large/29087/2402747.jpg","https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=85"]
};
/* Phase Six strict media gate: these supplied/local mappings were audited as visually mismatched to their product titles.
   They must remain pending until an exact product photo is sourced; never silently reuse a nearby product image. */
var PHASE_SIX_MEDIA_BLOCKLIST={54:"One-Bag Bakery Oven is not represented by the supplied deck-oven stack image.",76:"Commercial Chest Freezer - Large is not represented by the supplied ice-cream-machine image.",77:"Commercial Undercounter Refrigerator is not represented by the supplied refrigerated-display-case image.",86:"Stainless Wall Shelf - 4ft is not represented by the supplied retail-shelf image.",88:"Heavy-Duty 4-Tier Storage Rack is not represented by the supplied retail-shelf image."};
var __twinsOverrideById=null;
function buildOverrideMap(){
 if(__twinsOverrideById)return __twinsOverrideById;
 __twinsOverrideById={};
 P.forEach(function(p){
   var name=String(p.n||"").toLowerCase().trim();
   var matches=Object.keys(CATALOG_MEDIA_OVERRIDES||{}).filter(function(k){
     var key=String(k).toLowerCase().trim();
     return key&&name.indexOf(key)>-1;
   }).sort(function(a,b){return b.length-a.length});
   if(matches.length)__twinsOverrideById[p.id]=CATALOG_MEDIA_OVERRIDES[matches[0]];
 });
 return __twinsOverrideById;
}
function mediaCandidateFor(p){
 if(PHASE_SIX_MEDIA_BLOCKLIST[p.id])return {src:"",status:"pending",source:"strict media audit blocked mismatched supplied image"};
 var idOverride=(typeof CATALOG_MEDIA_OVERRIDES_BY_ID!=="undefined"&&CATALOG_MEDIA_OVERRIDES_BY_ID[p.id])||"";
 if(idOverride)return {src:idOverride,status:"reference",source:"verified product reference",sourceKey:"product-id-"+p.id};
 var overrides=buildOverrideMap(),override=overrides[p.id];
 if(override)return {src:override,status:"reference",source:"verified product reference",sourceKey:String(p.n||"")};
 if(p.media&&p.media.images&&p.media.images.length&&String(p.media.source||"").indexOf("supplied Twins")===0){
   return {src:p.media.images[0],status:"twins",source:p.media.source};
 }
 if(p.media&&p.media.images&&p.media.images.length&&String(p.media.source||"").indexOf("verified product reference")===0){
   return {src:p.media.images[0],status:"reference",source:p.media.source};
 }
 if(p.i&&String(p.i).indexOf("assets/media/")===0){
   return {src:p.i,status:"twins",source:"local Twins catalogue media"};
 }
 if(p.i&&p.media&&p.media.images&&p.media.images.indexOf(p.i)>-1&&String(p.media.source||"").indexOf("verified product reference")===0){
   return {src:p.i,status:"reference",source:p.media.source};
 }
 return {src:"",status:"pending",source:"product photo verification required"};
}
var __twinsFinalMediaById=null;
function buildFinalMediaMap(){
 if(__twinsFinalMediaById)return __twinsFinalMediaById;
 __twinsFinalMediaById={};
 var seen={};
 P.forEach(function(p){
   var candidate=mediaCandidateFor(p);
   if(candidate.src&&seen[candidate.src]){
     __twinsFinalMediaById[p.id]={src:"",status:"pending",source:"duplicate media blocked; product photo verification required"};
     return;
   }
   if(candidate.src)seen[candidate.src]=true;
   __twinsFinalMediaById[p.id]=candidate;
 });
 return __twinsFinalMediaById;
}
function finalMediaFor(p){
 if(!p)return {src:"",status:"pending",source:"product photo verification required"};
 return buildFinalMediaMap()[p.id]||{src:"",status:"pending",source:"product photo verification required"};
}
function productMedia(p){return finalMediaFor(p)}
function mediaPlaceholder(p){return "assets/media/twins-product-photo-pending.svg"}
function mediaAudit(){
 var seen={},verified=0,pending=0,duplicates=0;
 P.forEach(function(p){
   var m=finalMediaFor(p);
   if(m.src){verified++;seen[m.src]=(seen[m.src]||0)+1}
   else pending++;
 });
 Object.keys(seen).forEach(function(k){if(seen[k]>1)duplicates+=seen[k]-1});
 return {catalogue:P.length,verified:verified,pending:pending,duplicates:duplicates,uniqueMedia:verified};
}
function money(n){return '₦'+Number(n).toLocaleString('en-NG')}
function whatsappUrl(text){return SITE_CONFIG.whatsappUrl+(text?'?text='+encodeURIComponent(text):'')}function apiBase(){return String(SITE_CONFIG.apiBase||'').replace(/\/$/,'')}function isNetworkError(e){return !e||!e.status}async function apiRequest(path,options){var base=apiBase();if(!base)throw new Error('API not configured');var opts=Object.assign({credentials:'include',headers:{'Content-Type':'application/json'}},options||{});var r=await fetch(base+path,opts);var data={};try{data=await r.json()}catch(e){}if(!r.ok){var err=new Error(data.detail||'Request failed');err.status=r.status;throw err}return data}
function applySeo(){var map={
'index.html':['Twins Kitchen | Commercial Kitchen & Bakery Equipment','Commercial kitchen, bakery, restaurant, hotel, catering and hospitality equipment from Twins Kitchen in Alaba, Nigeria.'],
'products.html':['Commercial Equipment Store | Twins Kitchen','Browse commercial cooking, bakery, food preparation, cold storage, serving, catering and hospitality equipment.'],
'product.html':['Equipment Product | Twins Kitchen','View equipment specifications, media, related equipment and request a current quotation from Twins Kitchen.'],
'categories.html':['Equipment Categories | Twins Kitchen','Explore commercial equipment areas for cooking, baking, preparation, cold storage, serving, storage and hospitality.'],
'category.html':['Equipment Area | Twins Kitchen','Explore equipment and supplied media within a commercial equipment category.'],
'build-your-business.html':['Business Equipment Planner | Twins Kitchen','Plan equipment around a restaurant, bakery, hotel, catering business, bar or café.'],
'bundles.html':['Kitchen Equipment Packages | Twins Kitchen','Explore structured starter equipment packages for different commercial food businesses.'],
'guides.html':['Buying Guides | Twins Kitchen','Practical buying guidance for commercial kitchen, bakery and hospitality equipment.'],
'resources.html':['Resource Centre | Twins Kitchen','Planning resources for commercial kitchen and hospitality equipment projects.'],
'showroom.html':['Visual Showroom | Twins Kitchen','See supplied Twins equipment imagery and explore related commercial equipment areas.'],
'support.html':['Equipment Support | Twins Kitchen','Support information for equipment enquiries, specifications, delivery and installation discussions.'],
'quote.html':['Request a Quote | Twins Kitchen','Prepare a structured commercial equipment quotation request with your project requirements.'],
'dashboard.html':['My Equipment Workspace | Twins Kitchen','Manage saved equipment, project briefs, quote requests and account workspace information.'],
'contact.html':['Contact Twins Kitchen','Contact Twins Kitchen in Alaba International Market for equipment enquiries.'],
'equipment-finder.html':['Equipment Finder | Twins Kitchen','Find equipment by business type, equipment area and search term.'],
'project-planner.html':['Project Planner | Twins Kitchen','Create and save a commercial kitchen or bakery project brief before requesting equipment.'],
'faq.html':['FAQ | Twins Kitchen','Answers to common questions about equipment enquiries, pricing, delivery, installation and support.'],
'delivery.html':['Delivery & Collection | Twins Kitchen','Information to discuss delivery, collection, logistics and installation requirements for equipment.'],
'about.html':['About Twins Kitchen','Learn about Twins Kitchen and its commercial equipment focus.'],
'media.html':['Equipment Media | Twins Kitchen','View supplied Twins equipment photos and videos used across the commercial equipment catalogue.'],
'services.html':['Equipment Services | Twins Kitchen','Explore equipment discovery, planning, quotation preparation and project discussions.'],
'industries.html':['Industries | Twins Kitchen','Explore equipment planning paths for restaurants, bakeries, hotels, catering, bars and cafés.'],
'privacy.html':['Privacy | Twins Kitchen','Privacy information for the current Twins storefront and future production services.'],
'terms.html':['Terms | Twins Kitchen','Terms information for the current Twins storefront.'],
'returns.html':['Returns & Order Issues | Twins Kitchen','Information for discussing equipment discrepancies, returns and future online-order processes.'],
'admin.html':['Admin Workspace | Twins Kitchen','Private operations workspace for authorised staff and administrators.']};var m=map[page]||['Twins Kitchen','Professional commercial kitchen, bakery and hospitality equipment.'];document.title=m[0];var d=document.querySelector('meta[name="description"]');if(!d){d=document.createElement('meta');d.name='description';document.head.appendChild(d)}d.content=m[1];var v=document.querySelector('meta[name="viewport"]');if(!v){v=document.createElement('meta');v.name='viewport';v.content='width=device-width, initial-scale=1';document.head.appendChild(v)}var theme=document.querySelector('meta[name="theme-color"]');if(!theme){theme=document.createElement('meta');theme.name='theme-color';document.head.appendChild(theme)}theme.content='#d71920';var canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}canonical.href=location.href.split('?')[0];var og=[['og:title',m[0]],['og:description',m[1]],['og:type','website']];og.forEach(function(x){var e=document.querySelector('meta[property="'+x[0]+'"]');if(!e){e=document.createElement('meta');e.setAttribute('property',x[0]);document.head.appendChild(e)}e.content=x[1]});var ld=document.getElementById('twins-schema');if(!ld){ld=document.createElement('script');ld.id='twins-schema';ld.type='application/ld+json';document.head.appendChild(ld)}ld.textContent=JSON.stringify({'@context':'https://schema.org','@type':'LocalBusiness','name':SITE_CONFIG.name,'description':m[1],'telephone':SITE_CONFIG.phoneDisplay,'email':SITE_CONFIG.email,'address':{'@type':'PostalAddress','streetAddress':'Alaba International Market','addressLocality':'Lagos','addressRegion':'Lagos','addressCountry':'NG'},'openingHours':'Mo-Su 00:00-23:59','url':location.origin+location.pathname,'founder':{'@type':'Person','name':OWNER_PROFILE.name,'jobTitle':OWNER_PROFILE.role},'areaServed':['Nigeria','Africa']});}
function emailUrl(subject,body){return 'mailto:'+encodeURIComponent(SITE_CONFIG.email)+'?subject='+encodeURIComponent(subject||'Equipment enquiry')+'&body='+encodeURIComponent(body||'Hello Twins Kitchen,\n\nI would like to enquire about commercial equipment.')}
function get(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}}
function put(k,v){localStorage.setItem(k,JSON.stringify(v))}
function cart(){return get('twins_cart',[])}
function saved(){return get('twins_saved',[])}
function viewed(){return get('twins_viewed',[])}
function compare(){return get('twins_compare',[])}
function saveCart(c){put('twins_cart',c);renderBadges()}
function savedLists(){return get('twins_equipment_lists',[])}
function cartMessage(){
var items=cart().map(function(x){var p=P.find(function(y){return y.id==x.id});return p?'• '+p.n+' — quantity '+x.q:''}).filter(Boolean).join('\n');
return 'Hello Twins Kitchen. I would like to enquire about this equipment list.\n\n'+(items||'No selected products')+'\n\nPlease confirm current price, stock, specifications, delivery and installation requirements.';
}
function saveEquipmentList(){
var items=cart();
if(!items.length){toast('Add equipment before saving a list');return}
var name=prompt('Give this equipment list a name:', 'My equipment plan');
if(!name||!name.trim())return;
var lists=savedLists();
lists.unshift({name:name.trim(),createdAt:new Date().toISOString(),items:items.map(function(x){return{id:x.id,q:x.q}})});
put('twins_equipment_lists',lists.slice(0,20));
toast('Equipment list saved');
}
function restoreEquipmentList(i){
var list=savedLists()[i];
if(!list)return;
put('twins_cart',list.items||[]);
renderBadges();
location.href='cart.html';
}
function deleteEquipmentList(i){
var lists=savedLists();
if(!lists[i])return;
lists.splice(i,1);
put('twins_equipment_lists',lists);
location.reload();
}
function savedListMarkup(){
var lists=savedLists();
if(!lists.length)return '<div class="empty"><h3>No saved equipment lists yet.</h3><p class="muted">Save a cart when you are planning a purchase.</p><a class="btn light" href="products.html">Browse equipment</a></div>';
return '<div class="savedlists">'+lists.map(function(l,i){
var count=(l.items||[]).reduce(function(a,x){return a+x.q},0);
var names=(l.items||[]).map(function(x){var p=P.find(function(y){return y.id==x.id});return p?p.n+' × '+x.q:''}).filter(Boolean).slice(0,3);
return '<article class="savedlist"><div><span class="eyebrow darkey">SAVED LIST · '+String(i+1).padStart(2,'0')+'</span><h3>'+l.name+'</h3><p class="muted">'+count+' item(s) · '+(l.createdAt?new Date(l.createdAt).toLocaleDateString('en-NG'):'Saved locally')+'</p><p class="small muted">'+(names.join(' · ')||'Equipment list')+(names.length<(l.items||[]).length?' · and more':'')+'</p></div><div class="savedlistactions"><button class="btn red mini" onclick="restoreEquipmentList('+i+')">Load into cart</button><button class="btn light mini" onclick="deleteEquipmentList('+i+')">Delete</button></div></article>';
}).join('')+'</div>';
}
function renderBadges(){var c=cart().reduce((a,x)=>a+x.q,0),s=saved().length;document.querySelectorAll('[data-cart-count]').forEach(x=>x.textContent=c);document.querySelectorAll('[data-save-count]').forEach(x=>x.textContent=s)}
function add(id){var c=cart(),x=c.find(a=>a.id==id);if(x)x.q++;else c.push({id:Number(id),q:1});saveCart(c);toast('Added to cart')}
function addQuantity(id){var q=Math.max(1,Number(document.getElementById('productQty')?.value||1)),c=cart(),x=c.find(a=>a.id==id);if(x)x.q+=q;else c.push({id:Number(id),q:q});saveCart(c);toast(q+' item(s) added to equipment list')}
function removeCart(id){saveCart(cart().filter(x=>x.id!=id));location.reload()}
function qty(id,d){var c=cart(),x=c.find(a=>a.id==id);if(!x)return;x.q=Math.max(1,x.q+d);saveCart(c);location.reload()}
function toggleSave(id){var a=saved(),i=a.indexOf(Number(id));if(i>-1)a.splice(i,1);else a.push(Number(id));put('twins_saved',a);renderBadges();toast(i>-1?'Removed from saved':'Saved for later');if(page==='wishlist.html')location.reload()}
function toggleCompare(id){var a=compare(),i=a.indexOf(Number(id));if(i>-1)a.splice(i,1);else{if(a.length>=4){toast('Compare up to 4 products');return}a.push(Number(id))}put('twins_compare',a);renderBadges();toast(i>-1?'Removed from compare':'Added to compare')}
function view(id){var a=viewed().filter(x=>x!=Number(id));a.unshift(Number(id));put('twins_viewed',a.slice(0,8))}
function toast(t){var e=document.getElementById('toast');if(!e){e=document.createElement('div');e.id='toast';document.body.appendChild(e)}e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
function toggleMobileMenu(){var m=document.getElementById('mobileMenu'),b=document.querySelector('.mobilemenu');if(!m)return;var open=m.classList.toggle('open');m.setAttribute('aria-hidden',String(!open));if(b)b.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menuopen',open)}
function head(){
var logged=!!get('twins_user',null),count=cart().reduce(function(a,x){return a+x.q},0),saveCount=saved().length;
return '<div class="top"><div class="wrap"><span>Professional kitchen, bakery & hospitality equipment</span><span class="topright">'+SITE_CONFIG.address+' · '+SITE_CONFIG.hours+' · '+SITE_CONFIG.phoneDisplay+'</span></div></div>'+
'<nav class="nav"><div class="wrap navin"><a class="logo" href="index.html"><img class="brandlogo" src="brand.svg" alt="Twins Kitchen"><span>TWINS KITCHEN</span></a>'+
'<form class="search" onsubmit="event.preventDefault();location.href=\'products.html?q=\'+encodeURIComponent(this.q.value)"><input name="q" list="productSuggestions" autocomplete="off" placeholder="Search equipment, ovens, mixers, freezers..."><datalist id="productSuggestions">'+P.slice(0,180).map(function(p){return '<option value="'+p.n.replace(/"/g,'&quot;')+'">'}).join('')+'</datalist><button aria-label="Search">⌕</button></form>'+
'<div class="actions"><a href="wishlist.html" title="Saved">♡ <span data-save-count>'+saveCount+'</span></a><a href="compare.html" title="Compare">⇄</a><a href="'+(logged?'dashboard.html':'login.html')+'" title="Account">◯</a><a href="cart.html" title="Equipment list">🛒 <span data-cart-count>'+count+'</span></a><button class="mobilemenu" aria-label="Open menu" aria-expanded="false" onclick="toggleMobileMenu()">☰</button></div></div>'+
'<div class="wrap navlinks"><a class="navhome" href="index.html">Home</a><a href="products.html">Equipment</a><a href="categories.html">Categories</a><a href="industries.html">Businesses</a><a href="bundles.html">Packages</a><a href="guides.html">Guides</a><a href="equipment-finder.html">Finder</a><a href="marketplace.html">Marketplace</a><a class="navmore" href="resources.html">More</a></div>'+
'<div id="mobileMenu" class="mobilemenu-panel" aria-hidden="true"><div class="mobilemenu-head"><b>TWINS KITCHEN</b><button aria-label="Close menu" onclick="toggleMobileMenu()">×</button></div><a href="products.html">All Equipment</a><a href="categories.html">Shop by Area</a><a href="industries.html">Shop by Business</a><a href="bundles.html">Kitchen Packages</a><a href="equipment-finder.html">Equipment Finder</a><a href="project-planner.html">Project Planner</a><a href="guides.html">Buying Guides</a><a href="media.html">Media</a><a href="marketplace.html">Marketplace</a><a href="trust-center.html">Trust Centre</a><a href="sell-on-twins.html">Sell on Twins</a><a href="resources.html">Resource Centre</a><a href="showroom.html">Visual Showroom</a><a href="services.html">How Twins Helps</a><a href="wishlist.html">Saved Products</a><a href="compare.html">Compare</a><a href="cart.html">Equipment List</a><a href="'+(logged?'dashboard.html':'login.html')+'">'+(logged?'My Account':'Sign In / Create Account')+'</a><a href="quote.html">Request a Quote</a><a href="contact.html">Talk to Twins</a></div></nav>'}
function foot()
{return '<footer class="footer"><div class="wrap footgrid"><div><b>'+SITE_CONFIG.name.toUpperCase()+'</b><p>Commercial equipment for kitchens, bakeries, restaurants, hotels, cafés and catering operations.</p><div class="whatsapptrust"><b>Official Twins WhatsApp</b><span>For enquiries, availability and quotes — not for unverified payment requests.</span><a class="whatsapp" href="'+whatsappUrl('Hello Twins Kitchen. I would like to enquire about a product. Please confirm the current price, availability, delivery options and official payment method.')+'" target="_blank" rel="noopener">Start a WhatsApp enquiry →</a></div><br><a href="'+emailUrl('Equipment enquiry','Hello Twins Kitchen,\n\nI would like to enquire about commercial equipment.')+'">Email Twins →</a></div><div><b>Shop</b><p><a href="products.html">All equipment</a><br><a href="categories.html">Categories</a><br><a href="equipment-finder.html">Equipment Finder</a><br><a href="project-planner.html">Project Planner</a><br><a href="media.html">Media</a><br><a href="marketplace.html">Marketplace</a><br><a href="sell-on-twins.html">Sell on Twins</a><br><a href="wishlist.html">Saved products</a><br><a href="compare.html">Compare</a></p></div><div><b>Business</b><p><a href="build-your-business.html">Business planner</a><br><a href="industries.html">Industries</a><br><a href="services.html">How we help</a><br><a href="quote.html">Request a quote</a><br><a href="faq.html">FAQ</a><br><a href="delivery.html">Delivery & collection</a><br><a href="returns.html">Returns & order issues</a></p></div><div><b>Visit</b><p>'+SITE_CONFIG.address+'<br>'+SITE_CONFIG.phoneDisplay+'<br>'+SITE_CONFIG.hours+'<br>'+SITE_CONFIG.email+'</p><a href="contact.html">Contact & directions →</a><br><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></div></div><a class="whatsapp-float" href="'+whatsappUrl('Hello Twins Kitchen. I would like to enquire about a product. Please confirm the current price, availability, delivery options and official payment method.')+'" target="_blank" rel="noopener" aria-label="Start an official Twins WhatsApp enquiry">Official WhatsApp · Enquire</a><div class="wrap copyright">© 2026 '+SITE_CONFIG.name+' · Built for real business buying.</div></footer>'}
function cards(list){
return list.map(function(p){
var media=productMedia(p),src=media.src||mediaPlaceholder(p),statusLabel=media.status==="twins"?"TWINS MEDIA":(media.status==="pending"?"PHOTO PENDING":"REFERENCE IMAGE");
return '<article class="prod"><div class="prodimg"><a href="product.html?id='+p.id+'"><img src="'+src+'" alt="'+p.n+' reference image" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'assets/media/twins-product-photo-pending.svg\'"></a><span class="badge">'+(p.tag||'Equipment')+'</span><span class="mediaflag">'+statusLabel+'</span><button class="icon save '+(saved().includes(p.id)?'active':'')+'" onclick="toggleSave('+p.id+');return false" aria-label="Save '+p.n+'">♡</button></div><div class="prodbody"><small class="muted">'+p.c+'</small><a href="product.html?id='+p.id+'"><h3>'+p.n+'</h3></a><p class="desc">'+p.desc+'</p><div class="price">'+SITE_CONFIG.priceLabel+'</div><small class="tiny muted price-note">Reference image · exact model, stock and current price confirmed with Twins.</small><div class="cardactions"><button class="btn red" onclick="add('+p.id+')">Build quote</button><button class="btn light mini" onclick="toggleCompare('+p.id+')" aria-label="Compare '+p.n+'">⇄</button></div><a class="cardwhatsapp" target="_blank" rel="noopener" href="'+whatsappUrl('Hello Twins Kitchen. I am interested in '+p.n+'. Please confirm the current price, availability, delivery options and official payment method.')+'">Ask on official WhatsApp →</a></div></article>'
}).join('')
}
function sectionTitle
(title,sub,link,href){return '<div class="head"><div><h2>'+title+'</h2><p class="muted">'+sub+'</p></div>'+(link?'<a class="textlink" href="'+href+'">'+link+' →</a>':'')+'</div>'}
function home(){
var recent=viewed().map(function(id){return P.find(function(p){return p.id==id})}).filter(Boolean).slice(0,4),featured=P.slice(0,8),businesses=B.slice(0,6),cats=C.slice(0,8);
document.getElementById('app').innerHTML=head()+'<main>'+
'<section class="hero"><div class="wrap heroGrid"><div class="heroMain"><span class="eyebrow">Professional equipment · Alaba</span><h1>Build the kitchen your business deserves.</h1><p>Find the equipment, workstations, storage and service systems behind serious food businesses.</p><form class="heroSearch" onsubmit="event.preventDefault();location.href=\'products.html?q=\'+encodeURIComponent(this.q.value)"><input name="q" placeholder="Search ovens, mixers, freezers, fryers..."><button>Search equipment</button></form><div class="herolinks"><a class="btn red" href="products.html">Shop equipment →</a><a class="btn light" href="equipment-finder.html">Use Equipment Finder</a></div><div class="heroquick"><a href="industries.html">Shop by business</a><a href="categories.html">Shop by area</a><a href="bundles.html">Kitchen packages</a><a href="quote.html">Request a quote</a></div></div><div class="side"><div class="brandpanel"><img src="brand.svg" alt="Twins Kitchen"><span>Commercial kitchen, bakery, restaurant, hotel, catering, bar and café equipment.</span></div><div class="promo p1"><span class="eyebrow darkey">REAL BUSINESS BUYING</span><h2>Start with the operation.</h2><p class="muted">Choose a business path and build an equipment list around the workflow.</p><a class="btn dark" href="build-your-business.html">Start planning →</a></div></div></div></section>'+
'<section class="section"><div class="wrap"><div class="truststrip"><div><b>'+P.length+'</b><span>catalogue references</span></div><div><b>'+C.length+'</b><span>equipment areas</span></div><div><b>'+B.length+'</b><span>business paths</span></div><div><b>QUOTE</b><span>current pricing confirmed with Twins</span></div></div></div></section>'+
'<section class="section"><div class="wrap">'+sectionTitle("Shop by business","Choose what you are building, then explore the equipment.","View all businesses","industries.html")+'<div class="businessstrip">'+businesses.map(function(b,i){return '<a class="businesscard" href="build-your-business.html?type='+encodeURIComponent(b[0])+'"><div class="businessnum">0'+(i+1)+'</div><h3>'+b[0]+'</h3><p>'+b[1]+'</p><span>Explore setup →</span></a>'}).join('')+'</div></div></section>'+
'<section class="section soft"><div class="wrap">'+sectionTitle("Featured equipment","A focused selection. The full catalogue contains "+P.length+" structured references.","Browse all equipment","products.html")+'<div class="grid">'+cards(featured)+'</div></div></section>'+
'<section class="section"><div class="wrap">'+sectionTitle("Shop by area","Move through the catalogue by the part of the operation you need to equip.","View all areas","categories.html")+'<div class="workflow">'+cats.map(function(x,i){return '<a href="products.html?cat='+encodeURIComponent(x[0])+'"><b>0'+String(i+1).padStart(2,'0')+'</b><span>'+x[0]+'</span><small>'+x[1]+' →</small></a>'}).join('')+'</div></div></section>'+
'<section class="section soft"><div class="wrap"><div class="editorial"><div><span class="eyebrow darkey">EQUIPMENT FINDER</span><h2>Not sure what equipment fits the business?</h2><p class="muted">Use the finder to combine business type, equipment area and a search term. Save, compare or build a quotation list from the results.</p><div class="guidepoints"><a href="equipment-finder.html"><b>01</b><span>Find equipment</span><small>Search by job or business →</small></a><a href="project-planner.html"><b>02</b><span>Plan the project</span><small>Capture space, capacity and utilities →</small></a><a href="quote.html"><b>03</b><span>Request pricing</span><small>Send one structured enquiry →</small></a></div></div><div class="editorialimage"><img src="assets/media/twins-product-photo-pending.svg" alt="Commercial equipment showroom" loading="lazy"></div></div></div></section>'+
'<section class="section"><div class="wrap"><div class="sectionhead"><div><span class="eyebrow darkey">SMART PACKAGES</span><h2>Kitchen packages for common setups.</h2><p class="muted">Planning templates to help you start. Exact equipment and pricing are confirmed with Twins.</p></div><a class="textlink" href="bundles.html">View packages →</a></div><div class="packagehomegrid">'+KITCHEN_PACKAGES.slice(0,4).map(function(x){return '<a class="packagecard" href="bundles.html?id='+encodeURIComponent(x.id)+'"><span class="eyebrow darkey">'+x.type+'</span><h3>'+x.name+'</h3><p>'+x.intro+'</p><b>Open package →</b></a>'}).join('')+'</div></div></section>'+
'<section class="section darksection"><div class="wrap split"><div><span class="eyebrow">TWINS BUSINESS PLANNER</span><h2>Turn the idea into an equipment brief.</h2><p>Tell us the business, capacity, space and utilities. Then combine the brief with your equipment list.</p><a class="btn red" href="project-planner.html">Open Project Planner →</a></div><div class="quotevisual"><span>IDEA</span><strong>→</strong><span>PLAN</span><strong>→</strong><span>ENQUIRE</span></div></div></section>'+
'<section class="section"><div class="wrap"><div class="sectionhead"><div><span class="eyebrow darkey">YOUR WORKSPACE</span><h2>Keep your shortlist together.</h2><p class="muted">Save products, compare up to four and build reusable equipment lists.</p></div><a class="textlink" href="wishlist.html">Open saved workspace →</a></div><div class="workspacehomegrid"><a class="panel" href="wishlist.html"><b>Saved products</b><span>Keep equipment you want to revisit.</span></a><a class="panel" href="compare.html"><b>Compare equipment</b><span>Put up to four references side by side.</span></a><a class="panel" href="cart.html"><b>Equipment list</b><span>Set quantities and request a quotation.</span></a></div></div></section>'+
(recent.length?'<section class="section soft"><div class="wrap">'+sectionTitle("Recently viewed","Continue where you left off.","Open catalogue","products.html")+'<div class="grid">'+cards(recent)+'</div></div></section>':'')+
'<section class="section"><div class="wrap"><div class="panel homepageaccount"><div><span class="eyebrow darkey">TWINS MARKETPLACE</span><h2>Official catalogue and community marketplace stay separate.</h2><p class="muted">Browse Twins equipment or explore seller-submitted listings through a distinct marketplace flow.</p></div><div class="herolinks"><a class="btn red" href="marketplace.html">Explore Marketplace →</a><a class="btn light" href="sell-on-twins.html">Sell on Twins</a></div></div></div></section>'+
'</main>'+foot()+'<div id="toast"></div>';
}
function dashboard()
{
var u=get('twins_user',null);if(!u){location.href='login.html';return}
var c=cart().reduce(function(a,x){return a+x.q},0),sv=saved().length,v=viewed().slice(0,4).map(function(id){return P.find(function(p){return p.id==id})}).filter(Boolean),plan=get('twins_business_plan',null),project=get('twins_project_plan',null),cmp=compare().length,lists=savedLists(),quotes=get('twins_quote_requests',[]);
document.getElementById('dashboard').innerHTML='<div class="dash"><div class="dashbar"><div class="wrap"><b>TWINS CUSTOMER WORKSPACE</b><div class="dashbaractions"><a class="btn light" href="index.html">Storefront</a><button class="btn red" onclick="logout()">Sign out</button></div></div></div><div class="wrap dashgrid"><aside class="menu"><div class="profilemini"><div class="avatar">'+(u.name||'G').charAt(0).toUpperCase()+'</div><b>'+u.name+'</b><small>'+u.email+'</small></div><a class="active" href="dashboard.html">Overview</a><a href="products.html">Browse equipment</a><a href="wishlist.html">Saved products <span>'+sv+'</span></a><a href="compare.html">Compare <span>'+cmp+'</span></a><a href="cart.html">Cart <span>'+c+'</span></a><a href="#projects">Project brief</a><a href="#quotes">Quotation requests <span>'+quotes.length+'</span></a><a href="#lists">Saved equipment lists <span>'+lists.length+'</span></a><a href="build-your-business.html">Business plans</a><a href="contact.html">Support</a><button class="logoutlink" onclick="logout()">Sign out</button></aside><section><div class="dashwelcome"><div><span class="eyebrow darkey">CUSTOMER WORKSPACE</span><h1>Good to see you, '+u.name+'.</h1><p class="muted">Your saved equipment, planning work and quotation requests are organised here.</p></div></div><div class="stats"><div class="stat"><small>Saved products</small><strong>'+sv+'</strong><a href="wishlist.html">View →</a></div><div class="stat"><small>Cart items</small><strong>'+c+'</strong><a href="cart.html">Review →</a></div><div class="stat"><small>Compared</small><strong>'+cmp+'</strong><a href="compare.html">Compare →</a></div><div class="stat"><small>Quotes prepared</small><strong>'+quotes.length+'</strong><a href="#quotes">View →</a></div><div class="stat"><small>Business plan</small><strong>'+(plan?plan.type:'Not started')+'</strong><a href="build-your-business.html">'+(plan?'Open →':'Start →')+'</a></div></div><section id="projects" class="section compactsection"><div class="head"><div><h2>Project brief</h2><p class="muted">Planning context saved in this browser.</p></div><a class="btn light" href="project-planner.html">Edit brief →</a></div>'+(project?'<div class="workspacebrief"><b>'+project.business+'</b><span>'+project.stage+'</span><span>'+(project.location||'Location not specified')+'</span><span>'+(project.capacity||'Capacity not specified')+'</span><p>'+(project.needs||'No additional requirements recorded.')+'</p></div>':'<div class="empty"><p class="muted">No project brief saved yet.</p><a class="btn light" href="project-planner.html">Create project brief</a></div>')+'</section><section id="quotes" class="section compactsection"><div class="head"><div><h2>Quotation requests</h2><p class="muted">Prepared requests stored locally until the backend is connected.</p></div><a class="btn red" href="quote.html">New quotation →</a></div>'+(quotes.length?'<div class="quotehistory">'+quotes.slice(0,8).map(function(q){return '<div><b>'+q.reference+'</b><span>'+q.business+' · '+q.itemCount+' item(s) · '+new Date(q.createdAt).toLocaleDateString('en-NG')+'</span><small>'+q.status+'</small></div>'}).join('')+'</div>':'<div class="empty"><p class="muted">No quotation requests prepared yet.</p><a class="btn red" href="quote.html">Prepare a request</a></div>')+'</section><section id="lists" class="section compactsection"><div class="head"><div><h2>Saved equipment lists</h2><p class="muted">Reusable planning lists stored in this browser.</p></div><a class="btn light" href="products.html">Add more equipment →</a></div>'+savedListMarkup()+'</section><section class="section compactsection">'+sectionTitle("Recently viewed","Your latest product trail.","See catalogue","products.html")+'<div class="grid">'+(v.length?cards(v):'<div class="empty"><p class="muted">No recently viewed products yet.</p><a class="btn light" href="products.html">Start browsing</a></div>')+'</div></section></section></div></div><div id="toast"></div>'
}
async function syncRemoteQuotes(){
var u=get('twins_user',null);if(!u||!u.remote)return;
try{
var data=await apiRequest('/api/quotes/me',{method:'GET'});
var box=document.querySelector('#quotes .quotehistory');
if(box&&data.quotes){
box.innerHTML=data.quotes.length?data.quotes.map(function(q){return '<div><b>'+q.reference+'</b><span>'+((q.business||'Equipment enquiry'))+' · '+new Date(q.createdAt).toLocaleDateString('en-NG')+'</span><small>'+q.status+'</small></div>'}).join(''):'<p class="muted">No quotation requests found on the account.</p>';
}
}catch(e){}
}
function auth(signup){
var user=get('twins_user',null);
if(!signup&&user){location.href='dashboard.html';return}
document.getElementById('auth').innerHTML='<main class="auth"><div class="authbox"><div class="visual"><span class="eyebrow">TWINS KITCHEN</span><h1>'+(signup?'Start building your business.':'Welcome back.')+'</h1><p>Save equipment, compare products and build your buying list from one customer workspace.</p><div class="authbullets"><span>✓ Save equipment for later</span><span>✓ Compare products side by side</span><span>✓ Keep a business equipment plan</span><span>✓ Prepare quotation requests faster</span></div></div><div class="form"><a class="muted" href="index.html">← Back to store</a><h1>'+(signup?'Create your customer account':'Sign in to your workspace')+'</h1>'+(signup?'<div class="field"><label>Full name</label><input id="name" autocomplete="name" placeholder="Your name"></div>':'')+'<div class="field"><label>Email address</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field"><label>Password</label><div class="passwordrow"><input id="pass" type="password" autocomplete="'+(signup?'new-password':'current-password')+'" placeholder="Password"><button type="button" class="passwordtoggle" onclick="togglePassword(\'pass\',this)">Show</button></div></div>'+(signup?'<div class="field"><label>Confirm password</label><div class="passwordrow"><input id="pass2" type="password" autocomplete="new-password" placeholder="Repeat password"><button type="button" class="passwordtoggle" onclick="togglePassword(\'pass2\',this)">Show</button></div></div>':'')+'<button class="btn red full" onclick="submitAuth('+(signup?'true':'false')+')">'+(signup?'Create account':'Sign in')+' →</button><p class="muted">'+(signup?'Already have an account? ':'New to Twins? ')+'<a class="redtext" href="'+(signup?'login.html':'signup.html')+'">'+(signup?'Sign in':'Create an account')+'</a></p><div class="authnotice"><b>Static storefront mode</b><span>Your demo account is stored in this browser. Production authentication, email verification and password recovery belong in the backend phase.</span></div></div></div></main>'
}
function togglePassword(id,button){
var input=document.getElementById(id);if(!input)return;
var show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide':'Show';
}
async function hashPassword(value){
if(window.crypto&&crypto.subtle){
var bytes=new TextEncoder().encode(value),digest=await crypto.subtle.digest('SHA-256',bytes);
return Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0')}).join('');
}
return value;
}
async function submitAuth(signup){
var email=(document.getElementById('email').value||'').trim().toLowerCase(),pass=document.getElementById('pass').value||'',name=(document.getElementById('name')||{}).value||'Customer';
if(!email||!pass){toast('Enter your email and password');return}
if(signup){
var pass2=document.getElementById('pass2').value||'';
if(!name.trim()){toast('Enter your name');return}
if(pass.length<8){toast('Use at least 8 characters');return}
if(pass!==pass2){toast('Passwords do not match');return}
try{var remote=await apiRequest('/api/auth/signup',{method:'POST',body:JSON.stringify({name:name.trim(),email:email,password:pass})});put('twins_user',{id:remote.user.id,name:remote.user.name,email:remote.user.email,remote:true,role:remote.user.role});localStorage.removeItem('twins_demo_auth');location.href='dashboard.html';return}catch(e){if(!isNetworkError(e)){toast(e.message||'Account creation failed');return}}
var passwordHash=await hashPassword(pass);put('twins_user',{name:name.trim(),email:email,remote:false});put('twins_demo_auth',{email:email,passwordHash:passwordHash});location.href='dashboard.html';
}else{
try{var remote=await apiRequest('/api/auth/login',{method:'POST',body:JSON.stringify({email:email,password:pass})});put('twins_user',{id:remote.user.id,name:remote.user.name,email:remote.user.email,remote:true,role:remote.user.role});localStorage.removeItem('twins_demo_auth');location.href='dashboard.html';return}catch(e){if(!isNetworkError(e)){toast(e.message||'Sign in failed');return}}
var savedUser=get('twins_user',null),demo=get('twins_demo_auth',null),passwordHash=await hashPassword(pass);
if(savedUser&&savedUser.email===email&&demo&&demo.passwordHash===passwordHash){location.href='dashboard.html';return}
toast('Backend unavailable. Create a local demo account first.');
}
}
async function logout(){try{if(get('twins_user',null)?.remote)await apiRequest('/api/auth/logout',{method:'POST'})}catch(e){}localStorage.removeItem('twins_user');localStorage.removeItem('twins_demo_auth');location.href='index.html'}
function guides(){document.getElementById('guides').innerHTML=head()+'<section class="page"><div class="wrap"><span class="eyebrow darkey">TWINS BUYING DESK</span><h1>Buying guides & planning resources</h1><p class="muted">Practical information to help you ask better questions before committing to commercial equipment.</p></div></section><section class="section"><div class="wrap guidegrid">'+BUYING_GUIDES.map(function(g,i){return '<article class="guidecard"><span class="eyebrow darkey">'+g[2]+' · 0'+(i+1)+'</span><h2>'+g[0]+'</h2><p>'+g[1]+'</p><a href="'+g[3]+'">Use this in your planning →</a></article>'}).join('')+'</div></section><section class="section soft"><div class="wrap"><div class="panel enquiry"><div><span class="eyebrow darkey">IMPORTANT</span><h2>Verify the exact equipment before purchase.</h2><p class="muted">Commercial equipment can differ by model in dimensions, utilities, capacity and installation requirements.</p></div><a class="btn red" href="quote.html">Start an equipment request →</a></div></div></section>'+foot()+'<div id="toast"></div>'}
function resources(){document.getElementById('resources').innerHTML=head()+'<section class="page resourcehero"><div class="wrap"><span class="eyebrow darkey">TWINS RESOURCE CENTRE</span><h1>Plan the operation before you buy the equipment.</h1><p class="muted">A central place for buying guides, setup planning, quotation preparation and practical equipment information.</p></div></section><section class="section"><div class="wrap"><div class="resourcegrid">'+RESOURCE_CARDS.map(function(x,i){return '<a class="resourcecard" href="'+x[2]+'"><span class="eyebrow darkey">0'+(i+1)+'</span><h2>'+x[0]+'</h2><p>'+x[1]+'</p><b>'+x[3]+'</b></a>'}).join('')+'</div></div></section><section class="section soft"><div class="wrap"><div class="resourcefeature"><div><span class="eyebrow darkey">EQUIPMENT PLANNING</span><h2>Commercial equipment is a system, not a pile of machines.</h2><p class="muted">Start with what the business needs to prepare, cook, bake, chill, store, serve and move. Then narrow down the equipment.</p><div class="resourcechecks"><span>01 · Business type</span><span>02 · Workflow</span><span>03 · Capacity</span><span>04 · Space</span><span>05 · Utilities</span><span>06 · Delivery</span></div></div><img src="assets/media/twins-product-photo-pending.svg" alt="Commercial kitchen planning"></div></div></section>'+foot()+'<div id="toast"></div>'}
function showroom(){
var gallery=[
["Commercial kitchen","assets/media/twins-commercial-cooking-range-production.jpg","Cooking and hot-line environments"],
["Bakery production","assets/media/twins-deck-oven-stack.jpg","Mixing, baking and production"],
["Prep workspace","assets/media/twins-food-chopper-wj-r07-plus.jpg","Preparation and stainless work areas"],
["Restaurant service","assets/media/twins-supermarket-shelf-blue.jpg","Front-of-house and hospitality"],
["Coffee service","assets/media/twins-commercial-ice-cream-machine.jpg","Café and beverage operations"],
["Food preparation","assets/media/twins-commercial-food-dehydrator-02.jpg","Preparation and production workflow"]
];
document.getElementById('showroom').innerHTML=head()+'<section class="page showroomhero"><div class="wrap"><span class="eyebrow darkey">VISUAL SHOWROOM</span><h1>See the kind of operation you are building.</h1><p class="muted">A visual reference layer for cooking, bakery, preparation, service and hospitality environments.</p></div></section><section class="section"><div class="wrap"><div class="showroomgrid">'+gallery.map(function(g,i){return '<article class="showroomcard"><img src="'+g[1]+'" alt="'+g[0]+'"><div><span class="eyebrow darkey">0'+(i+1)+'</span><h2>'+g[0]+'</h2><p>'+g[2]+'</p><a href="products.html">Explore equipment →</a></div></article>'}).join('')+'</div></div></section><section class="section darksection"><div class="wrap split"><div><span class="eyebrow">NEXT STEP</span><h2>Know the look. Now build the list.</h2><p>Use the planner or package pages to turn the visual idea into a structured equipment request.</p><a class="btn red" href="build-your-business.html">Build my equipment plan →</a></div><div class="quotevisual"><span>VISUALISE</span><strong>→</strong><span>PLAN</span><strong>→</strong><span>ENQUIRE</span></div></div></section>'+foot()+'<div id="toast"></div>'
}
function support(){
var topics=[
["Before purchase","Confirm the exact model, dimensions, capacity, power or fuel, water/drain requirements where relevant, delivery access and installation needs.","Ask about an item →"],
["Delivery & access","Large equipment may require measurements, access checks and destination details before delivery can be arranged.","Review delivery →"],
["Installation questions","If a unit needs installation or special site preparation, raise that requirement before finalizing the purchase.","Talk to Twins →"],
["Maintenance planning","Keep the model information and purchase details for future service conversations. Ask Twins what support is available for the specific equipment.","Contact support →"]
];
document.getElementById('support').innerHTML=head()+'<section class="page supporthero"><div class="wrap"><span class="eyebrow darkey">EQUIPMENT SUPPORT</span><h1>Get the practical details right before the equipment arrives.</h1><p class="muted">Use this page as a checklist for equipment conversations. It does not claim a service or spare-parts inventory that has not been connected to the site.</p></div></section><section class="section"><div class="wrap"><div class="supportgrid">'+topics.map(function(t,i){return '<article class="supportcard"><span class="eyebrow darkey">0'+(i+1)+'</span><h2>'+t[0]+'</h2><p>'+t[1]+'</p><a href="'+(i===1?'delivery.html':i===2||i===3?'contact.html':'quote.html')+'">'+t[2]+'</a></article>'}).join('')+'</div></div></section><section class="section soft"><div class="wrap"><div class="panel enquiry"><div><span class="eyebrow darkey">HAVE A SPECIFIC UNIT IN MIND?</span><h2>Send the model or product name before you commit.</h2><p class="muted">Twins can confirm the information available for the specific equipment and discuss the next step.</p></div><a class="btn red" href="contact.html">Talk to Twins →</a></div></div></section>'+foot()+'<div id="toast"></div>'
}
function faq(){document.getElementById('faq').innerHTML=head()+'<section class="page"><div class="wrap"><h1>Frequently asked questions</h1><p class="muted">A quick guide before you buy or visit.</p></div></section><section class="section"><div class="wrap faq">'+[['Do you sell equipment for complete business setups?','Yes. The catalogue is structured around cooking, bakery, prep, storage, service and other operating areas. For a complete setup, use the Business Planner or request a quotation.'],['Are the prices on this website final?','This storefront uses a quote-first model. Confirm the current price, stock, specifications, delivery and installation requirements with Twins before purchase.'],['Can I order through WhatsApp?','Yes. Product pages and quotation flows can prepare a WhatsApp enquiry using the business phone number.'],['Where is Twins Kitchen?',''+SITE_CONFIG.address+'. The business is listed as '+SITE_CONFIG.hours.toLowerCase()+'.'],['Will online payment work now?','No live payment processing is connected in this static phase. The current experience is designed for discovery, cart building and enquiries.'],['Can the site eventually have real accounts and orders?','Yes. A backend can later provide real authentication, inventory, orders, admin tools, payments and database persistence without rebuilding the storefront from scratch.']].map(x=>'<details><summary>'+x[0]+'</summary><p>'+x[1]+'</p></details>').join('')+'</div></section>'+foot()+'<div id="toast"></div>'}
function delivery(){document.getElementById('delivery').innerHTML=head()+'<section class="page"><div class="wrap"><h1>Delivery & collection</h1><p class="muted">Planning information for equipment purchases.</p></div></section><section class="section"><div class="wrap infoGrid"><div class="panel"><span class="eyebrow darkey">01</span><h2>Confirm the equipment</h2><p class="muted">Product availability, dimensions, specifications and price should be confirmed before an order is finalized.</p></div><div class="panel"><span class="eyebrow darkey">02</span><h2>Discuss delivery</h2><p class="muted">For large equipment, delivery requirements can depend on size, quantity, location and access to the destination.</p></div><div class="panel"><span class="eyebrow darkey">03</span><h2>Collection</h2><p class="muted">If you prefer to visit the market, contact Twins first so the equipment and collection details can be discussed.</p></div><div class="panel"><span class="eyebrow darkey">04</span><h2>Installation</h2><p class="muted">Where installation or setup support is required, ask about the specific equipment before purchase.</p></div></div></section>'+foot()+'<div id="toast"></div>'}
function contact(){var emailBody='Hello Twins Kitchen,\n\nI would like to enquire about commercial equipment.\n\nName:\nBusiness type:\nEquipment / project:\nLocation:\nRequirements:\n\nThank you.';document.getElementById('contact').innerHTML=head()+'<section class="page"><div class="wrap"><h1>Talk to Twins</h1><p class="muted">Equipment enquiries, business setups, bulk requirements and store visits.</p></div></section><section class="section"><div class="wrap contact"><div class="panel"><img src="assets/media/twins-product-photo-pending.svg"><h2>Visit the store</h2><p>'+SITE_CONFIG.address+'</p><a class="btn red" target="_blank" href="'+SITE_CONFIG.mapsUrl+'">Get directions</a></div><div class="panel"><span class="eyebrow darkey">DIRECT CONTACT</span><h2>Tell us what you need.</h2><p class="muted">Choose the channel that works for you. WhatsApp is useful for fast equipment conversations; email is available for structured enquiries.</p><a class="btn red full" target="_blank" href="'+SITE_CONFIG.whatsappUrl+'">Open WhatsApp →</a><a class="btn light full" href="'+emailUrl('Equipment enquiry',emailBody)+'">Email '+SITE_CONFIG.email+' →</a><div class="contactline"><b>Phone</b><a href="tel:'+SITE_CONFIG.phoneDisplay+'">'+SITE_CONFIG.phoneDisplay+'</a></div><div class="contactline"><b>Email</b><a href="mailto:'+SITE_CONFIG.email+'">'+SITE_CONFIG.email+'</a></div><div class="contactline"><b>Location</b><span>'+SITE_CONFIG.address+'</span></div><div class="contactline"><b>Hours</b><span>'+SITE_CONFIG.hours+'</span></div><a class="btn dark full" href="quote.html">Request a quotation →</a></div></div></section>'+foot()+'<div id="toast"></div>'}
function about(){document.getElementById('about').innerHTML=head()+'<section class="page"><div class="wrap"><h1>About Twins Kitchen</h1><p class="muted">Professional equipment at the centre of real business operations.</p></div></section><section class="section"><div class="wrap split aboutsplit"><div><span class="eyebrow darkey">THE STORE</span><h2>Equipment discovery should feel like business planning.</h2><p class="muted">This storefront is designed around the way operators actually buy: identify the operation, understand the workflow, discover equipment, build a list and speak to a real person when the decision becomes specific.</p><p class="muted">Twins Kitchen is based at Alaba International Market, Nigeria, serving kitchen, bakery, catering, restaurant and hospitality equipment needs.</p><a class="btn red" href="build-your-business.html">Build a business plan →</a></div><img class="aboutimage" src="assets/media/twins-product-photo-pending.svg"></div></section>'+'<section class="section soft aboutFounder"><div class="wrap founderGrid"><div class="founderVisual"><div class="founderInitials">AIS</div><span class="eyebrow darkey">FOUNDER & BUSINESS OWNER</span><b>'+OWNER_PROFILE.name+'</b><small>'+OWNER_PROFILE.origin+' · Based in '+OWNER_PROFILE.base+'</small></div><div><span class="eyebrow darkey">WHY TWINS EXISTS</span><h2>From Anambra roots to a Lagos equipment business.</h2><p class="muted">'+OWNER_PROFILE.story+'</p><div class="founderFacts"><span><b>Location</b>Alaba International Market, Lagos</span><span><b>Service area</b>'+OWNER_PROFILE.delivery+'</span><span><b>Focus</b>Commercial kitchen, bakery and hospitality equipment</span></div></div></div></section>'+foot()+'<div id="toast"></div>'}


function services(){
var items=SERVICE_ITEMS;
document.getElementById('services').innerHTML=head()+'<main><section class="page"><div class="wrap"><span class="eyebrow darkey">HOW TWINS CAN HELP</span><h1>From equipment discovery to a practical buying brief.</h1><p class="muted">The website is designed to help you move from “I need equipment” to a clearer conversation about what the business actually requires.</p></div></section><section class="section"><div class="wrap servicegrid">'+items.map(function(x,i){return '<article class="servicecard"><span class="serviceindex">0'+(i+1)+'</span><h2>'+x[0]+'</h2><p class="muted">'+x[1]+'</p><a href="'+(i===1?'build-your-business.html':i===2?'quote.html':i===5?'support.html':'products.html')+'">Continue →</a></article>'}).join('')+'</div></section><section class="section soft"><div class="wrap split"><div><span class="eyebrow darkey">FOR LARGER PROJECTS</span><h2>Give us the information that changes the equipment decision.</h2><p class="muted">Business type, expected output, available space, utilities, destination and the equipment list are useful starting points.</p><a class="btn red" href="project-planner.html">Create a project brief →</a></div><div class="panel"><h3>What to confirm before purchase</h3><div class="workspacebrief"><span>Current price</span><span>Current availability</span><span>Exact dimensions</span><span>Power / gas requirements</span><span>Access and installation</span><span>Delivery destination</span></div></div></div></section></main>'+foot()+'<div id="toast"></div>';
}
function industries(){
var items=INDUSTRY_ITEMS;
document.getElementById('industries').innerHTML=head()+'<main><section class="page"><div class="wrap"><span class="eyebrow darkey">INDUSTRIES</span><h1>Shop around the business you are building.</h1><p class="muted">Different operations need different equipment combinations. Start with the business model, then refine the list.</p></div></section><section class="section"><div class="wrap industrygrid">'+items.map(function(x){return '<article class="industrycard"><div class="industryimage"><img src="'+(function(){var b=B.find(function(y){return y[0]===x[2]});var p=b&&P.find(function(z){return z.c===b[2]});return p&&p.i?p.i:'assets/media/twins-product-photo-pending.svg'})()+'" alt="'+x[0]+' equipment"></div><div><span class="eyebrow darkey">BUSINESS PATH</span><h2>'+x[0]+'</h2><p class="muted">'+x[1]+'</p><a class="btn light" href="build-your-business.html?type='+encodeURIComponent(x[2])+'">Plan this business →</a></div></article>'}).join('')+'</div></section><section class="section soft"><div class="wrap"><div class="panel"><span class="eyebrow darkey">NOT SURE YET?</span><h2>Use the equipment finder.</h2><p class="muted">Choose a business, equipment area and search term to narrow the catalogue.</p><a class="btn red" href="equipment-finder.html">Find equipment →</a></div></div></section></main>'+foot()+'<div id="toast"></div>';
}
function privacy(){document.getElementById('privacy').innerHTML=head()+'<main><section class="page"><div class="wrap"><span class="eyebrow darkey">PRIVACY</span><h1>Privacy information.</h1><p class="muted">A straightforward explanation of the current static storefront.</p></div></section><section class="section"><div class="wrap legal"><h2>What the current site stores</h2><p>The current static storefront stores certain workspace information in your browser, such as cart items, saved products, comparison selections, project briefs, quote drafts and demo account information. This local browser storage is not a production account database.</p><h2>Contact information</h2><p>If you contact Twins by WhatsApp, phone or email, the information you choose to send is handled through that communication channel. Do not send passwords, payment credentials or other sensitive information in a normal equipment enquiry.</p><h2>Production transition</h2><p>When a backend is connected, the production privacy notice should be updated to identify the actual data controller, storage providers, retention periods, account/session handling, support access and user rights applicable to the deployed service.</p><h2>Cookies and tracking</h2><p>The current storefront does not require an advertising or analytics profile to use the catalogue. Any future analytics, advertising or cookie technology should be documented here before it is enabled.</p><h2>Questions</h2><p>For privacy questions about an enquiry, use the contact details on the <a href="contact.html">contact page</a>.</p></div></section></main>'+foot()+'<div id="toast"></div>';}
function terms(){document.getElementById('terms').innerHTML=head()+'<main><section class="page"><div class="wrap"><span class="eyebrow darkey">TERMS</span><h1>Storefront terms and buying notes.</h1><p class="muted">The catalogue is an enquiry and planning interface, not a live inventory system.</p></div></section><section class="section"><div class="wrap legal"><h2>Catalogue information</h2><p>Product descriptions, images and specifications are intended to help you identify equipment. Confirm the exact model, configuration, dimensions, utility requirements and current availability with Twins before committing to a purchase.</p><h2>Pricing</h2><p>The catalogue uses “Current price on request” because equipment pricing and configuration can change. A quotation request is not itself a completed sale.</p><h2>Availability</h2><p>Items shown on the website should not be interpreted as a real-time inventory promise. Availability must be confirmed for the specific model and destination.</p><h2>Quotes and enquiries</h2><p>Preparing a quote request creates a local browser record in the current static version and can prepare a WhatsApp or email message. It does not create a server-side order until a production backend is connected.</p><h2>Product suitability</h2><p>The buyer remains responsible for confirming that the selected equipment fits the intended menu, capacity, space, utilities, access and operating environment. For complex projects, discuss the requirements before purchase.</p></div></section></main>'+foot()+'<div id="toast"></div>';}
function returns(){document.getElementById('returns').innerHTML=head()+'<main><section class="page"><div class="wrap"><span class="eyebrow darkey">ORDER ISSUES</span><h1>Returns, defects and order questions.</h1><p class="muted">The website does not invent a return policy that has not been supplied by the business.</p></div></section><section class="section"><div class="wrap legal"><h2>Before purchasing</h2><p>Ask for the exact model, current price, availability, dimensions, utility requirements, warranty terms and any applicable return conditions for the specific equipment you are considering.</p><h2>If something arrives damaged</h2><p>Keep the packaging and document the condition with photographs where possible. Contact Twins promptly with the quotation or order reference, product details and destination so the issue can be reviewed.</p><h2>If the equipment is not the expected model</h2><p>Do not modify or install the unit before discussing the discrepancy. Send the model information and relevant documents or photographs to Twins for review.</p><h2>Future online returns</h2><p>When real online ordering and payments are introduced, this page should be replaced with the actual approved return, refund, warranty and cancellation policy, including timelines and exclusions.</p><a class="btn red" href="contact.html">Contact Twins about an order →</a></div></section></main>'+foot()+'<div id="toast"></div>';}
function categoryDetail(){
var u=new URLSearchParams(location.search);
var name=u.get('cat')||C[0][0];
if(!C.some(function(x){return x[0]===name;}))name=C[0][0];
var list=P.filter(function(p){return p.c===name;});
var descriptions={
"Cooking Equipment":"Build the hot line around the menu, throughput, fuel or power availability and the space available for cooking.",
"Bakery Equipment":"Plan bakery production around mixing, baking, proofing, cooling, display and storage.",
"Kitchen Equipment":"Create practical prep and workstation areas with durable surfaces, sinks and supporting infrastructure.",
"Cold Storage":"Protect ingredients and finished products with refrigeration and freezer capacity matched to the operation.",
"Restaurant & Hotel":"Equip the service environment with furniture and hospitality equipment that fits the concept and guest flow.",
"Bar & Beverage":"Build beverage service around preparation, chilling, blending, coffee and front-counter workflow.",
"Food Preparation":"Speed up repetitive preparation with equipment selected around volume, menu and staff workflow.",
"Storage":"Keep ingredients, tools and equipment organised with storage that fits the available footprint and movement paths.",
"Serving Equipment":"Support holding, presentation and service with equipment that matches the pace of the operation.",
"Catering Supplies":"Prepare for mobile service with transport, holding and service equipment that can move with the business.",
"Ventilation":"Plan extraction and ventilation around the cooking line, equipment layout and the requirements of the exact installation."
};
var desc=descriptions[name]||"Explore equipment in this operating area and confirm the exact specification before purchase.";
var links=C.map(function(x){
var active=x[0]===name?'active':'';
var count=P.filter(function(p){return p.c===x[0];}).length;
return '<a class="'+active+'" href="category.html?cat='+encodeURIComponent(x[0])+'">'+x[0]+' <span>'+count+'</span></a>';
}).join('');
var products=list.length?cards(list):'<div class="empty"><h2>No demo items in this area yet.</h2><a class="btn light" href="products.html">Browse all equipment</a></div>';
document.getElementById('category').innerHTML=head()+
'<section class="page categoryhero"><div class="wrap"><div class="crumb">Store / Categories / '+name+'</div><span class="eyebrow darkey">EQUIPMENT AREA</span><h1>'+name+'</h1><p class="muted">'+desc+'</p><div class="categorystats"><span><b>'+list.length+'</b> catalogue items</span><span><b>Commercial</b> use focus</span><span><b>Quote</b> available</span></div></div></section>'+
'<section class="section"><div class="wrap"><div class="categorylayout"><aside class="panel categoryaside"><span class="eyebrow darkey">SHOP THE CATALOGUE</span><h3>Equipment areas</h3>'+links+'</aside><div><div class="categoryintro"><div><span class="eyebrow darkey">BUYING FOCUS</span><h2>Choose by operation, then verify the exact unit.</h2><p class="muted">'+desc+' Use the catalogue as a starting point and confirm current price, stock, dimensions, utilities and installation requirements with Twins.</p></div><a class="btn red" href="quote.html">Request a quote →</a></div><div class="grid">'+products+'</div></div></div></div></section>'+
'<section class="section soft"><div class="wrap"><div class="categorymediahead"><div><span class="eyebrow darkey">TWINS MEDIA · '+name.toUpperCase()+'</span><h2>See equipment from this area.</h2><p class="muted">Supplied Twins photos and videos linked to this equipment area.</p></div><a class="textlink" href="media.html">View all media →</a></div><div class="categorymediagrid">'+(typeof MEDIA_LIBRARY!=='undefined'?MEDIA_LIBRARY.filter(function(m){return m.category===name&&m.src;}).slice(0,6).map(function(m){return '<a class="categorymediacard" href="media.html"><div>'+(m.type==='video'?'<video muted autoplay loop playsinline poster="'+(m.poster||'')+'"><source src="'+m.src+'" type="video/mp4"></video>':'<img src="'+m.src+'" alt="'+m.alt+'">')+'</div><b>'+m.title+'</b><small>'+(m.type==='video'?'Video':'Photo')+'</small></a>';}).join(''):'')+'</div></div></section>'+
'<section class="section soft"><div class="wrap"><div class="panel enquiry"><div><span class="eyebrow darkey">NOT SURE WHAT FITS?</span><h2>Build a plan around your business.</h2><p class="muted">Connect this equipment area to a restaurant, bakery, hotel, catering, bar or café workflow.</p></div><a class="btn dark" href="build-your-business.html">Open business planner →</a></div></div></section></main>'+foot()+'<div id="toast"></div>';
}
function projectPlanner(){
var savedPlan=get('twins_project_plan',null);
var businessOptions=B.map(function(b){return '<option '+(savedPlan&&savedPlan.business===b[0]?'selected':'')+'>'+b[0]+'</option>'}).join('');
var stageOptions=PROJECT_STAGES.map(function(x){return '<option '+(savedPlan&&savedPlan.stage===x?'selected':'')+'>'+x+'</option>'}).join('');
document.getElementById('planner').innerHTML=head()+
'<section class="page plannerhero"><div class="wrap"><span class="eyebrow darkey">PROJECT PLANNER</span><h1>Turn a business idea into an equipment brief.</h1><p class="muted">Capture the information that matters before requesting equipment pricing. Save the brief in this browser and continue into the quotation workflow.</p></div></section>'+
'<section class="section"><div class="wrap"><div class="plannerlayout"><form class="panel plannerform" onsubmit="saveProjectPlan(event)">'+
'<div class="field"><label>Business type</label><select id="ppBusiness" required><option value="">Choose a business</option>'+businessOptions+'</select></div>'+
'<div class="field"><label>Project stage</label><select id="ppStage">'+stageOptions+'</select></div>'+
'<div class="field"><label>Location / delivery area</label><input id="ppLocation" value="'+(savedPlan?savedPlan.location:'')+'" placeholder="City, state or delivery area"></div>'+
'<div class="field"><label>Expected capacity / output</label><input id="ppCapacity" value="'+(savedPlan?savedPlan.capacity:'')+'" placeholder="e.g. 100 meals/day, 20 trays/day, 40 seats"></div>'+
'<div class="field"><label>Available space</label><input id="ppSpace" value="'+(savedPlan?savedPlan.space:'')+'" placeholder="Approximate room size or layout notes"></div>'+
'<div class="field"><label>Power / fuel situation</label><input id="ppUtilities" value="'+(savedPlan?savedPlan.utilities:'')+'" placeholder="Electricity, gas, generator, water, drainage"></div>'+
'<div class="field"><label>Equipment already owned</label><textarea id="ppOwned" placeholder="List anything you already have">'+(savedPlan?savedPlan.owned:'')+'</textarea></div>'+
'<div class="field"><label>What do you need?</label><textarea id="ppNeeds" placeholder="Describe the equipment, workflow or menu requirements">'+(savedPlan?savedPlan.needs:'')+'</textarea></div>'+
'<button class="btn red full">Save project brief →</button></form>'+
'<aside class="panel planneraside"><span class="eyebrow darkey">PROJECT CONTEXT</span><h2>A better equipment conversation starts with context.</h2><div class="plannerpoints"><span><b>01</b> Business model</span><span><b>02</b> Production or guest capacity</span><span><b>03</b> Space and movement</span><span><b>04</b> Power, gas, water and drainage</span><span><b>05</b> Existing equipment</span><span><b>06</b> Equipment requirements</span></div><div class="plannerstatus">'+(savedPlan?'<b>Project brief saved</b><span>'+savedPlan.business+' · '+savedPlan.stage+'</span><a href="quote.html">Continue to quotation →</a>':'<b>No project brief yet</b><span>Complete the form to create one.</span>')+'</div></aside></div></div></section>'+
'<section class="section soft"><div class="wrap"><div class="panel enquiry"><div><span class="eyebrow darkey">NEXT STEP</span><h2>Combine the brief with your equipment list.</h2><p class="muted">Browse equipment, add quantities to your cart, then send the project context with your quotation request.</p></div><a class="btn red" href="products.html">Browse equipment →</a></div></div></section>'+foot()+'<div id="toast"></div>';
}
function saveProjectPlan(e){
e.preventDefault();
var plan={business:document.getElementById('ppBusiness').value,stage:document.getElementById('ppStage').value,location:document.getElementById('ppLocation').value,capacity:document.getElementById('ppCapacity').value,space:document.getElementById('ppSpace').value,utilities:document.getElementById('ppUtilities').value,owned:document.getElementById('ppOwned').value,needs:document.getElementById('ppNeeds').value,savedAt:new Date().toISOString()};
if(!plan.business){toast('Choose a business type');return}
put('twins_project_plan',plan);
toast('Project brief saved');
setTimeout(function(){location.reload()},350);
}
function media(){
var images=typeof MEDIA_LIBRARY!=='undefined'?MEDIA_LIBRARY:[];
var cats=["All media"].concat(C.map(function(x){return x[0];}));
var types=["All formats","Photos","Videos"];
function mediaCards(list){return list.map(function(m){return '<article class="mediacard" data-media-category="'+m.category+'" data-media-type="'+m.type+'">'+(m.type==='video'?'<video controls preload="metadata" playsinline poster="'+(m.poster||'')+'"><source src="'+m.src+'" type="video/mp4">Your browser does not support video playback.</video>':'<img src="'+m.src+'" alt="'+m.alt+'" onerror="this.src=\'assets/media/twins-deck-oven-stack.jpg\'">')+'<div><span class="eyebrow darkey">'+m.category+(m.type==='video'?' · VIDEO':' · PHOTO')+'</span><h2>'+m.title+'</h2><a href="products.html?cat='+encodeURIComponent(m.category)+'">Explore this equipment area →</a></div></article>';}).join('');}
document.getElementById('media').innerHTML=head()+
'<section class="page mediahero"><div class="wrap"><span class="eyebrow darkey">TWINS MEDIA</span><h1>The business behind the equipment.</h1><p class="muted">A visual library for commercial kitchens, bakeries, hospitality, preparation and beverage operations.</p></div></section>'+
'<section class="section"><div class="wrap"><div class="mediafilters"><input id="mediaSearch" placeholder="Search photos, equipment or media"><select id="mediaCategory">'+cats.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select><select id="mediaType">'+types.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select><span id="mediaCount" class="mediaresultcount"></span></div><div class="mediagrid" id="mediaGrid">'+mediaCards(images)+'</div></div></section>'+
'<section class="section soft"><div class="wrap"><div class="mediaupload"><div><span class="eyebrow darkey">REAL TWINS MEDIA</span><h2>Your actual photos and videos belong here.</h2><p class="muted">Real Twins photos and videos are now part of the media library. More product, shop, delivery and installation media can be added to the same data structure as it becomes available.</p></div><div class="mediaformats"><span>PHOTO GALLERY</span><span>PRODUCT VIDEOS</span><span>SHOP TOUR</span><span>INSTALLATION</span><span>DELIVERY</span></div></div></div></section>'+foot()+'<div id="toast"></div>';
function applyMediaFilters(){
var q=(document.getElementById('mediaSearch').value||'').toLowerCase().trim();
var cat=document.getElementById('mediaCategory').value;
var type=document.getElementById('mediaType').value;
var filtered=images.filter(function(m){
var text=(m.title+' '+m.category+' '+(m.alt||'')).toLowerCase();
var catOK=cat==='All media'||m.category===cat;
var typeOK=type==='All formats'||(type==='Videos'?m.type==='video':m.type==='image');
return catOK&&typeOK&&(!q||text.indexOf(q)>-1);
});
document.getElementById('mediaGrid').innerHTML=filtered.length?mediaCards(filtered):'<div class="empty"><h2>No media matches.</h2><p class="muted">Try another search, category or format.</p></div>';
document.getElementById('mediaCount').textContent=filtered.length+' of '+images.length+' media items';
}
document.getElementById('mediaSearch').addEventListener('input',applyMediaFilters);
document.getElementById('mediaCategory').addEventListener('change',applyMediaFilters);
document.getElementById('mediaType').addEventListener('change',applyMediaFilters);
applyMediaFilters();
}
async function adminPage(){
var user=get('twins_user',null);
var isAdmin=!!(user&&user.remote&&(user.role==='admin'||user.role==='staff'));
document.getElementById('admin').innerHTML=head()+'<main class="page adminpage"><div class="wrap">'+(isAdmin?'<div class="adminhero"><div><span class="eyebrow darkey">TWINS OPERATIONS</span><h1>Store administration.</h1><p class="muted">Authorised staff can review quotation requests stored by the production backend.</p></div><div class="adminbadge">SERVER ADMIN</div></div><div id="adminOps"><div class="empty"><h2>Loading enquiries…</h2><p class="muted">Reading authorised server data.</p></div></div>':'<div class="empty adminlocked"><h1>Admin workspace</h1><p class="muted">This area requires an authenticated staff or admin account in the production application.</p><a class="btn red" href="login.html">Sign in</a></div>')+'</div></main>'+foot()+'<div id="toast"></div>';
if(isAdmin){
try{
var data=await apiRequest('/api/admin/quotes',{method:'GET'}),qs=data.quotes||[];
document.getElementById('adminOps').innerHTML='<div class="adminkpis"><div><b>'+P.length+'</b><span>Catalogue products</span></div><div><b>'+C.length+'</b><span>Equipment areas</span></div><div><b>'+qs.length+'</b><span>Server quote requests</span></div><div><b>'+qs.reduce(function(a,q){return a+(q.itemCount||0)},0)+'</b><span>Requested units</span></div></div><section class="adminsection"><div class="head"><div><h2>Quotation requests</h2><p class="muted">Server-persisted enquiries, newest first.</p></div><a class="btn light" href="products.html">Open storefront</a></div><div class="adminquotes">'+(qs.length?qs.map(function(q){return '<article><div><b>'+q.reference+'</b><small>'+new Date(q.createdAt).toLocaleString('en-NG')+'</small></div><div><b>'+(q.business||'Equipment enquiry')+'</b><small>'+q.name+' · '+q.phone+(q.location?' · '+q.location:'')+'</small></div><small>'+q.status+' · '+q.itemCount+' item(s)</small></article>'}).join(''):'<div class="empty"><h3>No server enquiries yet.</h3><p class="muted">Quote requests will appear here after customers submit them.</p></div>')+'</div></section><section class="adminsection"><div class="workspacebrief"><b>Production controls still to add</b><span>Catalogue mutations</span><span>Inventory</span><span>Orders</span><span>Payments</span><span>Delivery records</span><span>Audit log UI</span></div></section>';
}catch(e){document.getElementById('adminOps').innerHTML='<div class="empty"><h2>Could not load server enquiries.</h2><p class="muted">'+(e.message||'Check the API connection and staff role.')+'</p></div>'}
}
}
function finder(){
var choices=["Any business","Restaurant","Bakery","Hotel","Catering Business","Bar / Lounge","Café"];
var businessOptions=choices.map(function(x){return '<option>'+x+'</option>';}).join('');
var categoryOptions=C.map(function(x){return '<option>'+x[0]+'</option>';}).join('');
document.getElementById('finder').innerHTML=head()+
'<section class="page finderhero"><div class="wrap"><span class="eyebrow darkey">EQUIPMENT FINDER</span><h1>Start with the job your equipment needs to do.</h1><p class="muted">Choose a business and a working area. The finder returns catalogue matches you can save, compare or add to an equipment list.</p></div></section>'+
'<section class="section"><div class="wrap"><div class="finderbox"><div class="field"><label>Business type</label><select id="findBusiness">'+businessOptions+'</select></div><div class="field"><label>Equipment area</label><select id="findCat"><option>Any category</option>'+categoryOptions+'</select></div><div class="field"><label>Search term</label><input id="findText" placeholder="e.g. oven, mixer, refrigerator"></div><button class="btn red" onclick="runFinder()">Find equipment →</button></div><div id="finderResults" class="finderresults"><div class="empty"><h2>Choose what you are building.</h2><p class="muted">Your matches will appear here.</p></div></div></div></section>'+foot()+'<div id="toast"></div>';
}
function runFinder(){
var business=document.getElementById('findBusiness').value;
var category=document.getElementById('findCat').value;
var textValue=(document.getElementById('findText').value||'').toLowerCase();
var wanted=[];
if(business!=='Any business'){
var match=B.find(function(x){return x[0]===business;});
wanted=match?match.slice(2):[];
}
var list=P.filter(function(p){
var categoryOK=category==='Any category'||p.c===category;
var textOK=!textValue||(p.n+' '+p.c+' '+p.desc+' '+p.spec).toLowerCase().indexOf(textValue)>-1;
var businessOK=!wanted.length||wanted.indexOf(p.c)>-1;
return categoryOK&&textOK&&businessOK;
});
var result=list.length?cards(list):'<div class="empty"><h2>No exact matches.</h2><p class="muted">Try another category or remove the search term.</p></div>';
document.getElementById('finderResults').innerHTML='<div class="head"><div><h2>'+list.length+' matches</h2><p class="muted">'+(business==='Any business'?'General catalogue matches':business+' equipment matches')+'</p></div></div><div class="grid">'+result+'</div>';
}

applySeo();
if(page==='index.html'||page==='')home();else if(page==='products.html')products();else if(page==='category.html')categoryDetail();else if(page==='equipment-finder.html')finder();else if(page==='project-planner.html')projectPlanner();else if(page==='media.html')media();else if(page==='product.html')product();else if(page==='categories.html')categories();else if(page==='bundles.html')bundles();else if(page==='guides.html')guides();else if(page==='resources.html')resources();else if(page==='showroom.html')showroom();else if(page==='support.html')support();else if(page==='build-your-business.html')builder();else if(page==='wishlist.html')wishlist();else if(page==='compare.html')comparePage();else if(page==='cart.html')cartPage();else if(page==='quote.html')quote();else if(page==='dashboard.html')dashboard();else if(page==='login.html')auth(false);else if(page==='signup.html')auth(true);else if(page==='faq.html')faq();else if(page==='delivery.html')delivery();else if(page==='contact.html')contact();else if(page==='about.html')about();else if(page==='services.html')services();else if(page==='industries.html')industries();else if(page==='privacy.html')privacy();else if(page==='terms.html')terms();else if(page==='returns.html')returns();else if(page==='admin.html')adminPage();
document.addEventListener('DOMContentLoaded',function(){renderBadges();if(page==='dashboard.html')setTimeout(syncRemoteQuotes,50)});