import { createLogger } from "@ugpilot/logger";
import { openaiClient } from "./client.js";
import { truncate } from "./truncate.js";

const log = createLogger("skills:media:audio");

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
