import { createLogger } from "@ugpilot/logger";
import { openaiClient } from "./client.js";
import { truncate } from "./truncate.js";

const log = createLogger("skills:media:image");

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
