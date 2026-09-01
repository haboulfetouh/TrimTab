# Multi-Cloud FinOps Agent — POC

Dockerized proof of concept: Next.js dashboard, background worker, Postgres, Caddy reverse proxy.

## Local / server run

```
cp .env.example .env   # fill in real values
docker compose up --build -d
```

- https://trimtab.online — static marketing/landing page
- https://app.trimtab.online — the product (dashboard, onboarding, API) — requires its own DNS A record pointed at the server

Caddy provisions and renews TLS certs per-domain automatically via Let's Encrypt (HTTP-01 challenge on port 80, redirects to 443).

## Layout

- `landing/` — static marketing site, served directly by Caddy at the root domain
- `app/` — Next.js dashboard + API routes, served at app.trimtab.online
- `worker/` — background ingestion worker (scheduler skeleton; FOCUS ingestion jobs land here)
- `worker/migrations/` — SQL migrations, applied automatically on worker startup (tracked in `schema_migrations`)
- `caddy/` — reverse proxy config
