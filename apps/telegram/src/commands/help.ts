import type { Context } from "grammy";

export async function handleHelpCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    [
      "/search <query> — web search",
      "/mail help — mailboxes, digest, approve sends",
      "/send — reply to draft, then /confirm",
      "/files — list media held in context",
      "/inbox /digest — important mail",
      "/profile set name=… | role=… | blurb=…",
      "/yc find|draft <query> — YC outreach drafts",
      "/drafts /approve <id> /reject <id>",
      "/clear — wipe chat memory + attachments",
      "",
      "Media: PDF, DOCX, images, voice/audio (with optional caption).",
    ].join("\n"),
  );
}
