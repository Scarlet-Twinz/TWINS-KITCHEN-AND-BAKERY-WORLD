# Twins Kitchen & Bakery World

A commerce-style static storefront for **Twins Kitchen & Bakery World**, designed around professional kitchen, bakery, catering, restaurant and hospitality equipment.

## What is in this version

- Large responsive storefront homepage
- Searchable equipment catalogue
- 40 structured catalogue products
- Category discovery
- Business-type equipment planner
- Project planning brief with saved project context
- Product detail pages with related equipment and structured specifications
- Recently viewed products
- Saved / wishlist products
- Product comparison
- Persistent cart with quantity controls and reusable saved equipment lists
- Quotation request flow
- WhatsApp enquiry flow
- Customer login/signup demo
- Customer dashboard
- FAQ and delivery information
- Contact, directions and business information
- Responsive mobile layouts
- Expanded visual media gallery with supplied Twins equipment photography and video records
- GitHub Pages-ready static architecture
- Remaining generic photography is clearly treated as temporary visual context until replaced with more Twins-owned media
- Red / white / black visual system ready for the final Twins logo

## Run locally in VS Code

### 1. Clone the repository

Open PowerShell or the VS Code terminal and run:

```powershell
cd Desktop
git clone https://github.com/Scarlet-Twinz/TWINS-KITCHEN-AND-BAKERY-WORLD.git
cd TWINS-KITCHEN-AND-BAKERY-WORLD
code .
```

If your Projects folder is elsewhere, replace `Desktop` with that location.

### 2. Open the site

In VS Code, install **Live Server** if you do not already have it.

Then:

1. Open `index.html`.
2. Right-click inside the file.
3. Choose **Open with Live Server**.
4. The storefront will open in your browser.
5. Click through the catalogue, product pages, saved products, comparison, cart, planner and dashboard.

You can also open the repository normally in VS Code without Live Server and edit the files directly.

## Important architecture decision

This phase is intentionally **HTML + CSS + vanilla JavaScript**.

GitHub can store the source code and GitHub Pages can publish this static HTML/CSS/JavaScript site. A server backend is **not required** for the storefront, catalogue discovery, browser cart, saved products or demo customer workspace.

A real backend can be added later when Twins needs things such as:

- real customer accounts
- database-backed inventory
- real stock availability
- admin catalogue management
- real orders
- payment processing
- delivery management
- staff access
- server-side quotation records

The storefront does not need to be thrown away when that happens. The current UI can become the frontend for that backend.

## Current demo data

Product names and specifications are structured demonstration data until Twins confirms the exact commercial catalogue. Pricing is intentionally quote-first because market and supplier prices can change. The frontend is data-driven: catalogue records live in `data.js`, while rendering, filtering, comparison, cart and planning logic consume that data rather than duplicating product information across pages. Before a production launch, replace them with Twins' actual inventory, actual prices, real specifications, real availability, final business policies and the real logo.

Business:

**Twins Kitchen & Bakery World**  
Alaba International Market, Nigeria  
**08033231712**  
Open 24 hours
