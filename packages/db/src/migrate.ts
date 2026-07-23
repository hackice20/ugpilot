import { getPool } from "./client.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS telegram_chats (
  id              BIGSERIAL PRIMARY KEY,
  telegram_chat_id BIGINT NOT NULL UNIQUE,
  telegram_user_id BIGINT,
  username        TEXT,
  first_name      TEXT,
  last_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id                  BIGSERIAL PRIMARY KEY,
  chat_id             BIGINT NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content             TEXT NOT NULL,
  telegram_message_id BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat_created
  ON telegram_messages (chat_id, created_at ASC);

CREATE TABLE IF NOT EXISTS mail_accounts (
  id                  BIGSERIAL PRIMARY KEY,
  telegram_user_id    BIGINT NOT NULL,
  slot                SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  email               TEXT NOT NULL,
  provider            TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  imap_host           TEXT NOT NULL,
  imap_port           INT NOT NULL,
  smtp_host           TEXT NOT NULL,
  smtp_port           INT NOT NULL,
  username            TEXT NOT NULL,
  password_encrypted  TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (telegram_user_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_user
  ON mail_accounts (telegram_user_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  telegram_user_id BIGINT PRIMARY KEY,
  display_name     TEXT,
  target_role      TEXT,
  resume_blurb     TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mail_drafts (
  id               BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  mail_account_id  BIGINT REFERENCES mail_accounts(id) ON DELETE SET NULL,
  to_email         TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'cancelled')),
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_drafts_user_status
  ON mail_drafts (telegram_user_id, status);

CREATE TABLE IF NOT EXISTS telegram_attachments (
  id                BIGSERIAL PRIMARY KEY,
  chat_id           BIGINT NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'voice', 'pdf', 'docx', 'other')),
  file_name         TEXT NOT NULL,
  mime_type         TEXT,
  storage_path      TEXT NOT NULL,
  telegram_file_id  TEXT,
  extracted_text    TEXT NOT NULL DEFAULT '',
  bytes             INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_attachments_chat_created
  ON telegram_attachments (chat_id, created_at DESC);
`;

export async function migrate(): Promise<void> {
  const pool = getPool();
  await pool.query(MIGRATION_SQL);
}
