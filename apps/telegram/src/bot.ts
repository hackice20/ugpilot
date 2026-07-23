import { Bot } from "grammy";
import { createLogger } from "@ugpilot/logger";
import { env } from "./env.js";
import { registerCoreCommands } from "./commands/index.js";
import { handleTextMessage } from "./handlers/index.js";
import { registerMailCommands } from "./mail/index.js";
import { registerMediaHandlers } from "./media/index.js";
import { registerYcCommands } from "./yc/index.js";

const log = createLogger("telegram:bot");

export function createBot(): Bot {
  const bot = new Bot(env.telegramBotToken());

  registerCoreCommands(bot);
  registerMailCommands(bot);
  registerYcCommands(bot);
  registerMediaHandlers(bot);

  bot.on("message:text", handleTextMessage);

  bot.catch((err) => {
    log.error("bot.catch", err.error ?? err);
  });

  return bot;
}
