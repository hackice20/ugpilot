import { getPool } from "./client.js";

export type MailDraftRow = {
  id: string;
  telegram_user_id: string;
  mail_account_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: "pending" | "sent" | "cancelled";
  meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export async function createMailDraft(input: {
  telegramUserId: number;
  mailAccountId?: string;
  toEmail: string;
  subject: string;
  body: string;
  meta?: Record<string, unknown>;
}): Promise<MailDraftRow> {
  const pool = getPool();
  const { rows } = await pool.query<MailDraftRow>(
    `
    INSERT INTO mail_drafts (
      telegram_user_id, mail_account_id, to_email, subject, body, meta
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING *
    `,
    [
      input.telegramUserId,
      input.mailAccountId ?? null,
      input.toEmail,
      input.subject,
      input.body,
      JSON.stringify(input.meta ?? {}),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to create mail draft");
  return row;
}

export async function listPendingDrafts(
  telegramUserId: number,
  limit = 10,
): Promise<MailDraftRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<MailDraftRow>(
    `SELECT * FROM mail_drafts
     WHERE telegram_user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT $2`,
    [telegramUserId, limit],
  );
  return rows;
}

export async function getMailDraft(
  telegramUserId: number,
  draftId: number | string,
): Promise<MailDraftRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<MailDraftRow>(
    `SELECT * FROM mail_drafts
     WHERE telegram_user_id = $1 AND id = $2
     LIMIT 1`,
    [telegramUserId, draftId],
  );
  return rows[0] ?? null;
}

export async function markDraftSent(
  telegramUserId: number,
  draftId: number | string,
): Promise<MailDraftRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<MailDraftRow>(
    `UPDATE mail_drafts
     SET status = 'sent', updated_at = NOW()
     WHERE telegram_user_id = $1 AND id = $2 AND status = 'pending'
     RETURNING *`,
    [telegramUserId, draftId],
  );
  return rows[0] ?? null;
}

export async function cancelMailDraft(
  telegramUserId: number,
  draftId: number | string,
): Promise<MailDraftRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<MailDraftRow>(
    `UPDATE mail_drafts
     SET status = 'cancelled', updated_at = NOW()
     WHERE telegram_user_id = $1 AND id = $2 AND status = 'pending'
     RETURNING *`,
    [telegramUserId, draftId],
  );
  return rows[0] ?? null;
}
