import type { Context } from "grammy";
import {
  appendTelegramMessage,
  getRecentTelegramMessages,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import {
  webSearch,
  formatSearchResultsForLlm,
} from "@ugpilot/skills-search";
import { env } from "../env.js";
import { chatWithLlm } from "../llm/index.js";
import { ensureChat, replyLong } from "../lib/index.js";

const log = createLogger("telegram:search");

export async function handleSearchCommand(ctx: Context): Promise<void> {
  const query = ctx.match?.toString().trim() ?? "";
  if (!query) {
    await ctx.reply("Usage: /search <query>");
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const chat = await ensureChat(ctx);
    const raw = await webSearch(query, { limit: 5 });
    const formatted = formatSearchResultsForLlm(raw);
    const result = await chatWithLlm(
      `The user ran /search for: "${query}"\n\nSummarize useful findings and include best links:\n\n${formatted}`,
      await getRecentTelegramMessages(chat.id, env.historyLimit()),
      { enableTools: false },
    );

    await appendTelegramMessage({
      chatId: chat.id,
      role: "user",
      content: `/search ${query}`,
      telegramMessageId: ctx.message?.message_id,
    });
    await appendTelegramMessage({
      chatId: chat.id,
      role: "assistant",
      content: result.content,
    });

    await replyLong(ctx, result.content);
  } catch (err) {
    log.error("command.search_failed", err);
    await ctx.reply("Search failed. Is SearXNG running?");
  }
}
