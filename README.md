# Twins Kitchen

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
- Customer login/signup demo
- Customer dashboard
- FAQ and delivery information
- Contact, directions and business information
- Responsive mobile layouts
- Expanded visual media gallery with supplied Twins equipment photography and video records
- GitHub Pages-ready static architecture
- External reference imagery is clearly labelled separately from supplied Twins media
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
- admin.html provides a non-public front-end operations workspace shell
- Production admin authorization is intentionally not faked in the browser
- backend/ contains the API, security, schema and migration contract

### Backend boundary
See backend/README.md, backend/openapi.yaml and backend/schema.sql. The backend is deliberately not claimed as deployed yet; it is the implementation contract for the next stage.


## Twins Marketplace

The repository now includes a separate community marketplace layer: `marketplace.html`, `sell-on-twins.html` and `seller-dashboard.html`. Community seller submissions are deliberately separated from official Twins stock. The current static prototype stores drafts locally; production publishing requires authenticated seller accounts, server-side media storage, moderation, reports and payment webhooks.

## Payments

The intended production flow is quote-first for variable Twins equipment pricing. Once confirmed prices/inventory exist, customer checkout can use a Nigerian/African payment gateway such as Paystack or Flutterwave. Seller memberships and promoted listings can use the same gateway, with payment confirmation handled by server-side webhooks rather than trusting browser state.


## Local bulk asset intake

The media workflow now has a **free, local-first asset-intake path** that does not use Tavily, Brave, or any external search API.

### 1. Generate the current pending-product manifest

This is calculated from the canonical catalogue and existing media mappings at runtime; it does not hardcode the current pending count.

```powershell
node tools/media-ingestion/index.js asset-intake-manifest
```

Default output:

```text
tools/media-ingestion/manifests/pending-asset-intake.json
```

The manifest contains the product ID, name, category/type, brand/model/capacity/specification, current media status, and a deterministic suggested asset path.

### 2. Supply local assets

Create a directory such as:

```text
supplier-assets/
  supplier-a/
    planetary-mixer-20l.jpg
    commercial-dishwasher.png
  supplier-b/
    freezer-large.webp
```

Supported image types are `.jpg`, `.jpeg`, `.png`, and `.webp`.

The intake walker is recursive. Unsupported files are recorded as rejected rather than silently accepted. Obvious placeholders, logos, icons, banners and tracking assets are ignored/rejected by the intake rules.

### 3. Optional explicit asset manifest

For authoritative product associations, create a JSON file:

```json
{
  "schemaVersion": 1,
  "assets": [
    {
      "productId": 58,
      "asset": "supplier-a/planetary-mixer-20l.jpg",
      "source": "Supplier A",
      "sourceUrl": "https://supplier.example/products/planetary-mixer-20l",
      "rights": "supplier-authorized"
    }
  ]
}
```

`productId` takes precedence over fuzzy matching. Unknown or non-authorizing provenance cannot become `VERIFIED`.

An example schema is available at `tools/media-ingestion/manifests/asset-intake.example.json`.

### 4. Run a local dry-run

```powershell
node tools/media-ingestion/index.js asset-intake-dry-run --assets supplier-assets --asset-manifest supplier-assets.json
```

Default report:

```text
tools/media-ingestion/manifests/asset-intake-report.json
```

You can choose another report path with `--report`.

Dry-run never modifies `data.js`, `app.js`, existing verified mappings, or production media mappings.

### 5. Result states

- **VERIFIED** — strong product association, valid image, duplicate checks passed, and provenance/rights are sufficient.
- **REVIEW** — potentially usable, but a human must confirm the association or provenance.
- **REJECTED** — invalid image, duplicate, already-mapped product, unsupported input, or another hard safety failure.
- **UNRESOLVED** — local evidence is insufficient to identify a product confidently.

The workflow does not guess when evidence is ambiguous.

### 6. Apply verified results

Apply is a separate explicit step:

```powershell
node tools/media-ingestion/index.js asset-intake-apply --report tools/media-ingestion/manifests/asset-intake-report.json
```

Apply writes the verified intake ledger to `tools/media-ingestion/manifests/applied-asset-intake.json`.

This ledger is intentionally separate from the protected `data.js` mappings. It preserves an auditable record of the local asset, product ID, SHA-256 content hash, source, source URL, rights declaration, import time and verification reason. Existing verified mappings and legacy duplicate assignments are not rewritten.

### 7. Duplicate protection

The intake checks duplicate content within the current intake, duplicate content against existing local `assets/media/` mappings, products that already have valid media mappings, invalid/unsupported image content, and obvious placeholder/logo/icon/banner/tracking assets.

Existing legacy duplicates remain preserved exactly as they are.

### 8. Bulk processing

The intake is designed for local filesystem processing rather than one network search request per product. It recursively walks the supplied asset directory and processes all supported assets in one run, so the same workflow can handle 10, 100, 500 or 1,000+ assets without a search API dependency.

### 9. Supplier catalogues and PDF files

PDF/catalogue ingestion is deliberately not part of the first implementation. The local asset-intake boundary is designed so a future catalogue/PDF extractor can emit the same normalized asset-manifest records without introducing a large PDF framework into the core intake path.

### 10. External discovery remains optional

The existing `tools/media-ingestion/discovery/` architecture is preserved. Its provider abstraction, matching, scoring, extraction and deduplication code remain available as an optional future fallback.

The local asset-intake commands never invoke Tavily or Brave and do not consume external search API credits.
