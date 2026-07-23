import type { Context } from "grammy";
import {
  appendTelegramMessage,
  getRecentTelegramMessages,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { env } from "../env.js";
import { chatWithLlm } from "../llm/index.js";
import { ensureChat, replyLong } from "../lib/index.js";
import { handleMailLinkMessage, isMailLinkPending } from "../mail/index.js";

const log = createLogger("telegram:text");

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text || text.startsWith("/")) return;

  if (ctx.from?.id && isMailLinkPending(ctx.from.id)) {
    await handleMailLinkMessage(ctx);
    return;
  }

  const started = Date.now();
  const telegramChatId = ctx.chat!.id;
  const telegramMessageId = ctx.message!.message_id;

  log.info("message.inbound", {
    telegramChatId,
    telegramMessageId,
    userId: ctx.from?.id,
    username: ctx.from?.username,
    chars: text.length,
    preview: text.slice(0, 120),
  });

  await ctx.replyWithChatAction("typing");

  try {
    const chat = await ensureChat(ctx);
    const history = await getRecentTelegramMessages(
      chat.id,
      env.historyLimit(),
    );
    const result = await chatWithLlm(text, history);

    await appendTelegramMessage({
      chatId: chat.id,
      role: "user",
      content: text,
      telegramMessageId,
    });
    await appendTelegramMessage({
      chatId: chat.id,
      role: "assistant",
      content: result.content,
    });

    log.info("message.persisted", {
      chatDbId: chat.id,
      telegramChatId,
      toolCalls: result.toolCalls,
      searches: result.searches,
      totalLatencyMs: Date.now() - started,
    });

    await replyLong(ctx, result.content);
  } catch (err) {
    log.error("message.failed", err, {
      telegramChatId,
      telegramMessageId,
      totalLatencyMs: Date.now() - started,
    });
    await ctx.reply("Something went wrong. Try again in a moment.");
  }
}
