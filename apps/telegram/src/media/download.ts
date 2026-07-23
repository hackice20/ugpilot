import type { Context } from "grammy";
import { env } from "../env.js";
import type {
  DownloadedTelegramFile,
  TelegramFileKind,
} from "../types/media.js";

export async function downloadTelegramFile(input: {
  ctx: Context;
  fileId: string;
  fileName: string;
  mimeType?: string;
  telegramType: TelegramFileKind;
  caption?: string;
}): Promise<DownloadedTelegramFile> {
  const maxBytes = env.maxMediaBytes();
  const file = await input.ctx.api.getFile(input.fileId);

  if (!file.file_path) throw new Error("Telegram file_path missing");
  if (file.file_size && file.file_size > maxBytes) {
    throw new Error(
      `File too large (${file.file_size} bytes). Max ${maxBytes}.`,
    );
  }

  const token = env.telegramBotToken();
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    fileName: input.fileName,
    mimeType: input.mimeType,
    telegramFileId: input.fileId,
    telegramType: input.telegramType,
    caption: input.caption,
  };
}
