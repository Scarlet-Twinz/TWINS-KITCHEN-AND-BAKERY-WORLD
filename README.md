#  Twins Kitchen

A commerce-style static storefront for **Twins Kitchen**, designed around professional kitchen, bakery, catering, restaurant and hospitality equipment.

## What is in this version

- Large responsive storefront homepage
- Searchable equipment catalogue
- 1,030 structured catalogue references (530 base records + 500 Phase 6 generated references)
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
- Customer login/signup with real backend sessions when the API is configured; localhost-only demo auth for static development
- Customer dashboard
- FAQ and delivery information
- Contact, directions and business information
- Responsive mobile layouts
- Expanded visual media gallery with supplied Twins equipment photography and video records
- GitHub Pages-ready static architecture
- External reference imagery is clearly labelled separately from supplied Twins media
- Red / white / black visual system ready for the final Twins logo

## Local development

This repository is proprietary. Development access and setup instructions are intentionally kept out of the public README.

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

Product names and specifications are structured catalogue/reference data until Twins confirms the exact commercial catalogue. The storefront deliberately distinguishes verified/supplied media from items marked `PHOTO PENDING`. Pricing is intentionally quote-first because market and supplier prices can change. The frontend is data-driven: catalogue records live in `data.js`, while rendering, filtering, comparison, cart and planning logic consume that data rather than duplicating product information across pages. Before a production launch, replace them with Twins' actual inventory, actual prices, real specifications, real availability, final business policies and the real logo.

Business:

**Twins Kitchen**  
Alaba International Market, Nigeria  
**08033231712**  
Open 24 hours


## Architecture status

The project now separates the static storefront from the planned production backend boundary.

### Storefront
- Data-driven catalogue in data.js
- Shared rendering and interaction layer in app.js
- Global responsive styling in styles.css
- Real supplied Twins media under assets/media/
- Quote-first catalogue pricing: current price is requested rather than hardcoded
- Local browser workspace for cart, saved lists, project plans and quote drafts
- Responsive navigation with equipment-area and business discovery menus
- Runtime metadata, canonical URLs and LocalBusiness structured data
- robots.txt, sitemap.xml and a static-site GitHub Actions validation workflow

### Operations / admin
- admin.html is the dedicated internal operations console entry point
- admin.css contains the admin-only visual system and responsive layout
- admin.js provides the complete admin navigation and workspace surfaces
- Admin access is denied unless the browser has a server-authenticated staff/admin session
- Current admin modules: Overview, Catalogue, Inventory, Quotes, Orders, Customers & Staff, Payments, Delivery, Marketplace Moderation, Audit Log and Settings
- Catalogue and quotation views can consume the existing data/API without modifying storefront data.js
- Inventory, Orders, Delivery and Audit Log are connected to the backend persistence layer; Payments remain gateway-ready until merchant credentials and webhooks are configured
- Payments intentionally stop at a gateway-ready operations surface; merchant credentials and webhooks are not hardcoded into the frontend
- Production admin authorization remains server-side in backend/

### Backend boundary
See backend/README.md, backend/openapi.yaml and backend/schema.sql. The backend is deliberately not claimed as deployed yet; it is the implementation contract for the next stage.


## Twins Marketplace

The repository now includes a separate community marketplace layer: `marketplace.html`, `sell-on-twins.html` and `seller-dashboard.html`. Community seller submissions are deliberately separated from official Twins stock. The current static prototype stores drafts locally; production publishing requires authenticated seller accounts, server-side media storage, moderation, reports and payment webhooks.

## Payments

The intended production flow is quote-first for variable Twins equipment pricing. Once confirmed prices/inventory exist, customer checkout can use a Nigerian/African payment gateway such as Paystack or Flutterwave. Seller memberships and promoted listings can use the same gateway, with payment confirmation handled by server-side webhooks rather than trusting browser state.


## Admin implementation status

The admin frontend is now mapped as a complete operations workspace. The interface is intentionally separated from the public storefront so administrative navigation, tables, detail drawers, status indicators and responsive behaviour do not depend on storefront rendering.

### Available admin areas

1. **Overview** — catalogue/area KPIs, recent server quote requests and operational shortcuts.
2. **Catalogue** — searchable/filterable product management surface using the current data-driven catalogue without mutating data.js.
3. **Inventory** — stock, availability and adjustment workspace reserved for server inventory records.
4. **Quotes** — server-persisted quotation requests with customer/project detail inspection.
5. **Orders** — order lifecycle and fulfilment workspace backed by the backend order service.
6. **Customers & Staff** — account and role boundary documentation inside the admin console.
7. **Payments** — gateway-ready transaction workspace; Paystack/Flutterwave credentials and webhooks are intentionally deferred.
8. **Delivery** — dispatch, destination, status and completion workspace backed by backend delivery records.
9. **Marketplace** — community-listing moderation surface kept separate from official Twins catalogue stock.
10. **Audit Log** — operational/security event surface backed by server-written audit records.
11. **Settings** — API, payment and production-readiness configuration surface.

### Backend integration boundary

The frontend admin workspace is complete as an operations UI, but server-side mutations remain the source of truth. Do not implement catalogue, inventory, order, payment or delivery authority in browser localStorage. Those modules should connect to authenticated FastAPI endpoints and PostgreSQL tables when the production backend work begins.
