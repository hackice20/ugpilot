import OpenAI from "openai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { createLogger } from "@ugpilot/logger";

const log = createLogger("skills:media");

export type MediaKind = "image" | "audio" | "voice" | "pdf" | "docx" | "other";

const MAX_TEXT_CHARS = Number(process.env.MEDIA_MAX_TEXT_CHARS ?? 14_000);

function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

function truncate(text: string, max = MAX_TEXT_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[truncated ${t.length - max} chars]`;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const started = Date.now();
  const result = await pdfParse(buffer);
  const text = truncate(result.text || "");
  log.info("media.pdf", {
    pages: result.numpages,
    chars: text.length,
    latencyMs: Date.now() - started,
  });
  return text || "(PDF had no extractable text)";
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const started = Date.now();
  const result = await mammoth.extractRawText({ buffer });
  const text = truncate(result.value || "");
  log.info("media.docx", {
    chars: text.length,
    latencyMs: Date.now() - started,
  });
  return text || "(DOCX had no extractable text)";
}

/** Transcribe voice/audio via OpenAI Whisper (no local ffmpeg). */
export async function transcribeAudio(input: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<string> {
  const started = Date.now();
  const client = openaiClient();
  const file = new File([input.buffer], input.filename, {
    type: input.mimeType || "audio/ogg",
  });

  const result = await client.audio.transcriptions.create({
    file,
    model: process.env.WHISPER_MODEL || "whisper-1",
  });

  const text = truncate(result.text || "");
  log.info("media.audio", {
    filename: input.filename,
    chars: text.length,
    latencyMs: Date.now() - started,
  });
  return text || "(empty transcription)";
}

/** Describe an image with a vision-capable model; stored as text context. */
export async function describeImage(input: {
  buffer: Buffer;
  mimeType?: string;
  caption?: string;
}): Promise<string> {
  const started = Date.now();
  const client = openaiClient();
  const mime = input.mimeType || "image/jpeg";
  const b64 = input.buffer.toString("base64");
  const visionModel =
    process.env.VISION_MODEL || process.env.LLM_MODEL || "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model: visionModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Describe this image for later chat context. Include any readable text (OCR), layout, and key details. Be concrete. " +
              (input.caption ? `User caption: ${input.caption}` : ""),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${b64}`,
            },
          },
        ],
      },
    ],
  });

  const text = truncate(
    completion.choices[0]?.message?.content?.trim() || "",
  );
  log.info("media.image", {
    model: visionModel,
    chars: text.length,
    latencyMs: Date.now() - started,
  });
  return text || "(no image description)";
}

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

export async function extractMediaContext(input: {
  kind: MediaKind;
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  caption?: string;
}): Promise<{ extractedText: string; label: string }> {
  switch (input.kind) {
    case "pdf": {
      const extractedText = await extractPdfText(input.buffer);
      return {
        label: `Attached PDF: ${input.fileName}`,
        extractedText,
      };
    }
    case "docx": {
      const extractedText = await extractDocxText(input.buffer);
      return {
        label: `Attached DOCX: ${input.fileName}`,
        extractedText,
      };
    }
    case "image": {
      const extractedText = await describeImage({
        buffer: input.buffer,
        mimeType: input.mimeType,
        caption: input.caption,
      });
      return {
        label: `Attached image: ${input.fileName}`,
        extractedText,
      };
    }
    case "audio":
    case "voice": {
      const extractedText = await transcribeAudio({
        buffer: input.buffer,
        filename: input.fileName,
        mimeType: input.mimeType,
      });
      return {
        label:
          input.kind === "voice"
            ? `Voice note: ${input.fileName}`
            : `Audio: ${input.fileName}`,
        extractedText,
      };
    }
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
  const parts = [
    `[${input.label}]`,
    input.caption ? `Caption: ${input.caption}` : null,
    "--- content ---",
    input.extractedText,
  ].filter(Boolean);
  return parts.join("\n");
}
