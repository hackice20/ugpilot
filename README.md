# UGPilot

AI-powered job hunt assistant. Live surface today: **Telegram bot**.

## Layout

```
ugpilot/
├── apps/
│   └── telegram/          # Bot (chat, mail, search, media, YC drafts)
├── packages/
│   ├── db/                # Postgres (chats, mail, drafts, attachments)
│   ├── logger/
│   ├── storage/           # Media storage (local / Cloudflare R2)
│   ├── skills/
│   │   ├── email/         # IMAP/SMTP
│   │   ├── search/        # SearXNG
│   │   └── media/         # PDF / DOCX / image / audio
│   └── agents/
│       └── yc/            # YC company search + outreach prompts
├── docker/                # postgres, searxng
└── docs/deployment/       # Oracle ARM notes
```

## Quick start

```bash
cp .env.example .env          # tokens + keys
docker compose up -d postgres searxng
pnpm install
pnpm --filter @ugpilot/telegram dev
```

