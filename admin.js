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
  return window.SITE_CONFIG && SITE_CONFIG.apiBase ? SITE_CONFIG.apiBase : "http://localhost:8000";
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
    ["overview","Overview"], ["catalogue","Catalogue"], ["inventory","Inventory"],
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
    overview:"Operations Overview", catalogue:"Catalogue Management", inventory:"Inventory",
    quotes:"Quotation Requests", orders:"Orders", customers:"Customers & Staff",
    payments:"Payments", delivery:"Delivery", marketplace:"Marketplace Moderation",
    audit:"Audit Log", settings:"Admin Settings"
  };
  document.getElementById("adminTitle").textContent = titles[name] || "Admin";

  if (window.innerWidth < 760) document.getElementById("adminSide").classList.remove("open");

  if (name === "overview") renderOverview();
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
        escapeHtml(q.business || "—") + '</td><td>' + statusBadge(q.status) + '</td><td>' +
        escapeHtml(q.itemCount || 0) + '</td><td>' + formatDate(q.createdAt) +
        '</td><td><button class="btn light quote-view" data-reference="' + escapeHtml(q.reference) + '">View</button></td></tr>';
    }).join("") + "</tbody></table></div>";
}

function bindQuoteButtons() {
  document.querySelectorAll(".quote-view").forEach(function (button) {
    button.onclick = function () { openQuote(button.dataset.reference); };
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

window.addEventListener("load", function () {
  if (isAdmin()) renderShell();
  else deny();
});
})();