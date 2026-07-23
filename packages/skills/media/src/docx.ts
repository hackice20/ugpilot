import mammoth from "mammoth";
import { createLogger } from "@ugpilot/logger";
import { truncate } from "./truncate.js";

const log = createLogger("skills:media:docx");

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
