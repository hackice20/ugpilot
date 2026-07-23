import type { MediaKind } from "./types.js";
import { extractPdfText } from "./pdf.js";
import { extractDocxText } from "./docx.js";
import { describeImage } from "./image.js";
import { transcribeAudio } from "./audio.js";

export async function extractMediaContext(input: {
  kind: MediaKind;
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  caption?: string;
}): Promise<{ extractedText: string; label: string }> {
  switch (input.kind) {
    case "pdf":
      return {
        label: `Attached PDF: ${input.fileName}`,
        extractedText: await extractPdfText(input.buffer),
      };
    case "docx":
      return {
        label: `Attached DOCX: ${input.fileName}`,
        extractedText: await extractDocxText(input.buffer),
      };
    case "image":
      return {
        label: `Attached image: ${input.fileName}`,
        extractedText: await describeImage({
          buffer: input.buffer,
          mimeType: input.mimeType,
          caption: input.caption,
        }),
      };
    case "audio":
    case "voice":
      return {
        label:
          input.kind === "voice"
            ? `Voice note: ${input.fileName}`
            : `Audio: ${input.fileName}`,
        extractedText: await transcribeAudio({
          buffer: input.buffer,
          filename: input.fileName,
          mimeType: input.mimeType,
        }),
      };
    default:
      return {
        label: `Attached file: ${input.fileName}`,
        extractedText:
          "Unsupported file type for extraction. Ask the user to send PDF, DOCX, image, or audio.",
      };
  }
}

export function formatAttachmentMessage(input: {
  label: string;
  extractedText: string;
  caption?: string;
}): string {
  return [
    `[${input.label}]`,
    input.caption ? `Caption: ${input.caption}` : null,
    "--- content ---",
    input.extractedText,
  ]
    .filter(Boolean)
    .join("\n");
}
