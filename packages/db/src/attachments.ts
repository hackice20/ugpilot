import { getPool } from "./client.js";

export type AttachmentKind =
  | "image"
  | "audio"
  | "voice"
  | "pdf"
  | "docx"
  | "other";

export type TelegramAttachmentRow = {
  id: string;
  chat_id: string;
  kind: AttachmentKind;
  file_name: string;
  mime_type: string | null;
  storage_path: string;
  telegram_file_id: string | null;
  extracted_text: string;
  bytes: number;
  created_at: Date;
};

export async function insertTelegramAttachment(input: {
  chatId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType?: string;
  storagePath: string;
  telegramFileId?: string;
  extractedText: string;
  bytes: number;
}): Promise<TelegramAttachmentRow> {
  const pool = getPool();
  const { rows } = await pool.query<TelegramAttachmentRow>(
    `
    INSERT INTO telegram_attachments (
      chat_id, kind, file_name, mime_type, storage_path,
      telegram_file_id, extracted_text, bytes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      input.chatId,
      input.kind,
      input.fileName,
      input.mimeType ?? null,
      input.storagePath,
      input.telegramFileId ?? null,
      input.extractedText,
      input.bytes,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to insert attachment");
  return row;
}

export async function listTelegramAttachments(
  chatId: string,
  limit = 20,
): Promise<TelegramAttachmentRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<TelegramAttachmentRow>(
    `
    SELECT * FROM telegram_attachments
    WHERE chat_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [chatId, limit],
  );
  return rows;
}

/** Recent attachment texts for LLM context (oldest → newest). */
export async function getRecentAttachmentContext(
  chatId: string,
  limit = 5,
): Promise<{ kind: AttachmentKind; fileName: string; extractedText: string }[]> {
  const rows = await listTelegramAttachments(chatId, limit);
  return rows
    .slice()
    .reverse()
    .map((r) => ({
      kind: r.kind,
      fileName: r.file_name,
      extractedText: r.extracted_text,
    }));
}

export async function clearTelegramAttachments(
  chatId: string,
): Promise<{ count: number; paths: string[] }> {
  const pool = getPool();
  const { rows } = await pool.query<{ storage_path: string }>(
    `SELECT storage_path FROM telegram_attachments WHERE chat_id = $1`,
    [chatId],
  );
  const result = await pool.query(
    `DELETE FROM telegram_attachments WHERE chat_id = $1`,
    [chatId],
  );
  return {
    count: result.rowCount ?? 0,
    paths: rows.map((r) => r.storage_path),
  };
}
