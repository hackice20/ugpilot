# Deployment — Oracle Cloud ARM (Always Free)

UGPilot is intended to run on an Oracle Cloud Always Free ARM (Ampere) VM.

## Principles

- Prefer official multi-arch images (`postgres`, `searxng/searxng`). Do not pin `platform: linux/amd64` unless you have a strong reason; that forces QEMU emulation and burns free-tier CPU.
- Keep private services (Postgres, SearXNG) bound to `127.0.0.1` or an internal Docker network. Only expose nginx / HTTPS publicly when you add a web app.
- SearXNG JSON API must stay private. The Telegram bot calls it on localhost.

## Minimal infra on the VM

```bash
docker compose up -d postgres searxng
pnpm --filter @ugpilot/telegram start
```

Media attachments go to **Cloudflare R2** in production (not local disk):

```bash
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=ugpilot-media
```

When apps are later containerized, set:

```bash
SEARXNG_URL=http://searxng:8080
DATABASE_URL=postgresql://ugpilot:ugpilot@postgres:5432/ugpilot
```

## Firewall / security list

Allow inbound:

- `22` (SSH) from your IP
- `80` / `443` once a public web frontend exists

Deny / do not open:

- `5432` Postgres
- `8080` SearXNG
