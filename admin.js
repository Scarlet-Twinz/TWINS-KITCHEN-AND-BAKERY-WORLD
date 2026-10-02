(function () {
"use strict";

var currentUser = readUser();
var quotes = [];

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("twins_user") || "null");
  } catch (e) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
  });
}

function apiBase() {
  return (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.apiBase) ? SITE_CONFIG.apiBase : "http://localhost:8000";
}

async function request(path, options) {
  var opts = Object.assign({
    credentials: "include",
    headers: {"Content-Type": "application/json"}
  }, options || {});
  var response = await fetch(apiBase() + path, opts);
  var data = {};
  try { data = await response.json(); } catch (e) {}
  if (!response.ok) throw new Error(data.detail || ("Request failed (" + response.status + ")"));
  return data;
}

function isAdmin() {
  return !!(currentUser && currentUser.remote &&
    (currentUser.role === "admin" || currentUser.role === "staff"));
}

function statusBadge(value) {
  var text = String(value || "Unknown");
  var cls = /active|published|verified|closed|success/i.test(text) ? "green" :
    /pending|review|draft|prepared|initiated/i.test(text) ? "amber" :
    /failed|rejected|suspended|cancelled/i.test(text) ? "red" : "blue";
  return '<span class="status ' + cls + '">' + escapeHtml(text) + "</span>";
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("en-NG", {dateStyle:"medium", timeStyle:"short"});
  } catch (e) {
    return value || "—";
  }
}

function renderShell() {
  var initials = ((currentUser && currentUser.name) || "Admin")
    .split(" ").map(function (x) { return x.charAt(0); }).slice(0, 2).join("").toUpperCase();

  var navItems = [
    ["overview","Overview"], ["intake","Photo Intake"], ["catalogue","Catalogue"], ["inventory","Inventory"],
    ["quotes","Quotes"], ["orders","Orders"], ["customers","Customers & Staff"],
    ["payments","Payments"], ["delivery","Delivery"], ["marketplace","Marketplace"],
    ["audit","Audit Log"], ["settings","Settings"]
  ];

  var viewNames = navItems.map(function (item) { return item[0]; });

  document.getElementById("admin").innerHTML =
    '<div class="shell">' +
      '<aside class="side" id="adminSide">' +
        '<div class="brand"><img src="brand.svg" alt="Twins Kitchen"><div><b>TWINS KITCHEN</b><span>Operations Console</span></div></div>' +
        '<nav class="nav" id="adminNav"></nav>' +
        '<div class="sidefoot">Server-authorised operations. Payment credentials and webhooks are intentionally reserved for the integration phase.</div>' +
      '</aside>' +
      '<main class="main">' +
        '<header class="top"><div><button class="mobile" id="mobileMenu">☰</button><h1 id="adminTitle">Operations Overview</h1><p>Twins Kitchen & Bakery World · internal workspace</p></div>' +
        '<div class="user"><div class="avatar">' + escapeHtml(initials) + '</div><span>' + escapeHtml((currentUser && currentUser.name) || "Administrator") + '</span><a class="btn light" href="index.html">Storefront</a></div></header>' +
        '<div class="content" id="adminViews"></div>' +
      '</main>' +
    '</div>' +
    '<div class="drawer" id="adminDrawer"><div class="drawerbox" id="adminDrawerBox"></div></div>';

  document.getElementById("adminNav").innerHTML = navItems.map(function (item) {
    return '<button data-view="' + item[0] + '">' + item[1] + "</button>";
  }).join("");

  document.getElementById("adminViews").innerHTML = viewNames.map(function (name) {
    return '<section id="view-' + name + '" class="view"></section>';
  }).join("");

  document.getElementById("adminNav").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-view]");
    if (button) showView(button.dataset.view);
  });

  document.getElementById("mobileMenu").addEventListener("click", function () {
    document.getElementById("adminSide").classList.toggle("open");
  });

  showView("overview");
}

function showView(name) {
  document.querySelectorAll(".view").forEach(function (view) {
    view.classList.remove("active");
  });
  document.querySelectorAll("#adminNav button").forEach(function (button) {
    button.classList.toggle("active", button.dataset.view === name);
  });

  var target = document.getElementById("view-" + name);
  if (!target) return;
  target.classList.add("active");

  var titles = {
    overview:"Operations Overview", intake:"Photo Intake", catalogue:"Catalogue Management", inventory:"Inventory",
    quotes:"Quotation Requests", orders:"Orders", customers:"Customers & Staff",
    payments:"Payments", delivery:"Delivery", marketplace:"Marketplace Moderation",
    audit:"Audit Log", settings:"Admin Settings"
  };
  document.getElementById("adminTitle").textContent = titles[name] || "Admin";

  if (window.innerWidth < 760) document.getElementById("adminSide").classList.remove("open");

  if (name === "overview") renderOverview();
  else if (name === "intake") renderIntake();
  else if (name === "catalogue") renderCatalogue();
  else if (name === "quotes") renderQuotes();
  else if (name === "customers") renderCustomers();
  else if (name === "marketplace") renderMarketplace();
  else if (name === "settings") renderSettings();
  else renderModule(name);
}

function hero(label, title, description) {
  return '<div class="hero"><div><span class="eyebrow">' + label + '</span><h2>' +
    title + '</h2><p class="muted small">' + description + "</p></div></div>";
}

async function renderOverview() {
  var el = document.getElementById("view-overview");
  el.innerHTML = hero("TWINS OPERATIONS", "Run the store from one place.",
    "Catalogue, enquiries and operational modules are organised here. Payment is ready for later gateway integration.") +
    '<div class="kpis">' +
      '<div class="kpi redline"><b>' + P.length + '</b><span>Catalogue products</span></div>' +
      '<div class="kpi"><b>' + C.length + '</b><span>Equipment areas</span></div>' +
      '<div class="kpi greenline"><b id="quoteKpi">—</b><span>Server quote requests</span></div>' +
      '<div class="kpi blueline"><b>—</b><span>Customer accounts</span></div>' +
      '<div class="kpi"><b>—</b><span>Inventory records</span></div>' +
    '</div>' +
    '<div class="panel"><div class="head"><div><h3>Admin modules</h3><p>All operational areas are mapped into the console.</p></div></div>' +
    '<div class="quickgrid" id="quickModules"></div></div>' +
    '<div class="panel" style="margin-top:12px"><div class="head"><div><h3>Recent quotes</h3><p>Only server data is shown here.</p></div></div><div id="recentQuotes"><div class="empty">Loading…</div></div></div>';

  var modules = [
    ["catalogue","Catalogue","Products, categories, status and server mutations."],
    ["quotes","Quotes","Customer enquiries and project context."],
    ["inventory","Inventory","Stock levels, adjustments and availability."],
    ["orders","Orders","Order lifecycle and fulfilment."],
    ["payments","Payments","Gateway-ready records and webhook integration."],
    ["audit","Audit Log","Admin actions and security events."]
  ];
  document.getElementById("quickModules").innerHTML = modules.map(function (m) {
    return '<button class="quick" data-open="' + m[0] + '"><b>' + m[1] + '</b><span>' + m[2] + "</span></button>";
  }).join("");
  document.getElementById("quickModules").addEventListener("click", function (event) {
    var button = event.target.closest("[data-open]");
    if (button) showView(button.dataset.open);
  });

  try {
    var data = await request("/api/admin/quotes");
    quotes = data.quotes || [];
    document.getElementById("quoteKpi").textContent = quotes.length;
    document.getElementById("recentQuotes").innerHTML = quoteTable(quotes.slice(0, 6));
    bindQuoteButtons();
  } catch (error) {
    document.getElementById("recentQuotes").innerHTML = '<div class="notice">' + escapeHtml(error.message) + "</div>";
  }
}

