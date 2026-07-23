import type { Context } from "grammy";
import { ensureChat } from "../lib/ensure-chat.js";

export async function handleStartCommand(ctx: Context): Promise<void> {
  await ensureChat(ctx);
  await ctx.reply(
    [
      "Hey — I'm UGPilot.",
      "",
      "Chat normally. Send PDF / DOCX / images / voice — I'll keep them as context.",
      "",
      "/search /mail /inbox /digest /files",
      "/profile /yc /clear",
    ].join("\n"),
  );
}
