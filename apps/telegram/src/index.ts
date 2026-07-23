import { Bot } from "grammy";
import {
  migrate,
  closePool,
  upsertTelegramChat,
  appendTelegramMessage,
  getRecentTelegramMessages,
  clearTelegramMessages,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import {
  webSearch,
  formatSearchResultsForLlm,
} from "@ugpilot/skills-search";
import { chatWithLlm } from "./llm.js";
import { splitTelegramMessage } from "./split-message.js";
import {
  registerMailCommands,
  handleMailLinkMessage,
  isMailLinkPending,
} from "./mail-commands.js";
import { registerYcCommands } from "./yc-commands.js";
import {
  registerMediaHandlers,
  clearChatMedia,
} from "./media-handlers.js";

const log = createLogger("telegram:bot");

const HISTORY_LIMIT = Number(process.env.TELEGRAM_HISTORY_LIMIT ?? 40);

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  log.error("missing.token", { hint: "Set TELEGRAM_BOT_TOKEN in .env" });
  process.exit(1);
}

const bot = new Bot(token);

async function ensureChat(ctx: {
  chat?: { id: number };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
}) {
  if (!ctx.chat) throw new Error("Missing chat on update");
  return upsertTelegramChat({
    telegramChatId: ctx.chat.id,
    telegramUserId: ctx.from?.id,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
  });
}

registerMailCommands(bot);
registerYcCommands(bot);
registerMediaHandlers(bot, ensureChat);

bot.command("start", async (ctx) => {
  await ensureChat(ctx);
  await ctx.reply(
    [
      "Hey — I'm UGPilot.",
      "",
      "Chat normally. Send PDF / DOCX / images / voice — I'll keep them as context.",
      "",
      "/search /mail /inbox /digest /files",
      "/profile /yc /clear",
    ].join("\n"),
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "/search <query> — web search",
      "/mail help — mailboxes, digest, approve sends",
      "/send — reply to draft, then /confirm",
      "/files — list media held in context",
      "/inbox /digest — important mail",
      "/profile set name=… | role=… | blurb=…",
      "/yc find|draft <query> — YC outreach drafts",
      "/drafts /approve <id> /reject <id>",
      "/clear — wipe chat memory + attachments",
      "",
      "Media: PDF, DOCX, images, voice/audio (with optional caption).",
    ].join("\n"),
  );
});

bot.command("search", async (ctx) => {
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
      await getRecentTelegramMessages(chat.id, HISTORY_LIMIT),
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
    for (const part of splitTelegramMessage(result.content)) {
      await ctx.reply(part);
    }
  } catch (err) {
    log.error("command.search_failed", err);
    await ctx.reply("Search failed. Is SearXNG running?");
  }
});

bot.command("clear", async (ctx) => {
  const chat = await ensureChat(ctx);
  const deletedMsgs = await clearTelegramMessages(chat.id);
  const deletedFiles = await clearChatMedia(chat.id);
  await ctx.reply(
    `Cleared ${deletedMsgs} message(s) and ${deletedFiles} attachment(s).`,
  );
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith("/")) return;

  if (ctx.from?.id && isMailLinkPending(ctx.from.id)) {
    await handleMailLinkMessage(ctx);
    return;
  }

  const started = Date.now();
  const telegramChatId = ctx.chat.id;
  const telegramMessageId = ctx.message.message_id;

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
    const history = await getRecentTelegramMessages(chat.id, HISTORY_LIMIT);
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

    for (const [i, part] of splitTelegramMessage(result.content).entries()) {
      if (i > 0) await ctx.replyWithChatAction("typing");
      await ctx.reply(part);
    }
  } catch (err) {
    log.error("message.failed", err, {
      telegramChatId,
      telegramMessageId,
      totalLatencyMs: Date.now() - started,
    });
    await ctx.reply("Something went wrong. Try again in a moment.");
  }
});

bot.catch((err) => {
  log.error("bot.catch", err.error ?? err);
});

async function main() {
  log.info("boot.start", {
    historyLimit: HISTORY_LIMIT,
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    searxngUrl: process.env.SEARXNG_URL ?? "http://127.0.0.1:8080",
  });

  await migrate();
  log.info("db.migrated");

  const shutdown = async (signal: string) => {
    log.info("boot.shutdown", { signal });
    bot.stop();
    await closePool();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await bot.start({
    onStart: (info) => {
      log.info("bot.ready", { botId: info.id, username: info.username });
    },
  });
}

main().catch((err) => {
  log.error("boot.failed", err);
  process.exit(1);
});