function quoteTable(rows) {
  if (!rows.length) return '<div class="empty">No server quote requests yet.</div>';
  return '<div class="tablewrap"><table class="table"><thead><tr><th>Reference</th><th>Customer</th><th>Business</th><th>Status</th><th>Units</th><th>Created</th><th></th></tr></thead><tbody>' +
    rows.map(function (q) {
      return '<tr><td><strong>' + escapeHtml(q.reference) + '</strong></td><td>' +
        escapeHtml(q.name) + '<br><span class="muted">' + escapeHtml(q.phone) + '</span></td><td>' +
        escapeHtml(q.business || "—") + '</td><td><select class="quote-status" data-quote-reference="' + escapeHtml(q.reference) + '">' +
        ["Draft","Prepared","Sent to Twins","In review","Quoted","Closed"].map(function(s){return '<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>';}).join("") +
        '</select><div style="margin-top:5px">'+statusBadge(q.status)+'</div></td><td>' +
        escapeHtml(q.itemCount || 0) + '</td><td>' + formatDate(q.createdAt) +
        '</td><td><button class="btn light quote-view" data-reference="' + escapeHtml(q.reference) + '">View</button></td></tr>';
    }).join("") + "</tbody></table></div>";
}

function bindQuoteButtons() {
  document.querySelectorAll(".quote-view").forEach(function (button) {
    button.onclick = function () { openQuote(button.dataset.reference); };
  });
  document.querySelectorAll(".quote-status").forEach(function (select) {
    var q = quotes.find(function (item) { return item.reference === select.dataset.quoteReference; });
    if (q) select.value = q.status;
    select.onchange = async function () {
      try {
        await request("/api/admin/quotes/" + encodeURIComponent(select.dataset.quoteReference), {
          method:"PATCH",
          body:JSON.stringify({status:select.value})
        });
        var match = quotes.find(function (item) { return item.reference === select.dataset.quoteReference; });
        if (match) match.status = select.value;
        renderQuotes();
      } catch (error) {
        alert(error.message);
      }
    };
  });
}

async function renderQuotes() {
  var el = document.getElementById("view-quotes");
  el.innerHTML = hero("CUSTOMER ENQUIRIES", "Quotation requests",
    "Review incoming equipment enquiries and project context.") +
    '<div id="quotesTable"><div class="empty">Loading…</div></div>';
  try {
    var data = await request("/api/admin/quotes");
    quotes = data.quotes || [];
    document.getElementById("quotesTable").innerHTML = quoteTable(quotes);
    bindQuoteButtons();
  } catch (error) {
    document.getElementById("quotesTable").innerHTML = '<div class="notice">' + escapeHtml(error.message) + "</div>";
  }
}

function openQuote(reference) {
  var quote = quotes.find(function (item) { return item.reference === reference; });
  if (!quote) return;
  var fields = [
    ["Customer",quote.name],["Email",quote.email],["Phone",quote.phone],["Business",quote.business],
    ["Project stage",quote.stage],["Location",quote.location],["Capacity",quote.capacity],
    ["Space",quote.space],["Utilities",quote.utilities],["Package",quote.packageName],
    ["Requirements",quote.requirements],["Status",quote.status],["Requested units",quote.itemCount],
    ["Created",formatDate(quote.createdAt)]
  ];
  document.getElementById("adminDrawerBox").innerHTML =
    '<div class="drawerhead"><div><span class="eyebrow">QUOTE</span><h3>' +
    escapeHtml(quote.reference) + '</h3></div><button class="close" id="closeDrawer">×</button></div>' +
    '<div class="detail">' + fields.map(function (field) {
      return '<div><b>' + escapeHtml(field[0]) + '</b><span>' + escapeHtml(field[1] || "—") + "</span></div>";
    }).join("") + "</div>";
  document.getElementById("adminDrawer").classList.add("open");
  document.getElementById("closeDrawer").onclick = closeDrawer;
}

function closeDrawer() {
  document.getElementById("adminDrawer").classList.remove("open");
}

function renderCatalogue() {
  var el = document.getElementById("view-catalogue");
  el.innerHTML = hero("CATALOGUE", "Product management",
    "Browse the data-driven catalogue without mutating data.js.") +
    '<div class="toolbar"><input id="catalogueSearch" placeholder="Search products…"><select id="catalogueCategory"><option value="">All categories</option>' +
    C.map(function (category) { return "<option>" + escapeHtml(category[0]) + "</option>"; }).join("") +
    '</select><button class="btn red" id="addProduct">Add product</button></div><div id="catalogueTable"></div>';
  document.getElementById("catalogueSearch").oninput = filterCatalogue;
  document.getElementById("catalogueCategory").onchange = filterCatalogue;
  document.getElementById("addProduct").onclick = function () {
    alert("The Add Product action is reserved for the authenticated server catalogue API. No browser-local product record is created.");
  };
  filterCatalogue();
}

function filterCatalogue() {
  var query = (document.getElementById("catalogueSearch").value || "").toLowerCase();
  var category = document.getElementById("catalogueCategory").value;
  var rows = P.filter(function (product) {
    var text = product.n + " " + product.c + " " + (product.desc || "");
    return (!query || text.toLowerCase().indexOf(query) > -1) &&
      (!category || product.c === category);
  }).slice(0, 200);

  document.getElementById("catalogueTable").innerHTML =
    '<div class="tablewrap"><table class="table"><thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Price</th><th>Media</th><th>Status</th><th></th></tr></thead><tbody>' +
    rows.map(function (product) {
      return '<tr><td>' + escapeHtml(product.id) + '</td><td><strong>' + escapeHtml(product.n) +
        '</strong><br><span class="muted">' + escapeHtml(product.tag || "") + '</span></td><td>' +
        escapeHtml(product.c) + '</td><td>' + escapeHtml(product.price || "On request") +
        '</td><td>' + statusBadge((product.img || "").indexOf("assets/") === 0 ? "Supplied media" : "Photo pending") +
        '</td><td>' + statusBadge("Active") + '</td><td><button class="btn light product-view" data-product-id="' +
        escapeHtml(product.id) + '">View</button></td></tr>';
    }).join("") + "</tbody></table></div>";

  document.querySelectorAll(".product-view").forEach(function (button) {
    button.onclick = function () { openProduct(button.dataset.productId); };
  });
}

function openProduct(id) {
  var product = P.find(function (item) { return String(item.id) === String(id); });
  if (!product) return;
  var fields = [
    ["Legacy ID",product.id],["Category",product.c],["Description",product.desc],
    ["Specifications",product.spec],["Price",product.price || "Current price on request"],
    ["Tag",product.tag],["Media",product.img],
    ["Mode","Reference/storefront data until server catalogue sync."]
  ];
  document.getElementById("adminDrawerBox").innerHTML =
    '<div class="drawerhead"><div><span class="eyebrow">PRODUCT</span><h3>' +
    escapeHtml(product.n) + '</h3></div><button class="close" id="closeDrawer">×</button></div>' +
    '<div class="detail">' + fields.map(function (field) {
      return '<div><b>' + escapeHtml(field[0]) + '</b><span>' + escapeHtml(field[1] || "—") + "</span></div>";
    }).join("") + "</div>";
  document.getElementById("adminDrawer").classList.add("open");
  document.getElementById("closeDrawer").onclick = closeDrawer;
}

