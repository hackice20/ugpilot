import { getPool } from "./client.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

export type MailProvider = "gmail" | "outlook";

export type MailAccountRow = {
  id: string;
  telegram_user_id: string;
  slot: number;
  email: string;
  provider: MailProvider;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password_encrypted: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type MailAccountPublic = Omit<MailAccountRow, "password_encrypted"> & {
  hasPassword: true;
};

export type MailCredentials = {
  email: string;
  provider: MailProvider;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
};

const PROVIDER_DEFAULTS: Record<
  MailProvider,
  { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }
> = {
  gmail: {
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
  },
  outlook: {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
};

function toPublic(row: MailAccountRow): MailAccountPublic {
  const { password_encrypted: _, ...rest } = row;
  return { ...rest, hasPassword: true };
}

export async function upsertMailAccount(input: {
  telegramUserId: number;
  slot: 1 | 2;
  email: string;
  password: string;
  provider?: MailProvider;
  makeActive?: boolean;
}): Promise<MailAccountPublic> {
  const provider = input.provider ?? "gmail";
  const defaults = PROVIDER_DEFAULTS[provider];
  const pool = getPool();
  const encrypted = encryptSecret(input.password);

  if (input.makeActive !== false) {
    await pool.query(
      `UPDATE mail_accounts SET is_active = FALSE, updated_at = NOW()
       WHERE telegram_user_id = $1`,
      [input.telegramUserId],
    );
  }

  const { rows } = await pool.query<MailAccountRow>(
    `
    INSERT INTO mail_accounts (
      telegram_user_id, slot, email, provider,
      imap_host, imap_port, smtp_host, smtp_port,
      username, password_encrypted, is_active
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)
    ON CONFLICT (telegram_user_id, slot) DO UPDATE SET
      email = EXCLUDED.email,
      provider = EXCLUDED.provider,
      imap_host = EXCLUDED.imap_host,
      imap_port = EXCLUDED.imap_port,
      smtp_host = EXCLUDED.smtp_host,
      smtp_port = EXCLUDED.smtp_port,
      username = EXCLUDED.username,
      password_encrypted = EXCLUDED.password_encrypted,
      is_active = TRUE,
      updated_at = NOW()
    RETURNING *
    `,
    [
      input.telegramUserId,
      input.slot,
      input.email.toLowerCase(),
      provider,
      defaults.imapHost,
      defaults.imapPort,
      defaults.smtpHost,
      defaults.smtpPort,
      input.email.toLowerCase(),
      encrypted,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Failed to upsert mail account");
  return toPublic(row);
}

export async function listMailAccounts(
  telegramUserId: number,
): Promise<MailAccountPublic[]> {
  const pool = getPool();
  const { rows } = await pool.query<MailAccountRow>(
    `SELECT * FROM mail_accounts
     WHERE telegram_user_id = $1
     ORDER BY slot ASC`,
    [telegramUserId],
  );
  return rows.map(toPublic);
}

export async function setActiveMailAccount(
  telegramUserId: number,
  slot: 1 | 2,
): Promise<MailAccountPublic | null> {
  const pool = getPool();
  await pool.query(
    `UPDATE mail_accounts SET is_active = FALSE, updated_at = NOW()
     WHERE telegram_user_id = $1`,
    [telegramUserId],
  );
  const { rows } = await pool.query<MailAccountRow>(
    `UPDATE mail_accounts SET is_active = TRUE, updated_at = NOW()
     WHERE telegram_user_id = $1 AND slot = $2
     RETURNING *`,
    [telegramUserId, slot],
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function removeMailAccount(
  telegramUserId: number,
  slot: 1 | 2,
): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM mail_accounts WHERE telegram_user_id = $1 AND slot = $2`,
    [telegramUserId, slot],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getActiveMailCredentials(
  telegramUserId: number,
): Promise<(MailCredentials & { slot: number; id: string }) | null> {
  const pool = getPool();
  const { rows } = await pool.query<MailAccountRow>(
    `SELECT * FROM mail_accounts
     WHERE telegram_user_id = $1 AND is_active = TRUE
     LIMIT 1`,
    [telegramUserId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slot: row.slot,
    email: row.email,
    provider: row.provider,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    username: row.username,
    password: decryptSecret(row.password_encrypted),
  };
}

export async function getMailCredentialsBySlot(
  telegramUserId: number,
  slot: 1 | 2,
): Promise<(MailCredentials & { slot: number; id: string }) | null> {
  const pool = getPool();
  const { rows } = await pool.query<MailAccountRow>(
    `SELECT * FROM mail_accounts
     WHERE telegram_user_id = $1 AND slot = $2
     LIMIT 1`,
    [telegramUserId, slot],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slot: row.slot,
    email: row.email,
    provider: row.provider,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    username: row.username,
    password: decryptSecret(row.password_encrypted),
  };
}
