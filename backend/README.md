# Twins Kitchen & Bakery World — Backend

The storefront is still deployable as a static site, but its customer authentication and quotation workflow now have a real FastAPI/PostgreSQL integration path. When the API is unreachable, the storefront may use browser-local planning data for non-account features. Browser demo authentication is restricted to localhost and is not a production account mechanism.

## Local setup

1. Create a PostgreSQL database and run `schema.sql`.
2. Copy `.env.example` to `.env`.
3. Set DATABASE_URL, a random SESSION_SECRET of at least 32 characters, and the exact Live Server origin in FRONTEND_ORIGINS.
4. Install `requirements.txt`.
5. Run `uvicorn main:app --reload --port 8000` from `backend/`.
6. Open the storefront through Live Server.
7. For deployment, define window.TWINS_API_BASE before data.js loads, or set the production API base through the deployment HTML configuration. The storefront intentionally does not default to localhost outside local development.

## Connected API

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/account/me`
- `GET /api/catalogue`
- `POST /api/quotes`
- `GET /api/quotes/me`

## Database boundary

PostgreSQL is the source of truth for production accounts and RFQs. The browser should not become the authoritative store for passwords, quotes, inventory or orders.

## Operations backend now implemented

Customer accounts can also retrieve their server-side order history from the dashboard after staff converts a quotation into an order.


The production operations boundary now includes server-authoritative:
- inventory records and inventory adjustments
- order creation from an approved quotation
- order lifecycle status updates
- delivery records and delivery status updates
- operational audit events for those mutations
- admin UI connections for inventory, orders, delivery and audit log
- server-session verification before the admin workspace renders

Payments remain intentionally separate: the payment transaction schema exists, but gateway credentials, webhook verification and reconciliation are not activated until the merchant gateway is configured.

## Production hardening

The API now includes the first production-security layer:

- signed HTTP-only session cookies using the __Host- prefix
- 8-hour absolute session expiry
- production startup checks requiring a 32+ character SESSION_SECRET and COOKIE_SECURE=true
- explicit CORS origins with credential support
- Origin validation for state-changing requests
- login/signup rate limiting with Retry-After
- security response headers including HSTS when secure cookies are enabled
- no-store caching on authentication, account and admin responses
- logout cookie clearing with Clear-Site-Data
- optional Trusted Host enforcement through TRUSTED_HOSTS

Still required before the whole service can be called production-complete:

- deploy PostgreSQL and FastAPI over HTTPS
- configure the real production frontend origin and API URL
- email verification and password recovery
- external/distributed rate limiting for multi-instance deployments
- password reset/recovery delivery through the approved mail provider
- catalogue/media synchronization and server-side product mutations
- payment gateway credentials, signed webhooks and reconciliation
- final operational testing against the deployed database

The API uses parameterized Psycopg queries rather than concatenating user input into SQL.


## Current backend boundary

Implemented in the current API:
- customer signup/login/logout with opaque random HTTP-only server-side sessions
- account lookup
- quote persistence with quote items and project/package context
- authenticated customer quote history
- staff/admin quote read endpoint
- configurable secure cookies for HTTPS deployment with production startup enforcement
- server-side session revocation on logout and database-backed session expiry
- production request hardening: CORS/Origin checks, rate limiting, security headers and no-store responses
- schema upgrade statements for the account name and quote package fields

Still required before treating the API as production-ready:
- deploy PostgreSQL and the FastAPI service
- set a strong production SESSION_SECRET and COOKIE_SECURE=true behind HTTPS
- add CSRF protection, rate limiting and abuse controls
- add email verification and password recovery
- connect Resend for actual enquiry notifications and delivery status
- seed/synchronize the catalogue and supplied media into PostgreSQL
- add server-side catalogue mutations, inventory, orders, payments and delivery records
- add admin quote status mutation and audit-log UI


## First staff/admin account

After PostgreSQL is configured, create an admin without putting the password in source control:

`python create_admin.py "Twins Admin" admin@example.com "use-a-real-password"`

Run this from the `backend/` directory with `DATABASE_URL` set. The script creates the account if it does not exist or promotes an existing account to the `admin` role.