async function renderModule(name) {
  var modules = {
    inventory:["INVENTORY","Inventory","Stock quantities, low-stock alerts, adjustments and history."],
    orders:["ORDERS","Orders","Order lifecycle, customer order details and fulfilment history."],
    payments:["PAYMENTS","Payments","Gateway records, references, statuses and refunds."],
    delivery:["DELIVERY","Fulfilment","Delivery destinations, dispatch, status and completion."],
    audit:["SECURITY","Audit log","Admin mutations and security events."]
  };
  var module = modules[name];
  var el = document.getElementById("view-" + name);
  el.innerHTML = hero(module[0],module[1],module[2]) + '<div id="moduleBody"><div class="empty">Loading server records…</div></div>';
  if(name === "payments"){
    document.getElementById("moduleBody").innerHTML =
      '<div class="notice">Payment records are intentionally gateway-ready only. Paystack/Flutterwave credentials, webhook verification and reconciliation will be connected after the merchant account is configured.</div>' +
      '<div class="cards"><div class="card module"><span class="eyebrow">SAFE BOUNDARY</span><h4>No browser payment authority</h4><p>Payment status must come from verified server-side gateway webhooks.</p></div><div class="card module"><span class="eyebrow">DATABASE</span><h4>Transaction table ready</h4><p>payment_transactions exists in the backend schema for the integration phase.</p></div></div>';
    return;
  }
  try {
    var data;
    if(name === "inventory") data = await request("/api/admin/inventory");
    if(name === "orders") data = await request("/api/admin/orders");
    if(name === "delivery") data = await request("/api/admin/delivery");
    if(name === "audit") data = await request("/api/admin/audit");
    var body = document.getElementById("moduleBody");
    if(name === "inventory"){
      var rows=data.inventory||[];
      body.innerHTML = '<div class="tablewrap"><table class="table"><thead><tr><th>Product</th><th>Qty</th><th>Reserved</th><th>Reorder</th><th>Status</th><th>Updated</th><th>Adjust</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function(x){
          return '<tr><td><strong>'+escapeHtml(x.name)+'</strong><br><span class="muted">#'+escapeHtml(x.productId)+'</span></td><td>'+x.quantity+'</td><td>'+x.reservedQuantity+'</td><td>'+x.reorderLevel+'</td><td>'+statusBadge(x.status)+'</td><td>'+formatDate(x.updatedAt)+'</td><td><button class="btn light mini" data-adjust="'+x.productId+'" data-delta="-1">−1</button> <button class="btn light mini" data-adjust="'+x.productId+'" data-delta="1">+1</button></td></tr>';
        }).join("") : '<tr><td colspan="7">No inventory records yet. Seed inventory from the authenticated operations workflow.</td></tr>') +
        '</tbody></table></div>';
      body.querySelectorAll("[data-adjust]").forEach(function(btn){
        btn.onclick=async function(){
          var reason=prompt("Reason for this inventory adjustment:");
          if(!reason)return;
          try{await request("/api/admin/inventory/adjust",{method:"POST",body:JSON.stringify({productId:Number(btn.dataset.adjust),delta:Number(btn.dataset.delta),reason:reason})});renderModule(name)}catch(e){alert(e.message)}
        };
      });
    } else if(name === "orders"){
      var rows=data.orders||[];
      body.innerHTML = '<div class="tablewrap"><table class="table"><thead><tr><th>Reference</th><th>Customer</th><th>Status</th><th>Payment</th><th>Total</th><th>Created</th><th>Change</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function(x){
          return '<tr><td><strong>'+escapeHtml(x.reference)+'</strong></td><td>'+escapeHtml(x.customerName)+'<br><span class="muted">'+escapeHtml(x.customerPhone)+'</span></td><td>'+statusBadge(x.status)+'</td><td>'+statusBadge(x.paymentStatus)+'</td><td>'+escapeHtml(x.currency)+' '+x.totalAmount.toLocaleString()+'</td><td>'+formatDate(x.createdAt)+'</td><td><select data-order-status="'+x.id+'"><option value="pending">pending</option><option value="confirmed">confirmed</option><option value="processing">processing</option><option value="ready">ready</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select></td></tr>';
        }).join("") : '<tr><td colspan="7">No orders have been created from approved quotation requests.</td></tr>') +
        '</tbody></table></div>';
      body.querySelectorAll("[data-order-status]").forEach(function(select){
        var current=rows.find(function(x){return x.id===select.dataset.orderStatus}); if(current)select.value=current.status;
        select.onchange=async function(){try{await request("/api/admin/orders/"+select.dataset.orderStatus,{method:"PATCH",body:JSON.stringify({status:select.value})});renderModule(name)}catch(e){alert(e.message)}};
      });
    } else if(name === "delivery"){
      var rows=data.deliveries||[];
      body.innerHTML = '<div class="tablewrap"><table class="table"><thead><tr><th>Order</th><th>Recipient</th><th>Destination</th><th>Status</th><th>Tracking</th><th>Updated</th><th>Change</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function(x){
          return '<tr><td><strong>'+escapeHtml(x.orderReference)+'</strong></td><td>'+escapeHtml(x.recipientName)+'<br><span class="muted">'+escapeHtml(x.phone)+'</span></td><td>'+escapeHtml([x.address,x.city,x.state,x.country].filter(Boolean).join(", "))+'</td><td>'+statusBadge(x.status)+'</td><td>'+escapeHtml(x.trackingReference||"—")+'</td><td>'+formatDate(x.updatedAt)+'</td><td><select data-delivery-status="'+x.id+'"><option>pending</option><option>scheduled</option><option>dispatched</option><option>in_transit</option><option>delivered</option><option>failed</option><option>cancelled</option></select></td></tr>';
        }).join("") : '<tr><td colspan="7">No delivery records yet.</td></tr>') +
        '</tbody></table></div>';
      body.querySelectorAll("[data-delivery-status]").forEach(function(select){
        var current=rows.find(function(x){return x.id===select.dataset.deliveryStatus}); if(current)select.value=current.status;
        select.onchange=async function(){try{await request("/api/admin/delivery/"+select.dataset.deliveryStatus,{method:"PATCH",body:JSON.stringify({status:select.value})});renderModule(name)}catch(e){alert(e.message)}};
      });
    } else if(name === "audit"){
      var rows=data.events||[];
      body.innerHTML = rows.length ? '<div class="tablewrap"><table class="table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>'+rows.map(function(x){
        return '<tr><td>'+formatDate(x.createdAt)+'</td><td>'+escapeHtml(x.actor)+'</td><td><strong>'+escapeHtml(x.action)+'</strong></td><td>'+escapeHtml(x.entityType||"—")+' '+escapeHtml(x.entityId||"")+'</td><td><code>'+escapeHtml(JSON.stringify(x.metadata||{}))+'</code></td></tr>';
      }).join("")+'</tbody></table></div>' : '<div class="empty">No audit events have been recorded yet.</div>';
    }
  } catch(error) {
    document.getElementById("moduleBody").innerHTML = '<div class="notice">' + escapeHtml(error.message) + "</div>";
  }
}

function renderCustomers() {
  document.getElementById("view-customers").innerHTML =
    hero("PEOPLE","Customers & staff","Account management and role boundaries.") +
    '<div class="cards">' +
    '<div class="card module"><span class="eyebrow">CONNECTED</span><h4>Customer authentication</h4><p>Signup, login, logout and account lookup use the FastAPI session boundary.</p><span>SERVER SESSION</span></div>' +
    '<div class="card module"><span class="eyebrow">ROLES</span><h4>Admin and staff roles</h4><p>The backend supports customer, staff and admin roles.</p><span>ROLE MODEL</span></div>' +
    '<div class="card module"><span class="eyebrow">HARDENING</span><h4>Security checklist</h4><p>Email verification, recovery, CSRF protection and rate limiting remain backend hardening tasks.</p><span>HARDENING NEXT</span></div></div>';
}

