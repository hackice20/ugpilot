import type { Context } from "grammy";
import {
  createMailDraft,
  getActiveMailCredentials,
  markDraftSent,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { sendMail } from "@ugpilot/skills-email";
import { PENDING_SEND_TTL_MS } from "../../constants.js";
import { getTelegramUserId, replyLong } from "../../lib/index.js";
import { mailboxConfigFromCreds } from "../mailbox.js";
import { resolveSendPayload } from "../resolve-send.js";
import {
  clearMailLink,
  clearPendingSend,
  mailLinkState,
  pendingSends,
} from "../state.js";

const log = createLogger("telegram:mail:send");

export async function handleSendCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const payload = resolveSendPayload(ctx);
  if (!payload) {
    await ctx.reply(
      "Reply to the draft (must have To / Subject / Body) with /send",
    );
    return;
  }

  const creds = await getActiveMailCredentials(uid);
  if (!creds) {
    await ctx.reply("No active mailbox. /mail add 1 gmail");
    return;
  }

  pendingSends.set(uid, { ...payload, createdAt: Date.now() });

  await replyLong(
    ctx,
    [
      `From: ${creds.email}`,
      `To: ${payload.to}`,
      `Subject: ${payload.subject}`,
      "",
      payload.body,
      "",
      "Looks right? /confirm to send  |  /cancel send to abort",
    ].join("\n"),
  );
}

export async function handleConfirmCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const pending = pendingSends.get(uid);
  if (!pending) {
    await ctx.reply("Nothing queued. Reply to a draft with /send first.");
    return;
  }

  if (Date.now() - pending.createdAt > PENDING_SEND_TTL_MS) {
    clearPendingSend(uid);
    await ctx.reply("Queued send expired. /send again.");
    return;
  }

  const creds = await getActiveMailCredentials(uid);
  if (!creds) {
    await ctx.reply("No active mailbox.");
    return;
  }

  const { to, subject, body, source } = pending;
  await ctx.replyWithChatAction("typing");

  try {
    const draft = await createMailDraft({
      telegramUserId: uid,
      mailAccountId: creds.id,
      toEmail: to,
      subject,
      body,
      meta: { source: `send.${source}` },
    });

    await sendMail(mailboxConfigFromCreds(creds), { to, subject, text: body });
    await markDraftSent(uid, draft.id);
    clearPendingSend(uid);

    log.info("command.confirm_send", {
      userId: uid,
      draftId: draft.id,
      from: creds.email,
      to,
      subject,
      source,
    });

    await ctx.reply(`Sent from ${creds.email} → ${to}`);
  } catch (err) {
    log.error("command.confirm_send_failed", err, { userId: uid, to });
    await ctx.reply("Send failed. Check mailbox / app password.");
  }
}

export async function handleCancelCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const arg = (ctx.match?.toString() ?? "").trim().toLowerCase();
  if (arg === "send" || pendingSends.has(uid)) {
    clearPendingSend(uid);
    await ctx.reply("Queued send cancelled.");
    return;
  }

  if (mailLinkState.has(uid)) {
    clearMailLink(uid);
    await ctx.reply("Mail linking cancelled.");
    return;
  }

  await ctx.reply("Nothing to cancel.");
}
