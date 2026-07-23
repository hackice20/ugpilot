import type { Context } from "grammy";
import {
  insertTelegramAttachment,
  appendTelegramMessage,
  type TelegramChatRow,
} from "@ugpilot/db";
import { saveBuffer } from "@ugpilot/storage";
import {
  detectKind,
  extractMediaContext,
  formatAttachmentMessage,
} from "@ugpilot/skills-media";
import { createLogger } from "@ugpilot/logger";
import type { DownloadedTelegramFile, IngestMediaResult } from "../types/media.js";

const log = createLogger("telegram:media:ingest");

export async function ingestMedia(
  ctx: Context,
  chat: TelegramChatRow,
  downloaded: DownloadedTelegramFile,
): Promise<IngestMediaResult> {
  const kind = detectKind({
    mimeType: downloaded.mimeType,
    fileName: downloaded.fileName,
    telegramType: downloaded.telegramType,
  });

  if (kind === "other") {
    throw new Error(
      "Unsupported file. Send PDF, DOCX, image, voice note, or audio.",
    );
  }

  const saved = await saveBuffer({
    namespace: `telegram/${chat.id}`,
    buffer: downloaded.buffer,
    originalName: downloaded.fileName,
    ext: downloaded.fileName.split(".").pop(),
  });

  const { label, extractedText } = await extractMediaContext({
    kind,
    buffer: downloaded.buffer,
    fileName: downloaded.fileName,
    mimeType: downloaded.mimeType,
    caption: downloaded.caption,
  });

  const attachment = await insertTelegramAttachment({
    chatId: chat.id,
    kind,
    fileName: downloaded.fileName,
    mimeType: downloaded.mimeType,
    storagePath: saved.relativePath,
    telegramFileId: downloaded.telegramFileId,
    extractedText,
    bytes: saved.bytes,
  });

  const isSpoken = kind === "voice" || kind === "audio";
  const caption = downloaded.caption?.trim();

  const contextMessage = isSpoken
    ? `[${label}]\n${caption ? `Caption: ${caption}\n` : ""}${extractedText}`
    : formatAttachmentMessage({
        label,
        extractedText,
        caption: downloaded.caption,
      });

  await appendTelegramMessage({
    chatId: chat.id,
    role: "user",
    content: contextMessage,
    telegramMessageId: ctx.message?.message_id,
  });

  const { shouldChat, userPrompt } = resolveFollowUp(isSpoken, caption);

  log.info("media.ingested", {
    chatDbId: chat.id,
    kind,
    fileName: downloaded.fileName,
    bytes: saved.bytes,
    attachmentId: attachment.id,
    extractedChars: extractedText.length,
    shouldChat,
  });

  return {
    kind,
    contextMessage,
    attachmentId: attachment.id,
    shouldChat,
    userPrompt,
  };
}

function resolveFollowUp(
  isSpoken: boolean,
  caption: string | undefined,
): { shouldChat: boolean; userPrompt: string } {
  if (isSpoken) {
    return {
      shouldChat: true,
      userPrompt: caption
        ? `Respond to my voice/audio note above. Extra note: ${caption}`
        : "Respond to my voice/audio note above.",
    };
  }

  if (caption) {
    return { shouldChat: true, userPrompt: caption };
  }

  return { shouldChat: false, userPrompt: "" };
}