async function renderMarketplace() {
  var el = document.getElementById("view-marketplace");
  el.innerHTML = hero("COMMUNITY","Marketplace moderation","Keep community seller listings separate from official Twins stock.") +
    '<div id="marketplaceTable"><div class="empty">Loading…</div></div>';
  try {
    var data = await request("/api/marketplace/listings");
    var rows = data.listings || [];
    document.getElementById("marketplaceTable").innerHTML = rows.length ?
      '<div class="tablewrap"><table class="table"><thead><tr><th>Listing</th><th>Seller</th><th>Category</th><th>Location</th><th>Verification</th></tr></thead><tbody>' +
      rows.map(function (item) {
        return '<tr><td><strong>' + escapeHtml(item.title) + '</strong><br><span class="muted">' +
          escapeHtml(item.description).slice(0,100) + '</span></td><td>' + escapeHtml(item.seller) +
          '</td><td>' + escapeHtml(item.category) + '</td><td>' + escapeHtml(item.location || "—") +
          '</td><td>' + statusBadge(item.sellerVerification) + "</td></tr>";
      }).join("") + "</tbody></table></div>" :
      '<div class="empty">No published community listings.</div>';
  } catch (error) {
    document.getElementById("marketplaceTable").innerHTML = '<div class="notice">' + escapeHtml(error.message) + "</div>";
  }
}

function renderSettings() {
  document.getElementById("view-settings").innerHTML =
    hero("CONFIGURATION","Admin settings","System configuration and production readiness checklist.") +
    '<div class="cards">' +
    '<div class="card module"><span class="eyebrow">API</span><h4>Backend base</h4><p>' + escapeHtml(apiBase()) + '</p><span>CONFIGURED</span></div>' +
    '<div class="card module"><span class="eyebrow">PAYMENTS</span><h4>Gateway slot</h4><p>Payment provider credentials, webhook signing and reconciliation are deliberately not hardcoded here.</p><span>INTEGRATION LATER</span></div>' +
    '<div class="card module"><span class="eyebrow">PRODUCTION</span><h4>Launch checklist</h4><p>HTTPS, secure cookies, CSRF, rate limiting, verification, recovery, audit events and secret rotation.</p><span>CHECK BEFORE LAUNCH</span></div></div>';
}

function deny() {
  document.getElementById("admin").innerHTML =
    '<main style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="panel" style="max-width:520px;text-align:center"><span class="eyebrow">TWINS ADMIN</span><h1>Staff access required</h1><p class="muted">Sign in with a server-authenticated staff or admin account to open the operations workspace.</p><a class="btn red" href="login.html">Sign in</a></div></main>';
}


