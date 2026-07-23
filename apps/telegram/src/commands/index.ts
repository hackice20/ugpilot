import type { Bot } from "grammy";
import { handleStartCommand } from "./start.js";
import { handleHelpCommand } from "./help.js";
import { handleSearchCommand } from "./search.js";
import { handleClearCommand } from "./clear.js";

export function registerCoreCommands(bot: Bot): void {
  bot.command("start", handleStartCommand);
  bot.command("help", handleHelpCommand);
  bot.command("search", handleSearchCommand);
  bot.command("clear", handleClearCommand);
}
