import type { Bot } from "grammy";
import { handleMailCommand } from "./account.js";
import { handleInboxCommand } from "./inbox.js";
import { handleDigestCommand } from "./digest.js";
import {
  handleSendCommand,
  handleConfirmCommand,
  handleCancelCommand,
} from "./send.js";
import {
  handleDraftsCommand,
  handleApproveCommand,
  handleRejectCommand,
} from "./drafts.js";

export function registerMailCommands(bot: Bot): void {
  bot.command("mail", handleMailCommand);
  bot.command("inbox", handleInboxCommand);
  bot.command("digest", handleDigestCommand);
  bot.command("send", handleSendCommand);
  bot.command("confirm", handleConfirmCommand);
  bot.command("cancel", handleCancelCommand);
  bot.command("drafts", handleDraftsCommand);
  bot.command("approve", handleApproveCommand);
  bot.command("reject", handleRejectCommand);
}