function operationsMoney(value,currency){
  try{return new Intl.NumberFormat("en-NG",{style:"currency",currency:currency||"NGN",maximumFractionDigits:2}).format(Number(value||0));}
  catch(e){return String(value||0);}
}
function operationsTable(headers,rows){
  return '<div class="tablewrap"><table class="table"><thead><tr>'+headers.map(function(h){return '<th>'+escapeHtml(h)+'</th>';}).join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';
}
function operationsShell(user){
  document.getElementById("admin").innerHTML=
    '<div class="shell"><aside class="side" id="operationsSide"><div class="brand"><img src="brand.svg" alt="Twins Kitchen"><div><b>TWINS KITCHEN</b><span>Business Operations</span></div></div>'+
    '<nav class="nav" id="operationsNav"></nav><div class="sidefoot">Internal operations only. Customer accounts cannot access these views or APIs.</div></aside>'+
    '<main class="main"><header class="top"><div><button class="mobile" id="operationsMenu">☰</button><h1 id="operationsTitle">Overview</h1><p>Quotes · Orders · Payments · Customers · Fulfilment</p></div><div class="user"><div class="avatar">'+escapeHtml(((user.name||"Admin").split(" ").map(function(x){return x.charAt(0)}).slice(0,2).join("").toUpperCase()))+'</div><span>'+escapeHtml(user.name||"Administrator")+'</span><a class="btn light" href="admin.html">Media Center</a><a class="btn light" href="index.html">Storefront</a></div></header><div class="content" id="operationsViews"></div></main></div>';
  var nav=[["overview","Overview"],["quotes","Quotes"],["orders","Orders"],["payments","Payments"],["customers","Customers"],["delivery","Delivery"],["products","Products"],["media","Media Center"]];
  document.getElementById("operationsNav").innerHTML=nav.map(function(x){return '<button data-operations-view="'+x[0]+'">'+x[1]+'</button>';}).join("");
  document.getElementById("operationsNav").addEventListener("click",function(e){
    var b=e.target.closest("button[data-operations-view]");if(!b)return;
    if(b.dataset.operationsView==="media"){location.href="admin.html";return;}
    showOperationsView(b.dataset.operationsView);
  });
  document.getElementById("operationsMenu").onclick=function(){document.getElementById("operationsSide").classList.toggle("open");};
  showOperationsView("overview");
}
async function operationsRequest(path,options){return request(path,options);}
function showOperationsView(name){
  var nav=document.querySelectorAll("[data-operations-view]");
  nav.forEach(function(b){b.classList.toggle("active",b.dataset.operationsView===name);});
  document.querySelectorAll("[data-operations-view]").forEach(function(b){});
  var titles={overview:"Operations Overview",quotes:"Quotes",orders:"Orders",payments:"Payments",customers:"Customers",delivery:"Delivery",products:"Products"};
  document.getElementById("operationsTitle").textContent=titles[name]||"Operations";
  if(window.innerWidth<760)document.getElementById("operationsSide").classList.remove("open");
  var v=document.getElementById("operationsViews");v.innerHTML='<div class="empty">Loading…</div>';
  if(name==="overview")renderOperationsOverview();
  else if(name==="quotes")renderOperationsQuotes();
  else if(name==="orders")renderOperationsOrders();
  else if(name==="payments")renderOperationsPayments();
  else if(name==="customers")renderOperationsCustomers();
  else if(name==="delivery")renderOperationsDelivery();
  else if(name==="products")renderOperationsProducts();
}
async function renderOperationsOverview(){
  var el=document.getElementById("operationsViews"),d=await operationsRequest("/api/admin/operations/overview"),k=d.kpis;
  el.innerHTML='<div class="hero"><div><span class="eyebrow">TWINS OPERATIONS</span><h2>Business at a glance</h2><p class="muted small">Only server-calculated records are shown.</p></div></div>'+
    '<div class="kpis">'+[["New quote requests",k.newQuotes],["Open orders",k.openOrders],["Awaiting payment",k.awaitingPayment],["Paid orders",k.paidOrders],["Awaiting fulfilment",k.awaitingFulfilment],["Awaiting delivery",k.awaitingDelivery]].map(function(x){return '<div class="kpi"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>';}).join("")+'</div>'+
    '<div class="panel"><div class="head"><div><h3>Recent orders</h3></div></div>'+operationsTable(["Order","Customer","Total","Payment","Fulfilment"],d.recentOrders.map(function(o){return '<tr><td><button class="btn light mini" data-order-open="'+escapeHtml(o.reference)+'">'+escapeHtml(o.reference)+'</button></td><td>'+escapeHtml(o.customerName)+'</td><td>'+operationsMoney(o.total)+'</td><td>'+statusBadge(o.paymentStatus)+'</td><td>'+statusBadge(o.fulfilmentStatus)+'</td></tr>';}))+'</div>';
  el.querySelectorAll("[data-order-open]").forEach(function(b){b.onclick=async function(){var rows=await operationsRequest("/api/admin/orders");var o=rows.orders.find(function(x){return x.reference===b.dataset.orderOpen});if(o)openOperationsOrder(o.id);};});
}
async function renderOperationsQuotes(){
  var el=document.getElementById("operationsViews"),d=await operationsRequest("/api/admin/quotes");
  el.innerHTML='<div class="hero"><div><span class="eyebrow">QUOTES</span><h2>Customer quote requests</h2><p class="muted small">Negotiation stays here until staff creates the final order.</p></div></div>'+operationsTable(["Reference","Customer","Items","Status","Received",""],d.quotes.map(function(q){return '<tr><td><button class="btn light mini" data-quote-open="'+escapeHtml(q.reference)+'">'+escapeHtml(q.reference)+'</button></td><td>'+escapeHtml(q.name)+'</td><td>'+q.itemCount+'</td><td>'+statusBadge(q.status)+'</td><td>'+formatDate(q.createdAt)+'</td><td><a class="btn light mini" target="_blank" href="https://wa.me/'+escapeHtml((q.phone||"").replace(/\\D/g,""))+'">WhatsApp</a></td></tr>';}));
  el.querySelectorAll("[data-quote-open]").forEach(function(b){b.onclick=function(){openOperationsQuote(b.dataset.quoteOpen);};});
}
async function openOperationsQuote(reference){
  var d=await operationsRequest("/api/admin/operations/quotes/"+encodeURIComponent(reference)),q=d.quote,el=document.getElementById("operationsViews");
  el.innerHTML='<button class="btn light" id="opsBackQuotes">← Quotes</button><div class="panel" style="margin-top:12px"><div class="head"><div><span class="eyebrow">QUOTE</span><h2>'+escapeHtml(q.reference)+'</h2><p>'+escapeHtml(q.name)+' · '+escapeHtml(q.phone)+'</p></div>'+statusBadge(q.status)+'</div>'+
    '<div class="detail">'+[["Email",q.email],["Business",q.business],["Location",q.location],["Project stage",q.stage],["Capacity",q.capacity],["Space",q.space],["Utilities",q.utilities],["Requirements",q.requirements]].map(function(x){return '<div><b>'+escapeHtml(x[0])+'</b><span>'+escapeHtml(x[1]||"—")+'</span></div>';}).join("")+'</div>'+
    '<h3>Requested products</h3><div class="tablewrap"><table class="table"><tbody>'+q.items.map(function(i){return '<tr><td>'+escapeHtml(i.name)+'</td><td>'+i.quantity+'</td></tr>';}).join("")+'</tbody></table></div>'+
    '<div style="margin-top:16px"><a class="btn light" target="_blank" href="https://wa.me/'+escapeHtml((q.phone||"").replace(/\\D/g,""))+'">Contact on WhatsApp</a> <button class="btn red" id="createOpsOrder">Create Order</button></div></div>';
  document.getElementById("opsBackQuotes").onclick=function(){showOperationsView("quotes");};
  document.getElementById("createOpsOrder").onclick=function(){openOperationsOrderForm(q);};
}
function openOperationsOrderForm(q){
  var el=document.getElementById("operationsViews"),items=q.items.filter(function(i){return i.productId;});
  el.innerHTML='<button class="btn light" id="opsBackQuote">← Quote</button><div class="panel" style="margin-top:12px"><span class="eyebrow">CREATE ORDER</span><h2>'+escapeHtml(q.name)+'</h2><div id="opsOrderLines">'+items.map(function(i,n){return '<div class="card" style="margin:10px 0"><b>'+escapeHtml(i.name)+'</b><div class="toolbar"><label>Quantity<input id="opsQty'+n+'" type="number" min="1" value="'+i.quantity+'"></label><label>Agreed unit price<input id="opsPrice'+n+'" type="number" min="0" step="0.01" value="0"></label></div></div>';}).join("")+'</div><label>Delivery fee<input id="opsDeliveryFee" type="number" min="0" step="0.01" value="0"></label><label>Delivery location<input id="opsLocation" value="'+escapeHtml(q.location||"")+'"></label><label>Customer notes<textarea id="opsCustomerNotes"></textarea></label><label>Internal notes<textarea id="opsInternalNotes"></textarea></label><button class="btn red" id="saveOpsOrder">Create Order</button></div>';
  document.getElementById("opsBackQuote").onclick=function(){openOperationsQuote(q.reference);};
  document.getElementById("saveOpsOrder").onclick=async function(){try{var payload={quoteReference:q.reference,deliveryFee:Number(document.getElementById("opsDeliveryFee").value||0),customerLocation:document.getElementById("opsLocation").value,customerNotes:document.getElementById("opsCustomerNotes").value,internalNotes:document.getElementById("opsInternalNotes").value,items:items.map(function(i,n){return {productId:i.productId,quantity:Number(document.getElementById("opsQty"+n).value),agreedUnitPrice:Number(document.getElementById("opsPrice"+n).value)}})};var d=await operationsRequest("/api/admin/operations/orders/from-quote",{method:"POST",body:JSON.stringify(payload)});openOperationsOrder(d.order.id);}catch(e){alert(e.message);}};
}
async function renderOperationsOrders(){
  var el=document.getElementById("operationsViews"),d=await operationsRequest("/api/admin/orders");
  el.innerHTML='<div class="hero"><div><span class="eyebrow">ORDERS</span><h2>Agreed customer orders</h2></div></div>'+operationsTable(["Reference","Customer","Total","Payment","Order status","Created"],d.orders.map(function(o){return '<tr><td><button class="btn light mini" data-ops-order="'+o.id+'">'+escapeHtml(o.reference)+'</button></td><td>'+escapeHtml(o.customerName)+'</td><td>'+operationsMoney(o.totalAmount,o.currency)+'</td><td>'+statusBadge(o.paymentStatus)+'</td><td>'+statusBadge(o.status)+'</td><td>'+formatDate(o.createdAt)+'</td></tr>';}));
  el.querySelectorAll("[data-ops-order]").forEach(function(b){b.onclick=function(){openOperationsOrder(b.dataset.opsOrder);};});
}
async function openOperationsOrder(id){
  var d=await operationsRequest("/api/admin/operations/orders/"+id),o=d.order,el=document.getElementById("operationsViews");
  el.innerHTML='<button class="btn light" id="opsBackOrders">← Orders</button><div class="panel" style="margin-top:12px"><div class="head"><div><span class="eyebrow">ORDER</span><h2>'+escapeHtml(o.reference)+'</h2><p>'+escapeHtml(o.customer.name)+' · '+escapeHtml(o.customer.phone)+'</p><p>'+escapeHtml(o.customer.location||"No delivery location")+'</p></div>'+statusBadge(o.paymentStatus)+'</div>'+
    '<div class="tablewrap"><table class="table"><thead><tr><th>Product snapshot</th><th>Qty</th><th>Agreed unit price</th><th>Line total</th></tr></thead><tbody>'+o.items.map(function(i){return '<tr><td>'+escapeHtml(i.name)+'</td><td>'+i.quantity+'</td><td>'+operationsMoney(i.unitPrice,o.currency)+'</td><td>'+operationsMoney(i.lineTotal,o.currency)+'</td></tr>';}).join("")+'</tbody></table></div>'+
    '<div class="detail" style="margin-top:14px"><div><b>Subtotal</b><span>'+operationsMoney(o.subtotal,o.currency)+'</span></div><div><b>Delivery</b><span>'+operationsMoney(o.deliveryFee,o.currency)+'</span></div><div><b>Total</b><span><strong>'+operationsMoney(o.total,o.currency)+'</strong></span></div><div><b>Fulfilment</b><span>'+statusBadge(o.fulfilmentStatus)+'</span></div></div>'+
    '<div class="toolbar" style="margin-top:16px"><select id="opsFulfilment"><option value="pending">Pending</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option></select><button class="btn light" id="saveOpsFulfilment">Update fulfilment</button>'+(o.paymentStatus!=="paid"?' <button class="btn red" id="generateOpsPayment">Generate Payment Link</button>':"")+'</div><div id="opsPaymentResult"></div></div>';
  document.getElementById("opsBackOrders").onclick=function(){showOperationsView("orders");};document.getElementById("opsFulfilment").value=o.fulfilmentStatus;
  document.getElementById("saveOpsFulfilment").onclick=async function(){try{await operationsRequest("/api/admin/operations/orders/"+id+"/fulfilment",{method:"PATCH",body:JSON.stringify({status:document.getElementById("opsFulfilment").value})});openOperationsOrder(id);}catch(e){alert(e.message);}};
  var pay=document.getElementById("generateOpsPayment");if(pay)pay.onclick=async function(){try{var p=await operationsRequest("/api/admin/operations/orders/"+id+"/payments",{method:"POST"});document.getElementById("opsPaymentResult").innerHTML='<div class="notice"><b>Payment request created</b><p>'+escapeHtml(p.payment.reference)+'</p><p><a href="'+escapeHtml(p.payment.authorizationUrl)+'" target="_blank">'+escapeHtml(p.payment.authorizationUrl)+'</a></p><button class="btn light" id="copyOpsPayment">Copy Payment Link</button></div>';document.getElementById("copyOpsPayment").onclick=function(){navigator.clipboard.writeText(p.payment.authorizationUrl);};}catch(e){alert(e.message);}};
}
async function renderOperationsPayments(){var d=await operationsRequest("/api/admin/operations/payments");document.getElementById("operationsViews").innerHTML='<div class="hero"><div><span class="eyebrow">PAYMENTS</span><h2>Payment transactions</h2></div></div>'+operationsTable(["Reference","Order","Amount","Status","Gateway","Created"],d.payments.map(function(p){return '<tr><td>'+escapeHtml(p.reference)+'</td><td>'+escapeHtml(p.orderReference||"—")+'</td><td>'+operationsMoney(p.amount,p.currency)+'</td><td>'+statusBadge(p.status)+'</td><td>'+escapeHtml(p.gateway)+'</td><td>'+formatDate(p.createdAt)+'</td></tr>';}));}
async function renderOperationsCustomers(){var d=await operationsRequest("/api/admin/operations/customers");document.getElementById("operationsViews").innerHTML='<div class="hero"><div><span class="eyebrow">CUSTOMERS</span><h2>Customer accounts</h2></div></div>'+operationsTable(["Name","Phone","Email","Quotes","Orders","Total paid","Joined"],d.customers.map(function(c){return '<tr><td>'+escapeHtml(c.name)+'</td><td>'+escapeHtml(c.phone||"—")+'</td><td>'+escapeHtml(c.email)+'</td><td>'+c.quoteCount+'</td><td>'+c.orderCount+'</td><td>'+operationsMoney(c.totalPaid)+'</td><td>'+formatDate(c.createdAt)+'</td></tr>';}));}
async function renderOperationsDelivery(){var d=await operationsRequest("/api/admin/operations/delivery");document.getElementById("operationsViews").innerHTML='<div class="hero"><div><span class="eyebrow">DELIVERY</span><h2>Fulfilment and delivery</h2></div></div>'+operationsTable(["Order","Customer","Destination","Payment","Fulfilment","Delivery"],d.delivery.map(function(x){return '<tr><td>'+escapeHtml(x.orderReference)+'</td><td>'+escapeHtml(x.customerName)+'</td><td>'+escapeHtml(x.destination||"—")+'</td><td>'+statusBadge(x.paymentStatus)+'</td><td>'+statusBadge(x.fulfilmentStatus)+'</td><td>'+statusBadge(x.deliveryStatus)+'</td></tr>';}));}
async function renderOperationsProducts(){var d=await operationsRequest("/api/admin/operations/products"),el=document.getElementById("operationsViews");el.innerHTML='<div class="hero"><div><span class="eyebrow">PRODUCTS / CATALOGUE</span><h2>Manage the authoritative catalogue</h2><p class="muted small">Media remains controlled by the existing Media Center.</p></div></div><div class="toolbar"><button class="btn red" id="opsAddProduct">Add product</button><a class="btn light" href="admin.html">Open Media Center</a></div>'+operationsTable(["Catalogue #","Product","Category","Pricing","Availability","Media","Status"],d.products.map(function(p){return '<tr><td>'+escapeHtml(p.catalogueNumber||"—")+'</td><td><strong>'+escapeHtml(p.name)+'</strong></td><td>'+escapeHtml(p.category)+'</td><td>'+escapeHtml(p.priceMode)+(p.price!=null?" · "+operationsMoney(p.price,p.currency):"")+'</td><td>'+escapeHtml(p.availabilityStatus)+'</td><td>'+p.mediaCount+'</td><td>'+statusBadge(p.status)+'</td></tr>';}))+'<div id="opsProductForm"></div>';document.getElementById("opsAddProduct").onclick=function(){renderOperationsProductForm();};}
function renderOperationsProductForm(){document.getElementById("opsProductForm").innerHTML='<div class="panel"><h3>Add product</h3><div class="toolbar"><label>Name<input id="opn"></label><label>Category<input id="opc"></label><label>Pricing<select id="opm"><option value="quote">Quote Required</option><option value="fixed">Fixed price</option></select></label></div><div class="toolbar"><label>Price<input id="opp" type="number" min="0"></label><label>Availability<select id="opa"><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="preorder">Pre-order</option></select></label></div><label>Description<textarea id="opd"></textarea></label><label>Specifications JSON<textarea id="opspec">{}</textarea></label><button class="btn red" id="opsSaveProduct">Create Product</button></div>';document.getElementById("opsSaveProduct").onclick=async function(){try{await operationsRequest("/api/admin/operations/products",{method:"POST",body:JSON.stringify({name:document.getElementById("opn").value,category:document.getElementById("opc").value,priceMode:document.getElementById("opm").value,price:document.getElementById("opm").value==="fixed"?Number(document.getElementById("opp").value):null,availabilityStatus:document.getElementById("opa").value,description:document.getElementById("opd").value,specifications:JSON.parse(document.getElementById("opspec").value||"{}"),active:true,mediaIds:[]})});renderOperationsProducts();}catch(e){alert(e.message);}};}
window.addEventListener("load", async function () {
  var operationsPage = location.href.indexOf("ops.html") !== -1 || location.href.indexOf("operations.html") !== -1;
  document.getElementById("admin").innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="panel" style="max-width:520px;text-align:center"><span class="eyebrow">TWINS ADMIN</span><h1>Checking staff access…</h1><p class="muted">Connecting to the authenticated operations workspace.</p></div></main>';
  try {
    var session = await request("/api/account/me");
    var role = session && session.user && session.user.role;
    if (role === "admin" || role === "staff") {
      currentUser = Object.assign({}, session.user, {remote:true});
      localStorage.setItem("twins_user", JSON.stringify(currentUser));
      if (operationsPage) { operationsShell(session.user); return; }
      renderShell();
      return;
    }
  } catch (e) {}
  deny();
});
var intakeState = { batch:null, data:null, selectedAssets:new Set(), selectedGroups:new Set() };

