import type { Bot } from "grammy";
import { handleProfileCommand } from "./commands/profile.js";
import { handleYcCommand } from "./commands/yc.js";

export function registerYcCommands(bot: Bot): void {
  bot.command("profile", handleProfileCommand);
  bot.command("yc", handleYcCommand);
}
