import type { Context } from "grammy";
import { getActiveMailCredentials } from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { fetchImportantMail, formatInboxList } from "@ugpilot/skills-email";
import { getTelegramUserId, replyLong } from "../../lib/index.js";
import { mailboxConfigFromCreds } from "../mailbox.js";

const log = createLogger("telegram:mail:inbox");

export async function handleInboxCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const n = Math.min(Number(ctx.match?.toString().trim() || 10) || 10, 25);
  const creds = await getActiveMailCredentials(uid);
  if (!creds) {
    await ctx.reply("No active mailbox. /mail add 1 gmail");
    return;
  }

  await ctx.replyWithChatAction("typing");
  try {
    const messages = await fetchImportantMail(mailboxConfigFromCreds(creds), {
      limit: n,
      days: 5,
    });
    await replyLong(
      ctx,
      `Inbox (${creds.email})\n\n${formatInboxList(messages)}`,
    );
  } catch (err) {
    log.error("command.inbox_failed", err, { userId: uid });
    await ctx.reply("Could not read inbox. Check app password / IMAP.");
  }
}