function intakeApi(path, options) { return request(path, options); }

async function renderIntake() {
  var el=document.getElementById("view-intake");
  el.innerHTML=hero("OWNER PHOTO INTAKE","Organise photos into real products.","The system can suggest broad buckets and safe filename-based groups. It never decides product identity for you.")+
    '<div class="intaketoolbar">'+
      '<button class="btn red" id="intakeNew">New photo batch</button>'+
      '<label class="btn light intakefilebtn">Choose photos<input id="intakeFiles" type="file" accept="image/*" multiple></label>'+
      '<label class="btn light intakefolderbtn">Choose a photo folder<input id="intakeFolder" type="file" accept="image/*" webkitdirectory directory multiple></label>'+
      '<button class="btn light" id="intakeSuggest" disabled>Organise safely</button>'+
      '<button class="btn light" id="intakeComplete" disabled>Complete batch</button>'+
    '</div>'+
    '<div class="intakehint" id="intakeHint">Start a batch, then upload many owner photos. Filename/folder relationships are suggestions only.</div>'+
    '<div id="intakeSummary"></div>'+
    '<div class="intakegrid"><aside class="intakeside" id="intakeBuckets"></aside><main class="intakemain" id="intakeGroups"></main></div>'+
    '<div class="intakefooter" id="intakeActions"></div>';
  document.getElementById("intakeNew").onclick=createIntakeBatch;
  document.getElementById("intakeFiles").onchange=function(){handleIntakeFiles(this.files)};
  document.getElementById("intakeFolder").onchange=function(){handleIntakeFiles(this.files)};
  document.getElementById("intakeSuggest").onclick=suggestIntake;
  document.getElementById("intakeComplete").onclick=completeIntake;
  if(intakeState.batch) await refreshIntake();
}

