# Twins Kitchen

A commerce-focused storefront and operations platform for **Twins Kitchen**, a Nigerian supplier of professional kitchen, bakery, catering, restaurant, and hospitality equipment.

## Purpose

Twins Kitchen is designed to give customers a clear way to discover equipment, compare products, save selections, request quotations, and contact the business.

The project combines a customer-facing storefront with a separate operations interface and a planned backend boundary. The frontend is data-driven so catalogue information, product relationships, media, and customer interactions can evolve without duplicating product data across individual pages.

## What the platform provides

- Responsive equipment storefront
- Searchable catalogue with **530 canonical products**
- Category and business-type equipment discovery
- Product detail pages with specifications and related equipment
- Product comparison
- Saved products and recently viewed products
- Persistent shopping cart and saved equipment lists
- Project planning and saved project context
- Quote-request workflow
- WhatsApp enquiry flow
- Customer account and dashboard interfaces
- FAQ, delivery, contact, directions, and business information
- Product photography and video records supplied for the Twins catalogue
- Separate community marketplace interfaces for seller listings
- Responsive layouts for desktop and mobile
- GitHub Pages-ready static storefront architecture

## Storefront architecture

The current storefront intentionally uses **HTML, CSS, and vanilla JavaScript**.

Catalogue records are maintained in `data.js`, while shared application logic handles rendering, search, filtering, comparison, cart state, saved products, project planning, and other interactions.

The project also includes:

- Shared responsive styling in `styles.css`
- Shared application logic in `app.js`
- Supplied Twins media under `assets/media/`
- Runtime metadata and canonical URLs
- LocalBusiness structured data
- `robots.txt` and `sitemap.xml`
- Static-site validation through GitHub Actions
- Quote-first product pricing instead of hardcoded market prices

## Customer experience

The storefront is built around a discovery-to-enquiry workflow rather than assuming fixed online prices for every product.

Customers can browse equipment, inspect product information, compare options, save products, build a cart or equipment list, and submit a quotation request or WhatsApp enquiry.

Customer authentication and account features support both the static development experience and the planned server-backed production model.

## Operations and administration

The repository contains a dedicated admin workspace separate from the public storefront.

The admin interface covers catalogue operations, inventory, quotations, orders, customers and staff, payments, delivery, marketplace moderation, audit information, and settings.

Server-side authorization remains the source of truth for privileged operations. Browser storage is not treated as the authority for catalogue, inventory, order, payment, delivery, or audit records.

## Backend boundary

The repository includes the planned backend contract under `backend/`, including documentation and database schema definitions.

The backend is intentionally treated as a separate boundary from the static storefront. It is not presented as a deployed production backend.

The production architecture is intended to support capabilities such as:

- Authenticated customer and staff accounts
- Database-backed catalogue and inventory
- Real stock availability
- Server-side quotation records
- Orders and fulfilment
- Payment processing and webhooks
- Delivery management
- Staff access control
- Marketplace moderation
- Persistent audit records

## Media and catalogue data

The catalogue contains **530 canonical products**. Product information is data-driven, and supplied Twins media is kept distinct from external reference imagery.

Media is expected to represent the actual product it is assigned to. When a suitable supplied photograph is not available, the product can remain marked as pending rather than being given an unrelated or generic image.

Pricing is intentionally quote-first because equipment prices and supplier availability can change.

## Twins Marketplace

The project includes a separate marketplace layer through:

- `marketplace.html`
- `sell-on-twins.html`
- `seller-dashboard.html`

Community seller listings are kept separate from official Twins catalogue stock.

The current frontend supports the marketplace experience as a static prototype. Production seller publishing will require authenticated seller accounts, server-side media storage, moderation, reporting, payment handling, and backend persistence.

## Payments

The intended commercial flow is quote-first for variable equipment pricing.

When confirmed catalogue prices and inventory are available, customer checkout can be connected to a Nigerian/African payment provider such as Paystack or Flutterwave. Payment confirmation should be handled through server-side webhooks rather than trusted browser state.

## Business

**Twins Kitchen**  
Alaba International Market, Nigeria  
**08033231712**  
Open 24 hours
