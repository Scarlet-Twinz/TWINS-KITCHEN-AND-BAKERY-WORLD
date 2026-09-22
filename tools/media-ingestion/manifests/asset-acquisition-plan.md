# Stage 3A — Bulk Asset Acquisition Plan

## Current state

- Canonical products: **530**
- Assigned: **272**
- Pending: **258**
- Stage 2 source report: `tools/media-ingestion/manifests/asset-source-coverage.json`
- Rights status for all planned sources: **REQUIRES_PERMISSION**

This is an acquisition-preparation document only. No images are downloaded, scraped, imported, mapped, or applied by this plan.

## 1. Wave 1 sources

### SINMAG — 23 potential pending products
Official manufacturer. Relevant families: planetary mixers, spiral mixers, dough sheeters, divider-rounders, moulders, proofers, rack/deck ovens, slicers, bakery work tables and related bakery equipment.

Product IDs: 39, 51, 53, 54, 58, 62, 63, 301, 302, 303, 306, 307, 308, 310, 312, 313, 314, 315, 316, 317, 318, 319, 320

Contact: Official contact/inquiry form; export@sinmag.com.cn. Official contact: https://www.sinmag.com/en/contact.html

### Fagor Professional — 73 potential pending products
Official manufacturer. Relevant families: commercial cooking, ovens, dishwashing, refrigeration/cold storage, sinks/preparation, shelving/workstations, serving/holding and ventilation.

Product IDs: 1, 23, 56, 65, 70, 281, 282, 283, 285, 286, 288, 289, 291, 293, 294, 297, 299, 13, 76, 77, 79, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 355, 356, 357, 358, 359, 360, 33, 85, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 332, 333, 334, 335, 336, 337, 338, 14, 36, 441, 442, 450, 451, 452, 453, 454, 455, 456, 459, 460, 16

Contact: Official contact form; contact@fagorprofessional.com. Official contact: https://www.fagorprofessional.com/en/contact

### METRO — 41 potential pending products
Official manufacturer. Relevant families: shelving/racks, wall shelving, storage cabinets, carts/trolleys, prep tables, holding/transport cabinets, food carriers and catering storage.

Product IDs: 12, 86, 88, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 321, 326, 328, 329, 333, 335, 336, 337, 340, 455, 456, 20, 462, 464, 465, 466, 468, 480

Contact: Official contact page; cssupport@metro.com; Middle East/Africa/India contact listed on official page. Official contact: https://metro.com/contact-us/

### Carl-Dave Global Ventures — 20 potential pending products
Nigeria commercial-equipment supplier. Relevant families: industrial bakery equipment, commercial cooking, refrigeration, shelving, catering, water-treatment/filling/packaging and food-preparation equipment.

Product IDs: 16, 33, 58, 65, 70, 76, 77, 79, 303, 307, 310, 419, 502, 508, 511, 512, 519, 520, 521, 522

Contact: Official contact form; sales@carldaveglobal.com; +234-8035718127. Official contact: https://www.carldaveglobal.com/contact-us/

Known specification/model clues: ID 519 = 4-nozzle 5–3000 ml; ID 520 = 12-head 1000–2000 bottles/hour; ID 521 = S-AS1000. These are catalogue clues, not confirmed manufacturer model matches.

## 2. Wave 2 sources

- **Alababoy Enterprise — 17 potential products:** IDs 39, 58, 303, 306, 307, 319, 14, 36, 441, 442, 450, 451, 452, 453, 454, 16, 419. Relevant to bakery, serving/warming, ventilation and food preparation. Contact: Official contact page; WhatsApp/call +234 809 791 8381; email/contact form.
- **Hobart — 13 potential products:** IDs 26, 33, 401, 402, 403, 404, 405, 406, 410, 413, 414, 418, 419. Relevant to food preparation and kitchen/dishwashing families. Contact through the official sales/support route.
- **Pentair Everpure — 5 potential products:** IDs 502, 508, 511, 512, 518. Relevant to commercial water filtration/RO. Exact Everpure model matching is required.

## 3. Specialized sources

- **Hoshizaki — 3:** IDs 79, 352, 400 — ice/ice-storage families.
- **BUNN — 7:** IDs 386, 388, 390, 391, 392, 393, 400 — coffee, hot-water and beverage dispensing families.
- **VIQUA — 1:** ID 517 — UV water-treatment family; exact model is not established.
- **DStv Nigeria — 2:** IDs 115, 484 — decoder/package products only; generic satellite hardware is not established by Stage 2 evidence.
- **GOtv Nigeria — 2:** IDs 481, 482 — decoder/package products only.

## 4. Products requested from each source

The machine-readable JSON contains the full product-by-product list, including the Twins catalogue name, category, current specification text and source product-family request. No exact manufacturer model is claimed where the catalogue does not establish one.

## 5. Contact/request method

Use the official manufacturer/supplier contact route only. Do not claim that Twins Kitchen is an authorized distributor. Ask for a **bulk media pack** and written permission for commercial website use.

## 6. Rights requirements

Every source remains **REQUIRES_PERMISSION**. A publicly visible image, catalogue PDF, or product page is not treated as permission to reuse its images. The supplier/manufacturer should explicitly confirm that Twins may use the supplied media commercially, or provide the applicable dealer/reseller media licence terms.

## 7. Expected asset package format

Preferred:
- ZIP/folder of original JPG/PNG/WebP product photographs
- CSV/XLSX/PDF model index or filename-to-model mapping
- model/product identifiers
- source URL/catalogue reference
- written media-use authorization
- required attribution/credit line, if any

## 8. What to do when a supplier sends a ZIP

Preserve the original ZIP. Do not apply it directly. Extract it into an isolated local acquisition directory, retain every index/readme/provenance file, confirm rights and reconcile filenames/models to the requested product IDs. Then feed the resulting local assets into the **existing** asset-intake dry-run.

## 9. What to do when a supplier sends a PDF

Preserve the original PDF as provenance/model evidence. Do not assume the embedded images are reusable. Prefer requesting the original image files. If the supplier explicitly authorizes use of PDF images, retain that authorization with the source package before any extraction is considered.

## 10. What to do when a supplier sends individual images

Preserve original filenames and the accompanying source/model information. Record the supplier, source URL, rights confirmation and model/product ID. Do not rename away useful model identifiers until provenance is captured.

## 11. How assets enter the existing asset-intake pipeline

**Authorized source package → provenance/rights record → exact product/model reconciliation → local supplier-assets intake directory → existing asset-intake manifest → existing dry-run → review result states → explicit authorized application.**

No changes to `data.js`, `app.js`, `validator.js`, `asset-intake.js`, discovery code, or existing mappings are part of Stage 3A.

## Ready-to-send request messages

The JSON file contains a complete ready-to-send request message for every source. The message asks for bulk media, model identifiers, catalogue/product references and written commercial website-use permission without asserting an unverified distributor relationship.
