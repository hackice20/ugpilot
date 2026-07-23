# UGPilot Telegram bot

grammY + OpenAI + SearXNG + Gmail/Outlook IMAP/SMTP (free) + YC outreach drafts.

## Infra

```bash
docker compose up -d postgres searxng
cp .env.example .env   # set TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, MAIL_SECRET
pnpm install
pnpm --filter @ugpilot/telegram dev
```

## Mail (2 accounts)

1. Gmail: enable 2FA → create an [App Password](https://myaccount.google.com/apppasswords)
2. In Telegram:
   - `/mail add 1 gmail` → send email → send app password
   - `/mail add 2 gmail` for the second inbox
   - `/mail use 1|2` to switch
3. `/inbox` — Primary/important
4. `/digest` — 1-liners; skips promotions/social/updates (Gmail categories)
5. Outbound is **approve-only**: `/drafts` → `/approve <id>`

Passwords are AES-encrypted in Postgres (`MAIL_SECRET`).

## YC job outreach

```
/profile set name=Yash | role=Product Engineer | blurb=I built …
/yc find fintech B2B
/yc draft fintech B2B hiring engineers
/drafts
/approve 3
```

## Media context

Send PDF, DOCX, images, or voice/audio. Stored via `@ugpilot/storage` (`STORAGE_DRIVER=local` → `.storage`, or `r2` → Cloudflare R2 in prod); text is extracted and kept in chat history.

- PDF/DOCX/image without caption → saved; ask later (`/files`)
- With caption → answered using that file as context
- Voice → Whisper transcript → reply
- `/clear` wipes messages + attachments

`VISION_MODEL` (default `gpt-4o-mini`) + `WHISPER_MODEL` (default `whisper-1`). Oracle ARM friendly (API-side, no local ffmpeg).

## Oracle ARM

Keep Postgres + SearXNG on localhost. Do not open IMAP credentials or DB ports publicly.
