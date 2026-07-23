import type { MediaKind } from "./types.js";

export function detectKind(input: {
  mimeType?: string;
  fileName?: string;
  telegramType: "photo" | "voice" | "audio" | "document";
}): MediaKind {
  if (input.telegramType === "photo") return "image";
  if (input.telegramType === "voice") return "voice";
  if (input.telegramType === "audio") return "audio";

  const name = (input.fileName || "").toLowerCase();
  const mime = (input.mimeType || "").toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    return "docx";
  }
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}