async function createIntakeBatch(){
  var name=prompt("Batch name:","Twins owner photo intake");
  if(name===null)return;
  var fd=new FormData();fd.append("name",name.trim()||"Twins owner photo intake");
  try{
    var res=await fetch(apiBase()+"/api/admin/intake/batches",{method:"POST",body:fd,credentials:"include"});
    var data=await res.json();if(!res.ok)throw new Error(data.detail||"Could not create batch");
    intakeState.batch=data.batch;intakeState.data=null;intakeState.selectedAssets.clear();intakeState.selectedGroups.clear();
    await refreshIntake();
  }catch(e){alert(e.message)}
}

async function handleIntakeFiles(fileList){
  if(!intakeState.batch){alert("Create a photo batch first.");return}
  var files=Array.from(fileList||[]);if(!files.length)return;
  var fd=new FormData();
  files.forEach(function(file){fd.append("files",file,file.name)});
  fd.append("relative_paths",JSON.stringify(files.map(function(file){return file.webkitRelativePath||file.name})));
  var hint=document.getElementById("intakeHint");hint.textContent="Uploading "+files.length+" photo(s)…";
  try{
    var res=await fetch(apiBase()+"/api/admin/intake/batches/"+encodeURIComponent(intakeState.batch.id)+"/upload",{method:"POST",body:fd,credentials:"include"});
    var data=await res.json();if(!res.ok)throw new Error(data.detail||"Upload failed");
    hint.textContent=data.assets.length+" photo(s) added. Next, organise them safely.";
    await refreshIntake();
    document.getElementById("intakeSuggest").disabled=false;
  }catch(e){hint.textContent=e.message;alert(e.message)}
}

async function refreshIntake(){
  if(!intakeState.batch)return;
  try{
    var data=await intakeApi("/api/admin/intake/batches/"+encodeURIComponent(intakeState.batch.id));
    intakeState.data=data;intakeState.batch=data.batch;renderIntakeData();
    document.getElementById("intakeSuggest").disabled=!data.assets.length;
    document.getElementById("intakeComplete").disabled=!data.assets.length;
  }catch(e){document.getElementById("intakeHint").textContent=e.message}
}

function intakeAsset(id){
  return (intakeState.data.assets||[]).find(function(a){return a.id===id});
}
function intakeGroup(id){return (intakeState.data.groups||[]).find(function(g){return g.id===id});}
function intakeGroupAssetIds(groupId){
  return (intakeState.data.groupAssets||[]).filter(function(x){return x.groupId===groupId}).map(function(x){return x.assetId});
}
function intakeImage(id){
  return apiBase()+"/api/admin/intake/assets/"+encodeURIComponent(id)+"/file";
}

function renderIntakeData(){
  var d=intakeState.data;if(!d)return;
  var grouped=(d.groups||[]).filter(function(g){return g.status!=="MERGED"&&g.status!=="ARCHIVED"});
  var named=grouped.filter(function(g){return g.status==="NAMED"}).length;
  var unresolved=grouped.filter(function(g){return g.status==="UNRESOLVED"}).length;
  document.getElementById("intakeSummary").innerHTML=
    '<div class="intakekpis"><div><b>'+d.assets.length+'</b><span>Photos</span></div><div><b>'+d.buckets.length+'</b><span>Type buckets</span></div><div><b>'+grouped.length+'</b><span>Candidate groups</span></div><div><b>'+named+'</b><span>Named products</span></div><div><b>'+unresolved+'</b><span>Unresolved</span></div></div>';
  document.getElementById("intakeBuckets").innerHTML='<div class="intakesectiontitle">TYPE BUCKETS</div>'+
    (d.buckets.length?d.buckets.map(function(b){
      var groups=grouped.filter(function(g){return g.bucketId===b.id});
      var count=groups.reduce(function(n,g){return n+g.assetCount},0);
      return '<button class="intakebucket" data-bucket="'+b.id+'"><b>'+escapeHtml(b.name)+'</b><span>'+count+' photos · '+groups.length+' groups</span></button>';
    }).join(""):'<div class="empty">Upload photos, then click Organise safely.</div>')+
    '<div class="intakesectiontitle" style="margin-top:18px">UNRESOLVED</div><button class="intakebucket" id="showUnresolved"><b>Unresolved work</b><span>Photos not yet confidently grouped</span></button>';
  document.querySelectorAll(".intakebucket[data-bucket]").forEach(function(b){b.onclick=function(){renderBucket(b.dataset.bucket)}});
  var ur=document.getElementById("showUnresolved");if(ur)ur.onclick=function(){renderUnresolved()};
  if(!document.querySelector(".intakebucket[data-bucket].active"))renderAllIntakeGroups();
}

function renderAllIntakeGroups(){
  renderGroupPanel((intakeState.data.groups||[]).filter(function(g){return g.status!=="MERGED"&&g.status!=="ARCHIVED"}),"All suggested groups");
}
function renderBucket(bucketId){
  var bucket=(intakeState.data.buckets||[]).find(function(b){return b.id===bucketId});
  renderGroupPanel((intakeState.data.groups||[]).filter(function(g){return g.bucketId===bucketId&&g.status!=="MERGED"&&g.status!=="ARCHIVED"}),bucket?bucket.name:"Bucket");
}
function renderUnresolved(){
  renderGroupPanel((intakeState.data.groups||[]).filter(function(g){return g.status==="UNRESOLVED"}),"Unresolved groups");
}

function renderGroupPanel(groups,title){
  var d=intakeState.data;
  var html='<div class="intakepanelhead"><div><span class="eyebrow">CANDIDATE GROUPS</span><h3>'+escapeHtml(title)+'</h3><p class="muted small">Select a group to inspect its photos. Suggested groups are not product identities.</p></div>'+
    '<div class="intakepanelactions"><button class="btn light mini" id="selectAllVisible">Select visible groups</button><button class="btn light mini" id="mergeSelected" disabled>Merge selected</button></div></div>';
  html+='<div class="intakegroups">';
  if(!groups.length)html+='<div class="empty">Nothing here yet.</div>';
  groups.forEach(function(g){
    var ids=intakeGroupAssetIds(g.id);
    var selected=intakeState.selectedGroups.has(g.id);
    html+='<article class="intakegroup '+(selected?"selected":"")+'" data-group="'+g.id+'">'+
      '<label class="intakegroupcheck"><input type="checkbox" data-group-check="'+g.id+'" '+(selected?"checked":"")+'></label>'+
      '<div><div class="intakegrouphead"><div><span class="eyebrow">'+escapeHtml(g.status)+'</span><h4>'+escapeHtml(g.name)+'</h4><small>'+g.assetCount+' photo(s) · '+escapeHtml(g.basis)+'</small></div>'+
      '<div class="intakegroupbuttons"><button class="btn light mini" data-inspect="'+g.id+'">Inspect</button><button class="btn light mini" data-name="'+g.id+'">Name</button></div></div>'+
      '<div class="intakethumbs">'+ids.slice(0,8).map(function(id){return '<img src="'+intakeImage(id)+'" alt="" loading="lazy">'}).join("")+
      (ids.length>8?'<span class="morethumb">+'+(ids.length-8)+'</span>':"")+'</div></div></article>';
  });
  html+='</div>';
  document.getElementById("intakeGroups").innerHTML=html;
  document.getElementById("selectAllVisible").onclick=function(){groups.forEach(function(g){intakeState.selectedGroups.add(g.id)});renderGroupPanel(groups,title)};
  document.getElementById("mergeSelected").disabled=intakeState.selectedGroups.size<2;
  document.getElementById("mergeSelected").onclick=mergeSelectedGroups;
  document.querySelectorAll("[data-group-check]").forEach(function(input){input.onchange=function(){if(input.checked)intakeState.selectedGroups.add(input.dataset.groupCheck);else intakeState.selectedGroups.delete(input.dataset.groupCheck);renderGroupPanel(groups,title)}});
  document.querySelectorAll("[data-inspect]").forEach(function(b){b.onclick=function(){inspectGroup(b.dataset.inspect)}});
  document.querySelectorAll("[data-name]").forEach(function(b){b.onclick=function(){nameIntakeGroup(b.dataset.name)}});
  document.getElementById("intakeActions").innerHTML='<div class="intakeselection">Selected groups: <b>'+intakeState.selectedGroups.size+'</b></div><div><button class="btn light" id="clearGroupSelection">Clear selection</button></div>';
  document.getElementById("clearGroupSelection").onclick=function(){intakeState.selectedGroups.clear();renderGroupPanel(groups,title)};
}

