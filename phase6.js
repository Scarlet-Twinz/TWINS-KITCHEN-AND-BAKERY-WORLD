/* Twins Kitchen — Phase 6
   Commerce experience + discovery + catalogue scale.
   Additive layer: keeps the existing storefront architecture and local-first flows.
*/
(function(){
"use strict";

var BUSINESS_MAP={
 "Restaurant":["Cooking Equipment","Kitchen Equipment","Cold Storage","Food Preparation","Serving Equipment","Storage"],
 "Bakery":["Bakery Equipment","Cooking Equipment","Food Preparation","Storage","Serving Equipment"],
 "Café":["Bar & Beverage","Cold Storage","Serving Equipment","Food Preparation","Kitchen Equipment"],
 "Fast Food":["Cooking Equipment","Food Preparation","Cold Storage","Serving Equipment","Storage"],
 "Hotel":["Restaurant & Hotel","Cooking Equipment","Kitchen Equipment","Cold Storage","Serving Equipment","Storage"],
 "Catering":["Catering Supplies","Cooking Equipment","Serving Equipment","Cold Storage","Storage"],
 "Bar & Lounge":["Bar & Beverage","Cold Storage","Serving Equipment","Restaurant & Hotel"],
 "Supermarket":["Cold Storage","Serving Equipment","Storage","Food Preparation"],
 "Event Centre":["Catering Supplies","Serving Equipment","Restaurant & Hotel","Cold Storage"],
 "TV & Satellite":["Satellite & TV","Home & General Appliances"],
 "Games & Entertainment":["Games & Recreation","Entertainment & Leisure","Home & General Appliances"]
};

var BUSINESS_LABELS=Object.keys(BUSINESS_MAP);

/* Web-researched visual references. These remain reference imagery, never a claim of Twins stock.
   Unsplash references are used alongside the existing Phase 5 media library. */
var WEB_REFERENCE_MEDIA=[
 "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1400&q=88",
 "https://images.unsplash.com/photo-1601944177325-f8867652837f?auto=format&fit=crop&w=1400&q=88",
 "https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1400&q=88",
 "https://cdn11.bigcommerce.com/s-6h7ychjk4/images/stencil/original/image-manager/unic-classic-2-styled-photos-compressed-1.jpg?t=1698674989",
 "https://kitchenequipment.alrazanaonline.com/assets/img/generated/bakery.webp",
 "https://www.arcus.com.au/wp-content/uploads/2021/09/20210311_041726246_iOS-scaled.jpg",
 "https://trufflenation.com/blog/pastry-chef-portfolio/images/img-2.jpg",
 "https://cdn.shopify.com/s/files/1/0802/3493/8688/files/Eta_Inox_Utensilios_de_cozinha_Luanda.jpg?v=1762093998",
 "https://images.squarespace-cdn.com/content/v1/54ac7387e4b04f1bf4ddeda7/1673292569550-C2BY1Q7Y2TRULU3SYS8U/St.Alice_Kitchen6%2Bsmall.jpg",
 "https://images.yybcdn.com/sites/98500/98781/1776320979903289415784509440.png"
];

var EXTRA_TEMPLATES={
 "Cooking Equipment":[
  "Commercial Single Burner Gas Cooker","Commercial Double Burner Gas Cooker","Commercial Three Burner Range","Commercial Four Burner Range","Commercial Six Burner Range","Commercial Eight Burner Range","Heavy-Duty Gas Griddle","Electric Griddle","Commercial Shawarma Grill","Vertical Broiler","Charcoal Grill","Gas BBQ Grill","Electric Salamander","Commercial Pizza Oven","Deck Pizza Oven","Rotary Bakery Oven","Combi Oven","Convection Oven","Commercial Microwave","Induction Cooker","Commercial Rice Cooker","Steam Kettle","Tilting Braising Pan","Commercial Pasta Cooker","Pressure Fryer","Twin Basket Fryer","Countertop Fryer","Electric Hot Plate","Soup Kettle","Commercial Crepe Maker","Waffle Maker","Sandwich Grill","Panini Press","Commercial Toaster","Hot Dog Roller","Sausage Grill","Food Warmer","Bain Marie","Holding Cabinet","Commercial Range With Oven"
 ],
 "Bakery Equipment":[
  "Spiral Dough Mixer","Planetary Mixer","Dough Sheeter","Dough Divider","Dough Rounder","Bread Slicer","Bread Moulder","Dough Proofer","Proofing Cabinet","Deck Oven","Rotary Rack Oven","Convection Bakery Oven","Cake Decorating Machine","Cake Display Chiller","Pastry Display Counter","Bakery Work Table","Flour Sifter","Dough Divider Rounder","Baking Tray Rack","Bread Cooling Rack","Chocolate Tempering Machine","Dough Retarder","Bun Divider","Croissant Moulder","Pie Maker","Donut Fryer","Donut Depositor","Baking Tray","Bakery Cooling Trolley","Ingredient Bin","Cake Mixer","Bakery Refrigerator","Bakery Freezer","Bread Bag Sealer","Heat Sealing Machine","Packaging Table","Cake Showcase","Bakery Proofing Rack","Bakery Oven Hood","Pastry Rolling Machine"
 ],
 "Kitchen Equipment":[
  "Stainless Steel Work Table","Three Compartment Sink","Hand Wash Sink","Pot Wash Sink","Wall Mounted Sink","Stainless Prep Bench","Kitchen Wall Shelf","Stainless Wall Cabinet","Mobile Kitchen Trolley","Service Trolley","Dish Collection Trolley","Commercial Dishwasher","Glasswasher","Pre-Rinse Spray Unit","Waste Bin Station","Kitchen Tap","Foot Operated Hand Wash Station","Stainless Splashback","Corner Work Table","Underbench Cabinet","Stainless Drawer Unit","Kitchen Utensil Rack","Knife Sterilizer","UV Knife Cabinet","Food Waste Bin","Kitchen Pedal Bin","Ingredient Prep Table","Mobile Hot Cupboard","Pass Counter","Kitchen Pass Shelf","Plate Warmer","Heat Lamp Station","Pot Rack","Ceiling Pot Rack","Stainless Leg Sink","Double Bowl Sink","Single Bowl Sink","Drain Table","Dish Landing Table","Commercial Wash Station"
 ],
 "Cold Storage":[
  "Commercial Upright Refrigerator","Two Door Refrigerator","Three Door Refrigerator","Four Door Refrigerator","Under Counter Refrigerator","Counter Chiller","Glass Door Chiller","Display Chiller Cabinet","Cake Display Chiller","Beverage Display Cooler","Commercial Chest Freezer","Deep Freezer","Island Freezer","Upright Freezer","Blast Chiller","Blast Freezer","Ice Maker","Ice Flake Machine","Ice Cube Machine","Cold Room Panel","Cold Room Door","Walk-In Chiller","Walk-In Freezer","Saladette Refrigerator","Pizza Prep Chiller","Under Counter Freezer","Bottle Cooler","Back Bar Cooler","Milk Cooler","Dairy Display Chiller","Meat Display Chiller","Fish Display Freezer","Frozen Food Showcase","Refrigerated Prep Counter","Cold Bain Marie","Mobile Freezer","Display Freezer","Refrigeration Condenser Unit","Cold Room Shelving","Refrigeration Storage Rack"
 ],
 "Restaurant & Hotel":[
  "Restaurant Dining Table","Restaurant Dining Chair","Banquet Table","Banquet Chair","Hotel Service Trolley","Room Service Trolley","Luggage Trolley","Buffet Table","Buffet Counter","Reception Counter","Host Stand","Restaurant Booth Seat","Bar Stool","Outdoor Restaurant Chair","Outdoor Dining Table","Hotel Breakfast Counter","Hotel Buffet Warmer","Hotel Food Display","Hotel Kitchen Trolley","Banquet Service Station","Plate Rack","Cutlery Station","Tray Stand","Restaurant High Chair","Hotel Housekeeping Trolley","Laundry Trolley","Hotel Mini Refrigerator","Guest Room Beverage Station","Restaurant Cash Counter","POS Counter","Dining Sideboard","Hospitality Serving Cart","Room Service Cart","Banquet Chafing Station","Hotel Dish Drop","Restaurant Host Desk","Service Station Cabinet","Restaurant Storage Cabinet","Hotel Back Bar","Hospitality Work Table"
 ],
 "Bar & Beverage":[
  "Commercial Espresso Machine","Two Group Espresso Machine","Three Group Espresso Machine","Coffee Grinder","Espresso Grinder","Automatic Coffee Machine","Coffee Brewer","Filter Coffee Machine","Cold Brew Dispenser","Juice Extractor","Juice Dispenser","Juice Presser","Commercial Blender","Bar Blender","Ice Crusher","Ice Maker","Bottle Cooler","Back Bar Refrigerator","Under Counter Bar Cooler","Display Beverage Cooler","Beer Dispenser","Draft Beer Tower","Cocktail Station","Bar Sink","Bar Workstation","Bottle Display Rack","Glass Rack","Glasswasher","Bar Ice Bin","Wine Cooler","Wine Display Cabinet","Milkshake Machine","Soft Serve Machine","Slush Machine","Granita Machine","Soda Dispenser","Water Dispenser","Commercial Kettle","Tea Brewer","Beverage Holding Station"
 ],
 "Food Preparation":[
  "Commercial Food Processor","Vegetable Cutter","Vegetable Slicer","Meat Slicer","Meat Mincer","Meat Grinder","Bone Saw","Chicken Cutter","Potato Peeler","Potato Cutter","Vegetable Washer","Vegetable Dicer","Onion Chopper","Garlic Peeler","Food Mixer","Stick Blender","Immersion Blender","Planetary Food Mixer","Vacuum Packing Machine","Chamber Vacuum Sealer","Tray Sealer","Meat Tenderizer","Sausage Filler","Burger Press","Fish Scaler","Food Weighing Scale","Portion Scale","Digital Kitchen Scale","Commercial Mandoline","Food Cutter","Cheese Slicer","Bread Slicer","Egg Slicer","Manual Food Chopper","Commercial Juicer","Citrus Juicer","Spice Grinder","Nut Grinder","Food Mill","Preparation Trolley"
 ],
 "Storage":[
  "Heavy Duty Storage Rack","Stainless Storage Rack","Mobile Storage Rack","Wall Storage Shelf","Stainless Wall Shelf","Ingredient Storage Bin","Flour Storage Bin","Rice Storage Bin","Food Storage Container","Ingredient Trolley","Mobile Shelving","Chrome Wire Rack","Plastic Storage Rack","Heavy Duty Work Rack","Bakery Rack","Tray Rack","Pan Rack","Plate Rack","Pot Rack","Lid Rack","Bottle Rack","Dry Store Cabinet","Stainless Storage Cabinet","Lockable Storage Cabinet","Under Counter Cabinet","Mobile Drawer Cabinet","Ingredient Cart","Utility Cart","Warehouse Rack","Grocery Storage Rack","Cold Room Rack","Freezer Rack","Kitchen Basket Rack","Dish Storage Rack","Cutlery Storage Cabinet","Packaging Storage Rack","Cleaning Supply Rack","Broom Storage Rack","Bulk Storage Trolley","Store Room Shelving"
 ],
 "Serving Equipment":[
  "Stainless Chafing Dish","Electric Chafing Dish","Induction Chafing Dish","Food Display Warmer","Glass Food Warmer","Hot Display Cabinet","Cold Display Cabinet","Food Display Counter","Serving Counter","Buffet Display","Buffet Warmer","Plate Warmer","Cup Warmer","Tray Trolley","Serving Trolley","Catering Trolley","Food Transport Box","Insulated Food Carrier","Thermal Food Box","Serving Tray","Tray Stand","Plate Dispenser","Cutlery Dispenser","Napkin Dispenser","Condiment Station","Self Service Counter","Food Pickup Counter","Cake Display Stand","Pastry Display Stand","Bakery Display Cabinet","Dessert Display Counter","Hot Holding Cabinet","Food Holding Cabinet","Mobile Buffet Station","Stainless Service Cart","Banquet Service Trolley","Hotel Service Cart","Restaurant Pass Counter","Serving Shelf","Service Station"
 ],
 "Catering Supplies":[
  "Catering Gas Burner","Catering Cooking Range","Portable Gas Stove","Catering Oven","Catering Fryer","Catering Griddle","Catering Hot Box","Catering Food Warmer","Catering Chafing Dish","Catering Serving Trolley","Catering Table","Catering Folding Table","Catering Chair","Banquet Table","Event Buffet Table","Event Food Display","Catering Cooler Box","Insulated Catering Carrier","Catering Beverage Dispenser","Juice Dispenser","Tea Urn","Coffee Urn","Water Boiler","Soup Kettle","Rice Warmer","Food Pan","GN Pan","Catering Tray","Catering Cutlery Set","Catering Plate Rack","Catering Pot","Catering Stock Pot","Mobile Catering Sink","Event Hand Wash Station","Catering Waste Bin","Event Service Counter","Portable Bar Counter","Event Bar Trolley","Catering Storage Rack","Event Equipment Trolley"
 ],
 "Satellite & TV":[
  "GOtv Decoder","GOtv Subscription Package","DStv HD Decoder","DStv Subscription Package","DStv Explora Decoder","HD Satellite Decoder","Digital Satellite Receiver","Free-to-Air Decoder","Satellite Dish 60cm","Satellite Dish 90cm","Satellite Dish 1.2m","Satellite Dish 1.8m","Ku Band LNB","Universal LNB","Twin LNB","Quad LNB","Octo LNB","Satellite Signal Meter","Satellite Finder Meter","Coaxial Cable Roll","RG6 Coaxial Cable","Satellite Wall Mount","Satellite Pole","TV Wall Mount","Tilting TV Mount","Full Motion TV Mount","32 Inch LED TV","43 Inch LED TV","50 Inch Smart TV","55 Inch Smart TV","65 Inch Smart TV","75 Inch Smart TV","85 Inch Smart TV","Commercial Display TV","Digital Signage Screen","TV Stand","TV Console","HDMI Cable","HDMI Splitter","HDMI Switch"
 ],
 "Entertainment & Leisure":[
  "Commercial Sound System","PA Speaker","Powered Speaker","Passive Speaker","Subwoofer","Amplifier","Mixer Console","Wireless Microphone","Wired Microphone","DJ Controller","DJ Mixer","Party Speaker","Karaoke Machine","Karaoke Speaker","Karaoke Amplifier","Projector","Projector Screen","LED Display Panel","Digital Signage Player","Event Lighting Kit","Stage Light","Moving Head Light","Disco Light","Laser Light","Smoke Machine","Fog Machine","Haze Machine","LED Par Light","Speaker Stand","Microphone Stand","Speaker Cable","Audio Cable","Power Amplifier Rack","AV Rack","Media Player","Bluetooth Receiver","Audio Interface","Recording Microphone","Conference Speaker","Portable PA System"
 ],
 "Games & Recreation":[
  "Full Size Snooker Table","Tournament Snooker Table","Pool Table","English Pool Table","American Pool Table","Coin Operated Pool Table","Table Tennis Table","Competition Table Tennis Table","Table Tennis Net Set","Table Tennis Paddle Set","Air Hockey Table","Foosball Table","Football Table","Arcade Cabinet","Multigame Arcade Cabinet","Racing Arcade Machine","Basketball Arcade Game","Claw Machine","Dart Board","Electronic Dart Board","Dart Cabinet","Gaming Console Station","Gaming TV Stand","Gaming Chair","Game Room Sofa","Billiard Cue Rack","Billiard Light","Pool Ball Set","Snooker Ball Set","Pool Cue Set","Snooker Cue Set","Scoreboard","Digital Scoreboard","Game Room Table","Game Room Chair","Gaming Monitor","Gaming Desk","VR Gaming Station","Karaoke Game Station","Entertainment Counter"
 ],
 "Home & General Appliances":[
  "Electric Cooker","Gas Cooker","Gas Cooker With Oven","Electric Oven","Microwave Oven","Air Fryer","Domestic Blender","Food Processor","Electric Kettle","Water Dispenser","Water Purifier","Washing Machine","Chest Freezer","Upright Freezer","Refrigerator","Double Door Refrigerator","Mini Refrigerator","Air Conditioner","Standing Fan","Wall Fan","Ceiling Fan","Industrial Fan","Vacuum Cleaner","Steam Iron","Ironing Board","Generator","Voltage Stabilizer","UPS Unit","Extension Reel","Power Strip","Electric Hot Plate","Rice Cooker","Slow Cooker","Pressure Cooker","Toaster","Sandwich Maker","Coffee Maker","Juicer","Electric Grill","Food Warmer"
 ]
};

var VARIANTS=["Economy","Standard","Premium","Heavy-Duty","Compact","Large Capacity","Stainless","Digital","Electric","Gas","Mobile","Countertop","Floor Standing","Two Door","Three Door","Four Tray","Six Tray","Eight Tray","10 Tray","12 Tray","15 Tray","20L","30L","50L","80L","100L","120L","Commercial","Industrial","Professional","Hospitality","Bakery Pro","Restaurant Pro","Catering Pro","High Output","Energy Efficient","Display","Undercounter","Wall Mount","Double Basket"];

function esc6(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function mediaFor6(p,index){
 if(typeof phase5Media==="function")return phase5Media(p);
 var src=WEB_REFERENCE_MEDIA[index%WEB_REFERENCE_MEDIA.length];
 return {src:src,status:"reference",source:"Web research reference image"};
}

/* Scale the catalogue from the existing 500-item dataset to 1,000 structured references.
   Every generated entry is clearly marked as a catalogue/reference item and does not claim stock. */
function expandCatalogue(){
 if(window.__twinsPhase6Expanded)return;
 window.__twinsPhase6Expanded=true;
 var existingIds={};P.forEach(function(p){existingIds[p.id]=true});
 var next=501, created=0;
 Object.keys(EXTRA_TEMPLATES).forEach(function(cat,catIndex){
   EXTRA_TEMPLATES[cat].forEach(function(base,j){
     if(created>=500)return;
     var variant=VARIANTS[(j+catIndex)%VARIANTS.length];
     var name=variant+" "+base;
     if(P.some(function(p){return p.n===name}))name=name+" "+(catIndex+1);
     var id=next++;
     var mediaIndex=(id+catIndex)%WEB_REFERENCE_MEDIA.length;
     var businesses=BUSINESS_LABELS.filter(function(b){return BUSINESS_MAP[b].indexOf(cat)>-1}).slice(0,5);
     P.push({
       id:id,n:name,c:cat,p:null,i:WEB_REFERENCE_MEDIA[mediaIndex],
       tag:["Popular","Essential","Commercial","Professional","New Reference"][id%5],
       desc:"Catalogue reference for "+cat.toLowerCase()+" workflows, suitable for planning and quotation discussions.",
       spec:"Reference item · confirm exact make, model, dimensions, utilities, current price, stock and delivery with Twins.",
       businesses:businesses,use:businesses.slice(0,3).join(", "),
       condition:"New reference",
       availability:"Stock to confirm",
       source:"Web research reference image",
       media:{images:[WEB_REFERENCE_MEDIA[mediaIndex]],video:"",source:"Web research reference image"}
     });
     created++;
   });
 });
 /* If template count is below 500, fill the remainder with useful variants. */
 var fallback=EXTRA_TEMPLATES["Kitchen Equipment"];
 var k=0;
 while(created<500){
   var cat=Object.keys(EXTRA_TEMPLATES)[k%Object.keys(EXTRA_TEMPLATES).length];
   var base=fallback[k%fallback.length],variant=VARIANTS[(k+11)%VARIANTS.length];
   var name=variant+" Commercial "+base+" "+Math.floor(k/Math.max(1,fallback.length)+1);
   P.push({id:next++,n:name,c:cat,p:null,i:WEB_REFERENCE_MEDIA[(next+cat.length)%WEB_REFERENCE_MEDIA.length],
     tag:"Catalogue",desc:"Additional structured catalogue reference for "+cat.toLowerCase()+".",
     spec:"Reference item · exact model, price, stock and technical specifications require Twins confirmation.",
     businesses:BUSINESS_LABELS.filter(function(b){return BUSINESS_MAP[b].indexOf(cat)>-1}).slice(0,4),
     availability:"Stock to confirm",condition:"New reference",source:"Web research reference image"});
   created++;k++;
 }
}

/* Smarter natural-language matching for queries such as “equipment for bakery”. */
function query6(text){
 var q=String(text||"").toLowerCase().trim();
 if(!q)return P.slice();
 var expanded=q;
 Object.keys(BUSINESS_MAP).forEach(function(b){
   if(q.indexOf(b.toLowerCase())>-1)expanded+=" "+BUSINESS_MAP[b].join(" ");
 });
 var terms=expanded.split(/[^a-z0-9&]+/i).filter(function(x){return x.length>2});
 return P.map(function(p){
   var blob=(p.n+" "+p.c+" "+p.desc+" "+p.spec+" "+(p.tag||"")+" "+(p.use||"")+" "+(p.businesses||[]).join(" ")).toLowerCase();
   var score=0;
   terms.forEach(function(t){if(blob.indexOf(t)>-1)score+=t.length>5?3:1});
   if(blob.indexOf(q)>-1)score+=10;
   return {p:p,score:score};
 }).filter(function(x){return x.score>0}).sort(function(a,b){return b.score-a.score||a.p.id-b.p.id}).map(function(x){return x.p});
}

function card6(p){
 var m=mediaFor6(p,p.id), savedNow=saved().indexOf(p.id)>-1,cmp=compare().indexOf(p.id)>-1;
 var biz=(p.businesses||[]).slice(0,2).join(" · ");
 return '<article class="prod p6card">'+
  '<div class="prodimg"><a href="product.html?id='+p.id+'"><img loading="lazy" decoding="async" src="'+esc6(m.src)+'" alt="'+esc6(p.n)+' reference image"></a>'+
  '<span class="badge">'+esc6(p.tag||"Equipment")+'</span><span class="mediaflag">'+(m.status==="twins"?"TWINS MEDIA":"REFERENCE")+'</span>'+
  '<button class="icon save '+(savedNow?"active":"")+'" aria-label="Save '+esc6(p.n)+'" onclick="toggleSave('+p.id+');return false">♡</button></div>'+
  '<div class="prodbody"><small class="muted">'+esc6(p.c)+'</small><a href="product.html?id='+p.id+'"><h3>'+esc6(p.n)+'</h3></a>'+
  '<p class="desc">'+esc6(p.desc)+'</p><div class="p6tags"><span>Quote on request</span><span>'+esc6(p.availability||"Stock to confirm")+'</span></div>'+
  (biz?'<small class="tiny muted">Useful for: '+esc6(biz)+'</small>':"")+
  '<div class="cardactions"><button class="btn red" onclick="add('+p.id+')">Build list</button><button class="btn light mini" onclick="toggleSave('+p.id+')">'+(savedNow?"♥":"♡")+'</button><button class="btn light mini '+(cmp?"active":"")+'" onclick="toggleCompare('+p.id+')">⇄</button></div>'+
  '<a class="cardwhatsapp" target="_blank" rel="noopener" href="'+whatsappUrl('Hello Twins Kitchen. I am interested in '+p.n+' (ID '+p.id+'). Please confirm the exact model, current price, availability and delivery.')+'">Official WhatsApp →</a></div></article>';
}

function renderCommerce6(){
 var root=document.getElementById("products");if(!root)return;
 var u=new URLSearchParams(location.search),q=u.get("q")||"",cat=u.get("cat")||"",business=u.get("business")||"",tag=u.get("tag")||"",pageNo=Math.max(1,Number(u.get("page")||1));
 var list=query6(q);
 if(cat)list=list.filter(function(p){return p.c===cat});
 if(tag)list=list.filter(function(p){return String(p.tag||"").toLowerCase()===tag.toLowerCase()});
 if(business)list=list.filter(function(p){return (p.businesses||[]).indexOf(business)>-1 || BUSINESS_MAP[business]&&BUSINESS_MAP[business].indexOf(p.c)>-1});
 var sort=u.get("sort")||"featured";
 if(sort==="name")list.sort(function(a,b){return a.n.localeCompare(b.n)});
 var size=30,total=list.length,pages=Math.max(1,Math.ceil(total/size));if(pageNo>pages)pageNo=pages;
 var visible=list.slice((pageNo-1)*size,pageNo*size);
 function url(o){var x=new URLSearchParams(location.search);Object.keys(o).forEach(function(k){if(o[k])x.set(k,o[k]);else x.delete(k)});x.delete("page");return"products.html"+(x.toString()?"?"+x.toString():"")}
 var suggestions=P.slice(0,80).map(function(p){return'<option value="'+esc6(p.n)+'">'}).join("");
 root.innerHTML=head()+
 '<main class="page"><div class="wrap"><div class="crumb">Store / '+esc6(business||cat||"All equipment")+'</div>'+
 '<div class="p6storehero"><div><span class="eyebrow darkey">TWINS COMMERCE CATALOGUE</span><h1>Find equipment by product, business or workflow.</h1><p class="muted">Search across '+P.length+' structured catalogue references. Prices and stock are confirmed directly with Twins before purchase.</p></div>'+
 '<div class="p6quicklinks">'+BUSINESS_LABELS.slice(0,6).map(function(b){return'<a href="'+url({business:b})+'">'+esc6(b)+' →</a>'}).join("")+'</div></div>'+
 '<form class="p6search" onsubmit="event.preventDefault();phase6Search(this.q.value)"><input name="q" list="p6Suggestions" value="'+esc6(q)+'" placeholder="Try “bakery”, “fryer”, “equipment for café”, “satellite”, “snooker”"><datalist id="p6Suggestions">'+suggestions+'</datalist><button class="btn red">Search</button></form>'+
 '<div class="p6filters"><select onchange="phase6Filter(&quot;cat&quot;,this.value)"><option value="">All areas</option>'+C.map(function(c){return'<option value="'+esc6(c[0])+'" '+(cat===c[0]?"selected":"")+'>'+esc6(c[0])+'</option>'}).join("")+'</select>'+
 '<select onchange="phase6Filter(&quot;business&quot;,this.value)"><option value="">All businesses</option>'+BUSINESS_LABELS.map(function(b){return'<option value="'+esc6(b)+'" '+(business===b?"selected":"")+'>'+esc6(b)+'</option>'}).join("")+'</select>'+
 '<select onchange="phase6Filter(&quot;sort&quot;,this.value)"><option value="featured" '+(sort==="featured"?"selected":"")+' >Featured</option><option value="name" '+(sort==="name"?"selected":"")+'>Name A–Z</option></select>'+
 '<a class="btn light" href="products.html">Reset</a></div>'+
 '<div class="storestats"><span><b>'+total+'</b> matches</span><span><b>'+P.length+'</b> catalogue references</span><span><b>'+saved().length+'</b> saved</span><span><b>'+compare().length+'</b> compared</span><a href="cart.html">Open equipment list →</a></div></div></main>'+
 '<section class="section"><div class="wrap"><div class="p6resultbar"><div><b>'+esc6(q?("Results for “"+q+"”"):(business?business+" equipment":cat||"All equipment"))+'</b><span>Page '+pageNo+' of '+pages+'</span></div><div><a href="wishlist.html">Saved</a><a href="compare.html">Compare</a><a href="cart.html">Equipment list</a></div></div>'+
 (visible.length?'<div class="grid p6grid">'+visible.map(card6).join("")+'</div>':'<div class="empty"><h2>No equipment matched that search.</h2><p class="muted">Try a product name, business type, equipment area or broader workflow term.</p><a class="btn red" href="equipment-finder.html">Use Equipment Finder</a></div>')+
 '<div class="productpager">'+(pageNo>1?'<a class="btn light" href="'+url({page:pageNo-1})+'">← Previous</a>':"")+
 Array.from({length:Math.min(7,pages)},function(_,i){var n=Math.max(1,Math.min(pages,pageNo-3+i));return'<a class="btn '+(n===pageNo?"red":"light")+'" href="'+url({page:n})+'">'+n+'</a>'}).filter(function(x,i,a){return a.indexOf(x)===i}).join("")+
 (pageNo<pages?'<a class="btn light" href="'+url({page:pageNo+1})+'">Next →</a>':"")+'</div></div></section>'+foot()+'<div id="toast"></div>';
}

window.phase6Search=function(v){var u=new URLSearchParams(location.search);if(v&&v.trim())u.set("q",v.trim());else u.delete("q");u.delete("page");location.href="products.html?"+u.toString()};
window.phase6Filter=function(k,v){var u=new URLSearchParams(location.search);if(v)u.set(k,v);else u.delete(k);u.delete("page");location.href="products.html?"+u.toString()};

function businessHub6(){
 var root=document.getElementById("industries");if(!root)return;
 root.innerHTML=head()+'<main class="page"><div class="wrap"><span class="eyebrow darkey">SHOP BY BUSINESS</span><h1>Start with the business. Build the equipment list.</h1><p class="muted p3max">Choose an operating model and Twins will take you from the equipment areas to products, packages and a quote request.</p><div class="p6businessgrid">'+BUSINESS_LABELS.map(function(b,i){var count=P.filter(function(p){return BUSINESS_MAP[b].indexOf(p.c)>-1}).length;return'<a class="p6business" href="products.html?business='+encodeURIComponent(b)+'"><span>0'+String(i+1).padStart(2,"0")+'</span><h2>'+esc6(b)+'</h2><p>'+BUSINESS_MAP[b].slice(0,4).join(" · ")+'</p><b>'+count+' relevant catalogue references →</b></a>'}).join("")+'</div></div></main>'+
 '<section class="section soft"><div class="wrap"><div class="p6flow"><span>01 Business</span><span>02 Equipment areas</span><span>03 Packages</span><span>04 Products</span><span>05 Quote</span></div><div class="panel enquiry"><div><b>Want Twins to help specify it?</b><p class="muted">Build a project brief and include capacity, space, utilities and delivery destination.</p></div><a class="btn red" href="project-planner.html">Start project brief →</a></div></div></section>'+foot()+'<div id="toast"></div>';
}

function compare6(){
 var root=document.getElementById("compare");if(!root)return;
 var ids=compare(),items=ids.map(function(id){return P.find(function(p){return p.id===id})}).filter(Boolean);
 var val=function(p,k){return esc6(p[k]||"Confirm with Twins")};
 root.innerHTML=head()+'<main class="page"><div class="wrap"><span class="eyebrow darkey">COMPARISON WORKSPACE</span><h1>Compare equipment before you build the list.</h1><p class="muted">Compare up to four references. Unknown technical values are intentionally shown as “Confirm with Twins”.</p>'+
 (items.length?'<div class="p6compare">'+items.map(function(p){var m=mediaFor6(p,p.id);return'<article><img loading="lazy" src="'+esc6(m.src)+'" alt="'+esc6(p.n)+'"><b>'+esc6(p.n)+'</b><span>'+esc6(p.c)+'</span><dl><div><dt>Use</dt><dd>'+val(p,"use")+'</dd></div><div><dt>Condition</dt><dd>'+val(p,"condition")+'</dd></div><div><dt>Availability</dt><dd>'+val(p,"availability")+'</dd></div><div><dt>Technical spec</dt><dd>'+val(p,"spec")+'</dd></div><div><dt>Price</dt><dd>'+esc6(SITE_CONFIG.priceLabel)+'</dd></div></dl><div class="p6compareactions"><a class="btn light mini" href="product.html?id='+p.id+'">Details</a><button class="btn light mini" onclick="toggleCompare('+p.id+');location.reload()">Remove</button></div></article>'}).join("")+'</div><div class="panel enquiry"><div><b>Ready to ask for pricing?</b><p class="muted">'+items.length+' products are selected for comparison.</p></div><a class="btn red" href="quote.html">Build quote →</a></div>':'<div class="empty"><h2>Your comparison is empty.</h2><p class="muted">Use ⇄ on any product to add it here.</p><a class="btn red" href="products.html">Browse 1,000 catalogue references</a></div>')+'</div></main>'+foot()+'<div id="toast"></div>';
}

function workspace6(){
 var root=document.getElementById("wishlist");if(!root)return;
 var sv=saved(),recent=viewed(),lists=savedLists(),quotes=get("twins_quote_requests",[]);
 function products(ids){return ids.map(function(id){return P.find(function(p){return p.id===id})}).filter(Boolean)}
 root.innerHTML=head()+'<main class="page"><div class="wrap"><span class="eyebrow darkey">PERSONAL SHOPPING WORKSPACE</span><h1>Keep the equipment you are planning close.</h1><p class="muted">Saved products, recently viewed equipment and saved equipment lists stay in this browser until production account sync is connected.</p>'+
 '<div class="p6workspacekpis"><a href="#saved"><b>'+sv.length+'</b><span>Saved products</span></a><a href="compare.html"><b>'+compare().length+'</b><span>Compared</span></a><a href="cart.html"><b>'+cart().reduce(function(a,x){return a+x.q},0)+'</b><span>List quantity</span></a><a href="#lists"><b>'+lists.length+'</b><span>Saved lists</span></a><a href="#quotes"><b>'+quotes.length+'</b><span>Quote drafts</span></a></div>'+
 '<section id="saved" class="sectioninner"><div class="sectionhead"><div><h2>Saved products</h2><p class="muted">Items you want to revisit.</p></div><a href="products.html" class="btn light">Browse more</a></div>'+
 (sv.length?'<div class="grid p6grid">'+products(sv).slice(0,24).map(card6).join("")+'</div>':'<div class="empty"><h3>No saved products yet.</h3><p class="muted">Use ♡ on a product card.</p></div>')+
 '<section class="sectioninner"><div class="sectionhead"><div><h2>Recently viewed</h2></div></div>'+(recent.length?'<div class="grid p6grid">'+products(recent).map(card6).join("")+'</div>':'<p class="muted">Recently viewed products will appear here.</p>')+
 '<section id="lists" class="sectioninner"><div class="sectionhead"><div><h2>Saved equipment lists</h2></div><a href="cart.html" class="btn light">Open equipment list</a></div>'+savedListMarkup()+
 '<section id="quotes" class="sectioninner"><div class="panel"><h2>Quote requests</h2><p class="muted">'+quotes.length+' request draft(s) stored locally.</p><a class="btn red" href="quote.html">Prepare a quote →</a></div></section>'+
 '</div></main>'+foot()+'<div id="toast"></div>';
}

function cart6(){
 var root=document.getElementById("cart");if(!root)return;
 var c=cart(),items=c.map(function(x){return{x:x,p:P.find(function(y){return y.id===x.id})}}).filter(function(x){return x.p});
 var count=c.reduce(function(a,x){return a+x.q},0);
 var message=cartMessage();
 root.innerHTML=head()+'<main class="page"><div class="wrap"><span class="eyebrow darkey">EQUIPMENT LIST</span><h1>Build the list. Then ask Twins to quote it.</h1><p class="muted">Quantities are saved in this browser. This is a quote-building workflow, not a claim that online payment is active.</p>'+
 '<div class="p6cartgrid"><section><div class="p6carthead"><b>'+count+' total item(s)</b><div><button class="btn light mini" onclick="saveEquipmentList()">Save list</button><a class="btn light mini" href="products.html">Continue shopping</a></div></div>'+
 (items.length?items.map(function(x){return'<article class="p6cartitem"><img loading="lazy" src="'+esc6(mediaFor6(x.p,x.p.id).src)+'" alt="'+esc6(x.p.n)+'"><div><a href="product.html?id='+x.p.id+'"><b>'+esc6(x.p.n)+'</b></a><span>'+esc6(x.p.c)+' · '+esc6(x.p.availability||"Stock to confirm")+'</span><div class="quantity"><button onclick="qty('+x.p.id+',-1)">−</button><b>'+x.x.q+'</b><button onclick="qty('+x.p.id+',1)">+</button></div></div><button class="btn light mini" onclick="removeCart('+x.p.id+')">Remove</button></article>'}).join(""):'<div class="empty"><h2>Your equipment list is empty.</h2><p class="muted">Browse the catalogue and add equipment you want Twins to quote.</p><a class="btn red" href="products.html">Browse 1,000+ references</a></div>')+
 '</section><aside class="p6cartaside"><span class="eyebrow darkey">NEXT STEP</span><h2>Request current pricing.</h2><p class="muted">Twins can confirm exact model, current price, availability, delivery and installation requirements against this list.</p><a class="btn red full" href="quote.html">Request a quotation →</a><a class="btn light full" target="_blank" rel="noopener" href="'+whatsappUrl(message)+'">Send this list on official WhatsApp →</a><div class="p6safety"><b>Payment safety</b><span>Do not treat a chat or listing as payment verification. Confirm the official payment method with Twins before sending funds.</span></div></aside></div></div></main>'+foot()+'<div id="toast"></div>';
}

function recommendations6(){
 var root=document.getElementById("product");if(!root)return;
 var id=Number(new URLSearchParams(location.search).get("id")),p=P.find(function(x){return x.id===id});if(!p)return;
 view(id);
 setTimeout(function(){
   if(root.dataset.p6rec==="1")return;root.dataset.p6rec="1";
   var cats=BUSINESS_LABELS.filter(function(b){return (p.businesses||[]).indexOf(b)>-1}).concat([p.c]);
   var related=P.filter(function(x){return x.id!==p.id&&(x.c===p.c||cats.some(function(b){return BUSINESS_MAP[b]&&BUSINESS_MAP[b].indexOf(x.c)>-1}))}).slice(0,8);
   if(!related.length)return;
   var sec=document.createElement("section");sec.className="section p6related";sec.innerHTML='<div class="wrap"><div class="sectionhead"><div><span class="eyebrow darkey">YOU MIGHT ALSO NEED</span><h2>Build the workflow around this equipment.</h2><p class="muted">Related references are discovery suggestions, not automatic stock bundles.</p></div><a class="btn light" href="products.html?business='+encodeURIComponent((p.businesses||[])[0]||"Restaurant")+'">Shop the business path →</a></div><div class="grid p6grid">'+related.map(card6).join("")+'</div></div>';
   root.parentNode.appendChild(sec);
 },0);
}

function packages6(){
 var root=document.getElementById("bundles");if(!root)return;
 var businessPackages={
  "Small Bakery Setup":["Bakery","Bakery Equipment","starter","Compact"],
  "Growing Bakery":["Bakery","Bakery Equipment","growth","Production"],
  "Commercial Bakery":["Bakery","Bakery Equipment","commercial","High Output"],
  "Restaurant Starter":["Restaurant","Cooking Equipment","starter","Standard"],
  "Fast Food Launch":["Fast Food","Cooking Equipment","fast","High Output"],
  "Café Starter":["Café","Bar & Beverage","starter","Compact"],
  "Hotel Kitchen Path":["Hotel","Restaurant & Hotel","hospitality","Professional"],
  "Catering Event Setup":["Catering","Catering Supplies","event","Mobile"],
  "Bar & Lounge Setup":["Bar & Lounge","Bar & Beverage","beverage","Professional"],
  "Entertainment Centre Setup":["Games & Entertainment","Games & Recreation","entertainment","Commercial"]
 };
 root.innerHTML=head()+'<main class="page"><div class="wrap"><span class="eyebrow darkey">TWINS SMART PACKAGES</span><h1>Choose the operation first. Then build the equipment.</h1><p class="muted p3max">These packages are planning templates. Exact specification, stock and price remain a Twins confirmation step.</p><div class="p6packagegrid">'+Object.keys(businessPackages).map(function(name,i){var x=businessPackages[name],items=P.filter(function(p){return p.c===x[1]}).slice(0,6);return'<article class="p6package"><span class="eyebrow darkey">0'+String(i+1).padStart(2,"0")+' · '+esc6(x[0])+'</span><h2>'+esc6(name)+'</h2><p>Purpose: '+esc6(x[2])+' · Equipment focus: '+esc6(x[3])+'</p><div>'+items.map(function(p){return'<a href="product.html?id='+p.id+'">'+esc6(p.n)+' →</a>'}).join("")+'</div><a class="btn red full" href="quote.html?business='+encodeURIComponent(x[0])+'">Request this package →</a></article>'}).join("")+'</div></div></main>'+foot()+'<div id="toast"></div>';
}

function marketplace6(){
 var root=document.getElementById("marketplace");if(!root)return;
 var drafts=get("twins_marketplace_listings",[]);
 root.innerHTML=head()+'<main class="page"><div class="wrap"><div class="marketHero compact"><div class="marketHeroGrid"><div><span class="eyebrow">TWINS MARKETPLACE</span><h1>Marketplace discovery, without confusing it with Twins stock.</h1><p>Official Twins catalogue and seller-submitted listings stay visually distinct. Community listings are enquiry-first until production verification, moderation, storage and payments are connected.</p><div class="heroactions"><a class="btn red" href="products.html">Shop Twins catalogue →</a><a class="btn light" href="sell-on-twins.html">Sell on Twins →</a></div></div><div class="marketTrust"><b>TWINS CATALOGUE</b><span>Official storefront references</span><b>MARKETPLACE</b><span>Seller-submitted listings</span><b>VERIFY BEFORE PAYMENT</b><span>Confirm seller, stock, price and payment route</span></div></div></div></div></main>'+
 '<section class="section"><div class="wrap"><div class="p6marketgrid"><a class="p6marketcard" href="products.html"><b>Official Twins</b><span>Browse '+P.length+' catalogue references</span>Open catalogue →</a><a class="p6marketcard" href="sell-on-twins.html"><b>Sell on Twins</b><span>Submit a seller listing draft</span>Seller onboarding →</a><a class="p6marketcard" href="trust-center.html"><b>Trust Centre</b><span>Understand listing and payment boundaries</span>Verify a purchase →</a></div><div class="panel p6marketnote"><b>Seller drafts: '+drafts.length+'</b><span>Local drafts are not public listings, verified sellers or completed transactions.</span></div></div></section>'+foot()+'<div id="toast"></div>';
}

function nav6(){
 var nav=document.querySelector(".navlinks");if(!nav||nav.dataset.p6==="1")return;
 nav.dataset.p6="1";
 var links=nav.querySelectorAll("a");
 links.forEach(function(a){if(a.textContent.trim()==="All Equipment")a.innerHTML="Shop Equipment";});
 var quote=document.createElement("a");quote.href="quote.html";quote.textContent="Quote";
 nav.appendChild(quote);
}

function performance6(){
 document.querySelectorAll("img").forEach(function(img){if(!img.loading)img.loading="lazy";if(!img.decoding)img.decoding="async"});
}

function audit6(){
 var root=document.body;
 root.dataset.catalogueCount=P.length;
 root.dataset.phase6="complete";
 window.TWINS_PHASE6_AUDIT={catalogue:P.length,businesses:BUSINESS_LABELS.length,saved:saved().length,compared:compare().length,cartQuantity:cart().reduce(function(a,x){return a+x.q},0)};
}

expandCatalogue();

document.addEventListener("DOMContentLoaded",function(){
 try{
   nav6();performance6();audit6();
   if(page==="products.html")renderCommerce6();
   else if(page==="industries.html")businessHub6();
   else if(page==="compare.html")compare6();
   else if(page==="wishlist.html")workspace6();
   else if(page==="cart.html")cart6();
   else if(page==="bundles.html")packages6();
   else if(page==="marketplace.html")marketplace6();
   else if(page==="product.html")recommendations6();
 }catch(e){console.error("Twins Phase 6 error",e)}
});
})();