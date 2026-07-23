import { getPool } from "./client.js";

export type ChatRole = "user" | "assistant";

export type TelegramChatRow = {
  id: string;
  telegram_chat_id: string;
  telegram_user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type TelegramMessageRow = {
  id: string;
  chat_id: string;
  role: ChatRole;
  content: string;
  telegram_message_id: string | null;
  created_at: Date;
};

export type UpsertChatInput = {
  telegramChatId: number;
  telegramUserId?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export async function upsertTelegramChat(
  input: UpsertChatInput,
): Promise<TelegramChatRow> {
  const pool = getPool();
  const { rows } = await pool.query<TelegramChatRow>(
    `
    INSERT INTO telegram_chats (
      telegram_chat_id, telegram_user_id, username, first_name, last_name
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (telegram_chat_id) DO UPDATE SET
      telegram_user_id = COALESCE(EXCLUDED.telegram_user_id, telegram_chats.telegram_user_id),
      username         = COALESCE(EXCLUDED.username, telegram_chats.username),
      first_name       = COALESCE(EXCLUDED.first_name, telegram_chats.first_name),
      last_name        = COALESCE(EXCLUDED.last_name, telegram_chats.last_name),
      updated_at       = NOW()
    RETURNING *
    `,
    [
      input.telegramChatId,
      input.telegramUserId ?? null,
      input.username ?? null,
      input.firstName ?? null,
      input.lastName ?? null,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Failed to upsert telegram chat");
  return row;
}

export async function appendTelegramMessage(input: {
  chatId: string;
  role: ChatRole;
  content: string;
  telegramMessageId?: number;
}): Promise<TelegramMessageRow> {
  const pool = getPool();
  const { rows } = await pool.query<TelegramMessageRow>(
    `
    INSERT INTO telegram_messages (chat_id, role, content, telegram_message_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [
      input.chatId,
      input.role,
      input.content,
      input.telegramMessageId ?? null,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Failed to insert telegram message");
  return row;
}

/** Recent user/assistant turns only — never includes system prompt. */
export async function getRecentTelegramMessages(
  chatId: string,
  limit = 40,
): Promise<{ role: ChatRole; content: string }[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ role: ChatRole; content: string }>(
    `
    SELECT role, content
    FROM (
      SELECT role, content, created_at
      FROM telegram_messages
      WHERE chat_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    ) AS recent
    ORDER BY created_at ASC
    `,
    [chatId, limit],
  );
  return rows;
}

export async function clearTelegramMessages(chatId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM telegram_messages WHERE chat_id = $1`,
    [chatId],
  );
  return result.rowCount ?? 0;
}
