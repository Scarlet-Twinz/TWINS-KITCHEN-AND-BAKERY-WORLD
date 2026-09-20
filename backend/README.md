# Twins Kitchen & Bakery World — Backend Architecture

The storefront is intentionally static today. This directory defines the production boundary for the next implementation without pretending browser localStorage is a real backend.

## Responsibilities
- Authentication and session management
- Users, roles and admin authorization
- Product/category catalogue API
- Media metadata and asset references
- Quote/RFQ persistence and status workflow
- Saved equipment lists and project briefs
- Inventory/availability data when the business is ready to maintain it
- Orders, payments and delivery records when those workflows are introduced
- Audit logs for administrative changes

## Suggested stack
- API: Node.js + TypeScript (Fastify or NestJS) or Python + FastAPI
- Database: PostgreSQL
- Object storage: S3-compatible storage for product/media files
- Cache/queues: Redis when operational volume requires it
- Email: Resend
- Messaging: WhatsApp link/deep-link from the storefront

## Deployment boundary
The frontend can remain a static deployment. The API should live behind HTTPS on a separate origin such as api.example.com, with CORS restricted to the production storefront origin.

## Security requirements
- Passwords must be hashed with Argon2id or bcrypt server-side; never store passwords in browser localStorage.
- Use short-lived sessions/access tokens and secure session cookies where appropriate.
- Enforce authorization server-side for every admin endpoint.
- Validate all request bodies on the server.
- Rate-limit authentication and quote endpoints.
- Keep secrets in environment variables or a secrets manager.
- Record admin mutations in an audit log.

## Migration strategy
1. Keep data.js as the static catalogue during development.
2. Import approved catalogue records into PostgreSQL.
3. Add /api/catalogue, /api/products/:id, /api/quotes, /api/project-plans and /api/account.
4. Replace localStorage persistence one workflow at a time.
5. Add admin authorization before exposing mutation endpoints.
