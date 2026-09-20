# Twins Kitchen & Bakery World — Backend

The storefront is still deployable as a static site, but its customer authentication and quotation workflow now have a real FastAPI/PostgreSQL integration path. When the API is unreachable, the storefront falls back to its existing browser-local planning mode.

## Local setup

1. Create a PostgreSQL database and run `schema.sql`.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL`, a long random `SESSION_SECRET`, and the exact Live Server origin in `FRONTEND_ORIGINS`.
4. Install `requirements.txt`.
5. Run `uvicorn main:app --reload --port 8000` from `backend/`.
6. Open the storefront through Live Server.
7. Keep `SITE_CONFIG.apiBase` pointed at the deployed API when moving beyond localhost.

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

## Production hardening still required

- HTTPS and Secure cookies.
- Email verification and password recovery.
- CSRF protection for cookie-authenticated state-changing requests.
- Rate limiting and abuse controls.
- Approved password-hashing policy and secret rotation.
- Catalogue/media synchronization and product APIs.
- Admin authorization, product mutations and audit logs.
- Resend notifications.
- Inventory, orders, payments and delivery records.

The API uses parameterized Psycopg queries rather than concatenating user input into SQL.


## Current backend boundary

Implemented in the current API:
- customer signup/login/logout with signed HTTP-only sessions
- account lookup
- quote persistence with quote items and project/package context
- authenticated customer quote history
- staff/admin quote read endpoint
- configurable secure cookies for HTTPS deployment
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
