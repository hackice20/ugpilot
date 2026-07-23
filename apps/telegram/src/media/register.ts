import type { Bot } from "grammy";
import {
  handleFilesCommand,
  handlePhotoMessage,
  handleVoiceMessage,
  handleAudioMessage,
  handleDocumentMessage,
} from "./handlers.js";

export function registerMediaHandlers(bot: Bot): void {
  bot.command("files", handleFilesCommand);
  bot.on("message:photo", handlePhotoMessage);
  bot.on("message:voice", handleVoiceMessage);
  bot.on("message:audio", handleAudioMessage);
  bot.on("message:document", handleDocumentMessage);
}
