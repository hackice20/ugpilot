import type { Context } from "grammy";
import {
  listPendingDrafts,
  getMailDraft,
  markDraftSent,
  cancelMailDraft,
  getActiveMailCredentials,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { sendMail } from "@ugpilot/skills-email";
import { getTelegramUserId, replyLong } from "../../lib/index.js";
import { mailboxConfigFromCreds } from "../mailbox.js";
import { isPlaceholderRecipient } from "../scrub.js";

const log = createLogger("telegram:mail:drafts");

export async function handleDraftsCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const drafts = await listPendingDrafts(uid, 10);
  if (!drafts.length) {
    await ctx.reply("No pending drafts. /yc draft <query>");
    return;
  }

  const text = drafts
    .map(
      (d) =>
        `#${d.id} → ${d.to_email}\n  ${d.subject}\n  /approve ${d.id}  |  /reject ${d.id}`,
    )
    .join("\n\n");

  await replyLong(ctx, text);
}

export async function handleApproveCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const id = ctx.match?.toString().trim();
  if (!id) {
    await ctx.reply("Usage: /approve <draftId>");
    return;
  }

  const draft = await getMailDraft(uid, id);
  if (!draft || draft.status !== "pending") {
    await ctx.reply("Draft not found or not pending.");
    return;
  }

  if (isPlaceholderRecipient(draft.to_email)) {
    await ctx.reply("Draft has no real recipient. Reject and recreate.");
    return;
  }

  const creds = await getActiveMailCredentials(uid);
  if (!creds) {
    await ctx.reply("No active mailbox.");
    return;
  }

  await ctx.replyWithChatAction("typing");
  try {
    await sendMail(mailboxConfigFromCreds(creds), {
      to: draft.to_email,
      subject: draft.subject,
      text: draft.body,
    });
    await markDraftSent(uid, id);
    await ctx.reply(`Sent from ${creds.email} → ${draft.to_email}`);
  } catch (err) {
    log.error("command.approve_failed", err, { userId: uid, draftId: id });
    await ctx.reply("Send failed. Draft still pending.");
  }
}

export async function handleRejectCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const id = ctx.match?.toString().trim();
  if (!id) {
    await ctx.reply("Usage: /reject <draftId>");
    return;
  }

  const row = await cancelMailDraft(uid, id);
  await ctx.reply(row ? `Cancelled draft #${id}` : "Draft not found.");
}
