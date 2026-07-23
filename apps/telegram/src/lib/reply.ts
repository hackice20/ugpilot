import type { Context } from "grammy";
import { splitTelegramMessage } from "./split-message.js";

/** Reply with one or more Telegram-safe message chunks. */
export async function replyLong(ctx: Context, text: string): Promise<void> {
  for (const [i, part] of splitTelegramMessage(text).entries()) {
    if (i > 0) await ctx.replyWithChatAction("typing");
    await ctx.reply(part);
  }
}
