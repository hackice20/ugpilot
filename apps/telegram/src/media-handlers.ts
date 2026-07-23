import type { Context, Bot } from "grammy";
import {
  insertTelegramAttachment,
  listTelegramAttachments,
  clearTelegramAttachments,
  appendTelegramMessage,
  getRecentTelegramMessages,
  type TelegramChatRow,
} from "@ugpilot/db";
import { saveBuffer, deleteStoredFile } from "@ugpilot/storage";
import {
  detectKind,
  extractMediaContext,
  formatAttachmentMessage,
  type MediaKind,
} from "@ugpilot/skills-media";
import { createLogger } from "@ugpilot/logger";
import { chatWithLlm } from "./llm.js";
import { splitTelegramMessage } from "./split-message.js";

const log = createLogger("telegram:media");

const HISTORY_LIMIT = Number(process.env.TELEGRAM_HISTORY_LIMIT ?? 40);
const MAX_DOWNLOAD_BYTES = Number(
  process.env.TELEGRAM_MAX_MEDIA_BYTES ?? 20 * 1024 * 1024,
);

type Downloaded = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  telegramFileId: string;
  telegramType: "photo" | "voice" | "audio" | "document";
  caption?: string;
};

async function downloadTelegramFile(
  ctx: Context,
  fileId: string,
  fileName: string,
  mimeType: string | undefined,
  telegramType: Downloaded["telegramType"],
  caption?: string,
): Promise<Downloaded> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram file_path missing");
  if (file.file_size && file.file_size > MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `File too large (${file.file_size} bytes). Max ${MAX_DOWNLOAD_BYTES}.`,
    );
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    buffer,
    fileName,
    mimeType,
    telegramFileId: fileId,
    telegramType,
    caption,
  };
}

async function ingestMedia(
  ctx: Context,
  chat: TelegramChatRow,
  downloaded: Downloaded,
): Promise<{
  kind: MediaKind;
  contextMessage: string;
  attachmentId: string;
  shouldChat: boolean;
  userPrompt: string;
}> {
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

  let shouldChat = false;
  let userPrompt = "";

  if (isSpoken) {
    // Transcript already stored in history; avoid duplicating it as the next user turn.
    shouldChat = true;
    userPrompt = caption
      ? `Respond to my voice/audio note above. Extra note: ${caption}`
      : "Respond to my voice/audio note above.";
  } else if (caption) {
    shouldChat = true;
    userPrompt = caption;
  }

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

async function replyFromLlm(
  ctx: Context,
  chat: TelegramChatRow,
  userPrompt: string,
) {
  const history = await getRecentTelegramMessages(chat.id, HISTORY_LIMIT);
  // Drop the last user turn if it's the attachment we just stored and prompt is separate caption,
  // or keep it — keeping is better so model sees file content in history.
  const result = await chatWithLlm(userPrompt, history);

  await appendTelegramMessage({
    chatId: chat.id,
    role: "assistant",
    content: result.content,
  });

  for (const [i, part] of splitTelegramMessage(result.content).entries()) {
    if (i > 0) await ctx.replyWithChatAction("typing");
    await ctx.reply(part);
  }
}

export function registerMediaHandlers(
  bot: Bot,
  ensureChat: (ctx: Context) => Promise<TelegramChatRow>,
) {
  bot.command("files", async (ctx) => {
    const chat = await ensureChat(ctx);
    const files = await listTelegramAttachments(chat.id, 15);
    if (!files.length) {
      await ctx.reply("No files in context yet. Send a PDF, DOCX, image, or voice note.");
      return;
    }
    const text = files
      .map(
        (f) =>
          `#${f.id} [${f.kind}] ${f.file_name} (${Math.round(f.bytes / 1024)}KB)\n   ${f.extracted_text.slice(0, 80).replace(/\n/g, " ")}…`,
      )
      .join("\n\n");
    for (const part of splitTelegramMessage(text)) await ctx.reply(part);
  });

  const handle = async (ctx: Context, downloaded: Downloaded) => {
    await ctx.replyWithChatAction("typing");
    try {
      const chat = await ensureChat(ctx);
      const result = await ingestMedia(ctx, chat, downloaded);

      if (result.shouldChat) {
        await replyFromLlm(ctx, chat, result.userPrompt);
      } else {
        await ctx.reply(
          `Saved ${result.kind} to context (#${result.attachmentId}). Ask me about it anytime, or add a caption next time.`,
        );
      }
    } catch (err) {
      log.error("media.handle_failed", err);
      await ctx.reply(
        err instanceof Error
          ? err.message
          : "Could not process that file. Try PDF, DOCX, image, or audio.",
      );
    }
  };

  bot.on("message:photo", async (ctx) => {
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];
    if (!best) return;
    const downloaded = await downloadTelegramFile(
      ctx,
      best.file_id,
      `photo-${best.file_unique_id}.jpg`,
      "image/jpeg",
      "photo",
      ctx.message.caption,
    );
    await handle(ctx, downloaded);
  });

  bot.on("message:voice", async (ctx) => {
    const voice = ctx.message.voice;
    const downloaded = await downloadTelegramFile(
      ctx,
      voice.file_id,
      `voice-${voice.file_unique_id}.ogg`,
      voice.mime_type || "audio/ogg",
      "voice",
      ctx.message.caption,
    );
    await handle(ctx, downloaded);
  });

  bot.on("message:audio", async (ctx) => {
    const audio = ctx.message.audio;
    const name = audio.file_name || `audio-${audio.file_unique_id}.mp3`;
    const downloaded = await downloadTelegramFile(
      ctx,
      audio.file_id,
      name,
      audio.mime_type || "audio/mpeg",
      "audio",
      ctx.message.caption,
    );
    await handle(ctx, downloaded);
  });

  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    const name = doc.file_name || `file-${doc.file_unique_id}`;
    const downloaded = await downloadTelegramFile(
      ctx,
      doc.file_id,
      name,
      doc.mime_type,
      "document",
      ctx.message.caption,
    );
    await handle(ctx, downloaded);
  });
}

export async function clearChatMedia(chatId: string): Promise<number> {
  const { count, paths } = await clearTelegramAttachments(chatId);
  await Promise.all(paths.map((p) => deleteStoredFile(p)));
  return count;
}
