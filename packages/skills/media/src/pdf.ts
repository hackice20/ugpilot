import pdfParse from "pdf-parse";
import { createLogger } from "@ugpilot/logger";
import { truncate } from "./truncate.js";

const log = createLogger("skills:media:pdf");

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
