import type { MediaKind } from "@ugpilot/skills-media";

export type TelegramFileKind = "photo" | "voice" | "audio" | "document";

export type DownloadedTelegramFile = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  telegramFileId: string;
  telegramType: TelegramFileKind;
  caption?: string;
};

export type IngestMediaResult = {
  kind: MediaKind;
  contextMessage: string;
  attachmentId: string;
  shouldChat: boolean;
  userPrompt: string;
};
