import type { Context } from "grammy";
import { clearTelegramMessages } from "@ugpilot/db";
import { ensureChat } from "../lib/ensure-chat.js";
import { clearChatMedia } from "../media/clear.js";

export async function handleClearCommand(ctx: Context): Promise<void> {
  const chat = await ensureChat(ctx);
  const deletedMsgs = await clearTelegramMessages(chat.id);
  const deletedFiles = await clearChatMedia(chat.id);
  await ctx.reply(
    `Cleared ${deletedMsgs} message(s) and ${deletedFiles} attachment(s).`,
  );
}