function inspectGroup(groupId){
  var g=intakeGroup(groupId);if(!g)return;
  var ids=intakeGroupAssetIds(groupId);
  var selected=new Set(ids.filter(function(id){return intakeState.selectedAssets.has(id)}));
  document.getElementById("intakeGroups").innerHTML=
    '<div class="intakepanelhead"><div><span class="eyebrow">GROUP REVIEW</span><h3>'+escapeHtml(g.name)+'</h3><p class="muted small">'+ids.length+' photo(s). Grouping and naming remain separate decisions.</p></div><div class="intakepanelactions"><button class="btn light mini" id="backGroups">Back to groups</button><button class="btn light mini" id="selectAllPhotos">Select all</button><button class="btn red mini" id="newGroupFromSelection" disabled>Move selected to new group</button></div></div>'+
    '<div class="intakephotoactions"><button class="btn light mini" id="confirmGroup">Confirm grouping</button><button class="btn light mini" id="markUnresolved">Leave unresolved</button><button class="btn red mini" id="nameThisGroup">Name this product</button></div>'+
    '<div class="intakephotogrid">'+ids.map(function(id){var a=intakeAsset(id);var on=selected.has(id);return '<label class="intakephoto '+(on?"checked":"")+'"><input type="checkbox" data-asset-check="'+id+'" '+(on?"checked":"")+'><img src="'+intakeImage(id)+'" alt="'+escapeHtml(a?a.name:"")+'"><span>'+escapeHtml(a?a.name:"")+'</span></label>'}).join("")+'</div>';
  document.getElementById("backGroups").onclick=renderAllIntakeGroups;
  document.getElementById("selectAllPhotos").onclick=function(){ids.forEach(function(id){intakeState.selectedAssets.add(id)});inspectGroup(groupId)};
  document.querySelectorAll("[data-asset-check]").forEach(function(input){input.onchange=function(){if(input.checked)intakeState.selectedAssets.add(input.dataset.assetCheck);else intakeState.selectedAssets.delete(input.dataset.assetCheck);inspectGroup(groupId)}});
  document.getElementById("newGroupFromSelection").disabled=intakeState.selectedAssets.size===0;
  document.getElementById("newGroupFromSelection").onclick=function(){moveSelectedToNewGroup(groupId)};
  document.getElementById("confirmGroup").onclick=function(){updateGroupStatus(groupId,"CONFIRMED")};
  document.getElementById("markUnresolved").onclick=function(){updateGroupStatus(groupId,"UNRESOLVED")};
  document.getElementById("nameThisGroup").onclick=function(){nameIntakeGroup(groupId)};
  document.getElementById("intakeActions").innerHTML='<div class="intakeselection">Selected photos: <b>'+intakeState.selectedAssets.size+'</b></div><div><button class="btn light" id="clearPhotoSelection">Clear photo selection</button></div>';
  document.getElementById("clearPhotoSelection").onclick=function(){ids.forEach(function(id){intakeState.selectedAssets.delete(id)});inspectGroup(groupId)};
}

async function updateGroupStatus(id,status){
  try{await intakeApi("/api/admin/intake/groups/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:status})});await refreshIntake();inspectGroup(id)}catch(e){alert(e.message)}
}
async function moveSelectedToNewGroup(sourceGroupId){
  var ids=Array.from(intakeState.selectedAssets).filter(function(id){return intakeGroupAssetIds(sourceGroupId).indexOf(id)>-1});
  if(!ids.length)return;
  try{await intakeApi("/api/admin/intake/groups/"+encodeURIComponent(sourceGroupId)+"/move",{method:"POST",body:JSON.stringify({assetIds:ids})});ids.forEach(function(id){intakeState.selectedAssets.delete(id)});await refreshIntake();renderAllIntakeGroups()}catch(e){alert(e.message)}
}
async function mergeSelectedGroups(){
  var ids=Array.from(intakeState.selectedGroups);if(ids.length<2)return;
  try{await intakeApi("/api/admin/intake/groups/merge",{method:"POST",body:JSON.stringify({groupIds:ids})});intakeState.selectedGroups.clear();await refreshIntake();renderAllIntakeGroups()}catch(e){alert(e.message)}
}
async function nameIntakeGroup(groupId){
  var g=intakeGroup(groupId);if(!g)return;
  var name=prompt("Product name for this entire group:",g.status==="NAMED"?g.name:"");
  if(name===null)return;
  if(!name.trim())return alert("Product name is required.");
  var type=prompt("Product type/category (for example: Mixer):", "");
  try{
    var data=await intakeApi("/api/admin/intake/groups/"+encodeURIComponent(groupId)+"/name",{method:"POST",body:JSON.stringify({name:name.trim(),productType:type&&type.trim()||null,category:type&&type.trim()||null})});
    var approve=confirm("Created Product "+data.product.catalogueNumber+" — "+data.product.name+" with "+data.product.assetCount+" photo(s).\\n\\nApprove this product now?");
    if(approve){
      await intakeApi("/api/admin/intake/products/"+encodeURIComponent(data.product.id)+"/status",{method:"PATCH",body:JSON.stringify({status:"APPROVED"})});
      var publish=confirm("Product approved. Publish it now?");
      if(publish) await intakeApi("/api/admin/intake/products/"+encodeURIComponent(data.product.id)+"/status",{method:"PATCH",body:JSON.stringify({status:"PUBLISHED"})});
    }
    intakeState.selectedGroups.delete(groupId);await refreshIntake();renderAllIntakeGroups();
  }catch(e){alert(e.message)}
}
async function suggestIntake(){
  if(!intakeState.batch)return;
  try{var data=await intakeApi("/api/admin/intake/batches/"+encodeURIComponent(intakeState.batch.id)+"/suggest",{method:"POST",body:"{}"});document.getElementById("intakeHint").textContent="Created/updated "+data.createdGroups+" safe filename-based group suggestion(s). No product identity was assigned.";await refreshIntake()}catch(e){alert(e.message)}
}
async function completeIntake(){
  if(!intakeState.batch)return;
  if(!confirm("Complete this intake batch? Unresolved groups will remain unresolved and can still be reviewed later."))return;
  try{await intakeApi("/api/admin/intake/batches/"+encodeURIComponent(intakeState.batch.id)+"/complete",{method:"POST",body:"{}"});await refreshIntake()}catch(e){alert(e.message)}
}

})();
