# Production deployment path

## Static storefront

The public storefront starts at **index.html**. It is the homepage. Every other HTML document is a supporting route.

For local development, open `index.html` with Live Server. Do not open `media.html`, `admin.html`, or another document when you want the homepage.

Recommended public navigation:
- Homepage: `index.html`
- Equipment store: `products.html`
- Categories: `categories.html`
- Industries / Shop by Business: `industries.html`
- Business planner: `build-your-business.html`
- Quote: `quote.html`
- Customer account: `login.html` / `signup.html`
- FAQ: `faq.html`
- About: `about.html`
- Contact: `contact.html`

The admin page is intentionally not part of the public navigation. In production it should be reached through an authenticated staff route rather than by a public shortcut.

## Local backend stack

From the repository root:

`docker compose up --build`

The API will be available at `http://localhost:8000` and PostgreSQL will be created automatically from `backend/schema.sql`.

Before using this outside a local machine:
- replace the database password
- generate a strong session secret
- use HTTPS
- set `COOKIE_SECURE=true`
- set `FRONTEND_ORIGINS` to the real frontend origin

## Production architecture

The intended deployment has three pieces:

1. **Static frontend** — GitHub Pages, Cloudflare Pages, Netlify or another static host.
2. **FastAPI service** — a container host or VM running `backend/Dockerfile`.
3. **PostgreSQL** — managed PostgreSQL or a separately secured database service.

The frontend talks to the API through `SITE_CONFIG.apiBase`. No database credentials belong in the frontend.

The backend is not claimed as deployed until a real database, API host, HTTPS domain and environment secrets are configured.
