import type { Context } from "grammy";
import {
  getRecentTelegramMessages,
  appendTelegramMessage,
  listTelegramAttachments,
  type TelegramChatRow,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { env } from "../env.js";
import { chatWithLlm } from "../llm/index.js";
import { ensureChat, replyLong } from "../lib/index.js";
import type { DownloadedTelegramFile } from "../types/media.js";
import { downloadTelegramFile } from "./download.js";
import { ingestMedia } from "./ingest.js";

const log = createLogger("telegram:media");

export async function handleFilesCommand(ctx: Context): Promise<void> {
  const chat = await ensureChat(ctx);
  const files = await listTelegramAttachments(chat.id, 15);

  if (!files.length) {
    await ctx.reply(
      "No files in context yet. Send a PDF, DOCX, image, or voice note.",
    );
    return;
  }

  const text = files
    .map(
      (f) =>
        `#${f.id} [${f.kind}] ${f.file_name} (${Math.round(f.bytes / 1024)}KB)\n   ${f.extracted_text.slice(0, 80).replace(/\n/g, " ")}…`,
    )
    .join("\n\n");

  await replyLong(ctx, text);
}

export async function handleDownloadedMedia(
  ctx: Context,
  downloaded: DownloadedTelegramFile,
): Promise<void> {
  await ctx.replyWithChatAction("typing");

  try {
    const chat = await ensureChat(ctx);
    const result = await ingestMedia(ctx, chat, downloaded);

    if (result.shouldChat) {
      await replyFromLlm(ctx, chat, result.userPrompt);
      return;
    }

    await ctx.reply(
      `Saved ${result.kind} to context (#${result.attachmentId}). Ask me about it anytime, or add a caption next time.`,
    );
  } catch (err) {
    log.error("media.handle_failed", err);
    await ctx.reply(
      err instanceof Error
        ? err.message
        : "Could not process that file. Try PDF, DOCX, image, or audio.",
    );
  }
}

async function replyFromLlm(
  ctx: Context,
  chat: TelegramChatRow,
  userPrompt: string,
): Promise<void> {
  const history = await getRecentTelegramMessages(chat.id, env.historyLimit());
  const result = await chatWithLlm(userPrompt, history);

  await appendTelegramMessage({
    chatId: chat.id,
    role: "assistant",
    content: result.content,
  });

  await replyLong(ctx, result.content);
}

export async function handlePhotoMessage(ctx: Context): Promise<void> {
  const photos = ctx.message?.photo;
  const best = photos?.[photos.length - 1];
  if (!best) return;

  const downloaded = await downloadTelegramFile({
    ctx,
    fileId: best.file_id,
    fileName: `photo-${best.file_unique_id}.jpg`,
    mimeType: "image/jpeg",
    telegramType: "photo",
    caption: ctx.message?.caption,
  });
  await handleDownloadedMedia(ctx, downloaded);
}

export async function handleVoiceMessage(ctx: Context): Promise<void> {
  const voice = ctx.message?.voice;
  if (!voice) return;

  const downloaded = await downloadTelegramFile({
    ctx,
    fileId: voice.file_id,
    fileName: `voice-${voice.file_unique_id}.ogg`,
    mimeType: voice.mime_type || "audio/ogg",
    telegramType: "voice",
    caption: ctx.message?.caption,
  });
  await handleDownloadedMedia(ctx, downloaded);
}

export async function handleAudioMessage(ctx: Context): Promise<void> {
  const audio = ctx.message?.audio;
  if (!audio) return;

  const downloaded = await downloadTelegramFile({
    ctx,
    fileId: audio.file_id,
    fileName: audio.file_name || `audio-${audio.file_unique_id}.mp3`,
    mimeType: audio.mime_type || "audio/mpeg",
    telegramType: "audio",
    caption: ctx.message?.caption,
  });
  await handleDownloadedMedia(ctx, downloaded);
}

export async function handleDocumentMessage(ctx: Context): Promise<void> {
  const doc = ctx.message?.document;
  if (!doc) return;

  const downloaded = await downloadTelegramFile({
    ctx,
    fileId: doc.file_id,
    fileName: doc.file_name || `file-${doc.file_unique_id}`,
    mimeType: doc.mime_type,
    telegramType: "document",
    caption: ctx.message?.caption,
  });
  await handleDownloadedMedia(ctx, downloaded);
}
