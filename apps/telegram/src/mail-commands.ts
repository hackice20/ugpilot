import type { Context } from "grammy";
import {
  upsertMailAccount,
  listMailAccounts,
  setActiveMailAccount,
  removeMailAccount,
  getActiveMailCredentials,
  createMailDraft,
  listPendingDrafts,
  getMailDraft,
  markDraftSent,
  cancelMailDraft,
  type MailProvider,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import {
  fetchImportantMail,
  countNoiseMail,
  verifyMailbox,
  sendMail,
  formatInboxList,
  type MailboxConfig,
} from "@ugpilot/skills-email";
import { chatWithLlm } from "./llm.js";
import { splitTelegramMessage } from "./split-message.js";

const log = createLogger("telegram:mail");

type LinkState =
  | { step: "email"; slot: 1 | 2; provider: MailProvider }
  | { step: "password"; slot: 1 | 2; provider: MailProvider; email: string };

const linkState = new Map<number, LinkState>();

function toConfig(
  c: NonNullable<Awaited<ReturnType<typeof getActiveMailCredentials>>>,
): MailboxConfig {
  return {
    email: c.email,
    provider: c.provider,
    imapHost: c.imapHost,
    imapPort: c.imapPort,
    smtpHost: c.smtpHost,
    smtpPort: c.smtpPort,
    username: c.username,
    password: c.password,
  };
}

function userId(ctx: Context): number | null {
  return ctx.from?.id ?? null;
}

export function isMailLinkPending(telegramUserId: number): boolean {
  return linkState.has(telegramUserId);
}

export async function handleMailLinkMessage(ctx: Context): Promise<boolean> {
  const uid = userId(ctx);
  const text = ctx.message?.text?.trim();
  if (!uid || !text) return false;

  const state = linkState.get(uid);
  if (!state) return false;

  if (state.step === "email") {
    if (!text.includes("@")) {
      await ctx.reply(
        "That doesn't look like an email. Send the address or /mail cancel",
      );
      return true;
    }
    linkState.set(uid, {
      step: "password",
      slot: state.slot,
      provider: state.provider,
      email: text.toLowerCase(),
    });
    await ctx.reply(
      `Got ${text}.\nNow send the app password.\nI'll try to delete that message after saving.`,
    );
    return true;
  }

  const password = text.replace(/\s+/g, "");
  try {
    const cfg: MailboxConfig = {
      email: state.email,
      provider: state.provider,
      imapHost:
        state.provider === "gmail" ? "imap.gmail.com" : "outlook.office365.com",
      imapPort: 993,
      smtpHost:
        state.provider === "gmail" ? "smtp.gmail.com" : "smtp.office365.com",
      smtpPort: state.provider === "gmail" ? 465 : 587,
      username: state.email,
      password,
    };

    await verifyMailbox(cfg);
    await upsertMailAccount({
      telegramUserId: uid,
      slot: state.slot,
      email: state.email,
      password,
      provider: state.provider,
      makeActive: true,
    });
    linkState.delete(uid);

    if (ctx.chat?.id && ctx.message?.message_id) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
      } catch {
        await ctx.reply(
          "(Could not delete password message — delete it manually.)",
        );
      }
    }

    await ctx.reply(
      `Linked slot ${state.slot}: ${state.email} (active).\nTry /inbox or /digest`,
    );
  } catch (err) {
    log.error("mail.link_failed", err, { userId: uid, email: state.email });
    linkState.delete(uid);
    await ctx.reply(
      "IMAP login failed. Check app password / IMAP, then /mail add again.",
    );
  }
  return true;
}

/** Strip LLM chat leftovers that must never go out over SMTP. */
function scrubEmailBody(body: string): string {
  let text = body.replace(/\r/g, "").trim();

  // Cut at common assistant follow-ups / offers
  const cutPatterns = [
    /\n\s*Would you like\b[\s\S]*$/i,
    /\n\s*Do you want\b[\s\S]*$/i,
    /\n\s*Should I\b[\s\S]*$/i,
    /\n\s*I can (also |tailor|revise|adjust|send|draft)\b[\s\S]*$/i,
    /\n\s*Let me know\b[\s\S]*$/i,
    /\n\s*If you('d| would) like\b[\s\S]*$/i,
    /\n\s*Want me to\b[\s\S]*$/i,
    /\n\s*---+\s*\n[\s\S]*$/i,
    /\n\s*Drafts?:[\s\S]*$/i,
    /\n\s*\/approve[\s\S]*$/i,
    /\n\s*\/send[\s\S]*$/i,
    /\n\s*Reply to[\s\S]*$/i,
  ];

  for (const re of cutPatterns) {
    text = text.replace(re, "").trim();
  }

  // If multiple drafts numbered, keep first only
  text = text.split(/\n(?=\d+\.\s)/)[0]?.trim() ?? text;

  return text.trim();
}

function parseEmailDraft(text: string): {
  to: string;
  subject: string;
  body: string;
} | null {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return null;

  // Prefer explicit To: line (avoid picking random emails in the body)
  const toLine = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2})(?:To|Recipient|Email\s*to)(?:\*{0,2})\s*[:\-]\s*<?\s*([^\s<>\n]+@[^\s<>\n]+)\s*>?/i,
  );
  const to = toLine?.[1]?.trim();
  if (!to || !to.includes("@")) return null;
  if (to.includes("NEED_EMAIL") || to.includes("example.com")) return null;

  const subjectMatch = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2})Subject(?:\*{0,2})\s*[:\-]\s*(.+)$/im,
  );
  const subject = subjectMatch?.[1]?.trim();
  if (!subject) return null;

  let body = "";
  const bodyMatch = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2})(?:Body|Message|Email(?:\s*body)?)(?:\*{0,2})\s*[:\-]\s*\n?([\s\S]+)/i,
  );
  if (bodyMatch?.[1]) {
    body = bodyMatch[1];
  } else if (subjectMatch?.index != null) {
    body = cleaned.slice(subjectMatch.index + subjectMatch[0].length);
  }

  body = scrubEmailBody(body);
  if (!body) return null;

  return { to, subject, body };
}

type PendingSend = {
  to: string;
  subject: string;
  body: string;
  source: string;
  createdAt: number;
};

const pendingSends = new Map<number, PendingSend>();

function resolveSendPayload(ctx: Context): {
  to: string;
  subject: string;
  body: string;
  source: string;
} | null {
  const raw = (ctx.match?.toString() ?? "").trim();
  const replyText =
    ctx.message?.reply_to_message?.text ||
    ctx.message?.reply_to_message?.caption ||
    "";

  if (replyText) {
    const parsed = parseEmailDraft(replyText);
    if (!parsed) return null;

    if (raw.includes("@") && !raw.includes("|")) {
      return {
        ...parsed,
        to: raw.trim(),
        body: scrubEmailBody(parsed.body),
        source: "reply.override_to",
      };
    }
    return { ...parsed, body: scrubEmailBody(parsed.body), source: "reply" };
  }

  if (raw.includes("|")) {
    const parts = raw.split("|").map((p) => p.trim());
    const to = parts[0];
    const subject = parts[1];
    const body = scrubEmailBody(parts.slice(2).join("|").trim());
    if (to?.includes("@") && subject && body) {
      return { to, subject, body, source: "pipe" };
    }
  }

  return null;
}

export function registerMailCommands(bot: {
  command: (
    command: string,
    middleware: (ctx: Context) => Promise<void>,
  ) => void;
}) {
  bot.command("mail", async (ctx) => {
    const uid = userId(ctx);
    if (!uid) return;
    const raw = (ctx.match?.toString() ?? "").trim();
    const [action, a1, a2] = raw.split(/\s+/);

    if (!action || action === "help") {
      await ctx.reply(
        [
          "Mail (2 accounts, free IMAP/SMTP)",
          "",
          "/mail list",
          "/mail add 1 gmail",
          "/mail add 2 outlook",
          "/mail use 1|2",
          "/mail remove 1|2",
          "/mail cancel",
          "",
          "/inbox [n]",
          "/digest",
          "/send — reply to a draft, then /confirm",
          "/confirm — actually send the queued mail",
          "/drafts",
          "/approve <id>",
          "/reject <id>",
          "",
          "Gmail: 2FA → App Password. Delete password msgs after linking.",
        ].join("\n"),
      );
      return;
    }

    if (action === "cancel") {
      linkState.delete(uid);
      await ctx.reply("Mail linking cancelled.");
      return;
    }

    if (action === "list") {
      const accounts = await listMailAccounts(uid);
      if (!accounts.length) {
        await ctx.reply("No mailboxes. /mail add 1 gmail");
        return;
      }
      await ctx.reply(
        accounts
          .map(
            (a) =>
              `${a.is_active ? "➤" : " "} slot ${a.slot}: ${a.email} (${a.provider})`,
          )
          .join("\n"),
      );
      return;
    }

    if (action === "use") {
      const slot = Number(a1) as 1 | 2;
      if (slot !== 1 && slot !== 2) {
        await ctx.reply("Usage: /mail use 1|2");
        return;
      }
      const account = await setActiveMailAccount(uid, slot);
      await ctx.reply(
        account
          ? `Active mailbox: ${account.email}`
          : `No mailbox in slot ${slot}.`,
      );
      return;
    }

    if (action === "remove") {
      const slot = Number(a1) as 1 | 2;
      if (slot !== 1 && slot !== 2) {
        await ctx.reply("Usage: /mail remove 1|2");
        return;
      }
      const ok = await removeMailAccount(uid, slot);
      await ctx.reply(ok ? `Removed slot ${slot}.` : `Nothing in slot ${slot}.`);
      return;
    }

    if (action === "add") {
      const slot = Number(a1) as 1 | 2;
      const provider = (a2 || "gmail").toLowerCase() as MailProvider;
      if (slot !== 1 && slot !== 2) {
        await ctx.reply("Usage: /mail add 1|2 [gmail|outlook]");
        return;
      }
      if (provider !== "gmail" && provider !== "outlook") {
        await ctx.reply("Provider must be gmail or outlook.");
        return;
      }
      linkState.set(uid, { step: "email", slot, provider });
      await ctx.reply(
        `Linking slot ${slot} (${provider}).\nSend the email address next.`,
      );
      return;
    }

    await ctx.reply("Unknown /mail action. Try /mail help");
  });

  bot.command("inbox", async (ctx) => {
    const uid = userId(ctx);
    if (!uid) return;
    const n = Math.min(Number(ctx.match?.toString().trim() || 10) || 10, 25);
    const creds = await getActiveMailCredentials(uid);
    if (!creds) {
      await ctx.reply("No active mailbox. /mail add 1 gmail");
      return;
    }
    await ctx.replyWithChatAction("typing");
    try {
      const messages = await fetchImportantMail(toConfig(creds), {
        limit: n,
        days: 5,
      });
      for (const part of splitTelegramMessage(
        `Inbox (${creds.email})\n\n${formatInboxList(messages)}`,
      )) {
        await ctx.reply(part);
      }
    } catch (err) {
      log.error("command.inbox_failed", err, { userId: uid });
      await ctx.reply("Could not read inbox. Check app password / IMAP.");
    }
  });

  bot.command("digest", async (ctx) => {
    const uid = userId(ctx);
    if (!uid) return;
    const creds = await getActiveMailCredentials(uid);
    if (!creds) {
      await ctx.reply("No active mailbox. /mail add 1 gmail");
      return;
    }
    await ctx.replyWithChatAction("typing");
    try {
      const cfg = toConfig(creds);
      const [important, noise] = await Promise.all([
        fetchImportantMail(cfg, { limit: 20, days: 3 }),
        countNoiseMail(cfg, 3).catch(() => ({
          promotions: 0,
          social: 0,
          updates: 0,
        })),
      ]);
      const skipped = `Skipped (approx): promotions=${noise.promotions ?? 0}, social=${noise.social ?? 0}, updates=${noise.updates ?? 0}`;
      if (!important.length) {
        await ctx.reply(
          `Digest for ${creds.email}\n\nNo primary mail.\n${skipped}`,
        );
        return;
      }
      const list = important
        .map(
          (m, i) =>
            `${i + 1}. From: ${m.from}\n   Subject: ${m.subject}\n   Date: ${m.date ?? "?"}`,
        )
        .join("\n\n");
      const result = await chatWithLlm(
        `Create an email digest. These are Primary/important only.\n\n${skipped}\n\nFor EACH message: one short line (who + what + urgency low/med/high).\n\nMessages:\n${list}`,
        [],
        { enableTools: false },
      );
      for (const part of splitTelegramMessage(
        `Digest — ${creds.email}\n\n${result.content}\n\n${skipped}`,
      )) {
        await ctx.reply(part);
      }
    } catch (err) {
      log.error("command.digest_failed", err, { userId: uid });
      await ctx.reply("Digest failed.");
    }
  });

  bot.command("send", async (ctx) => {
    const uid = userId(ctx);
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

    const preview = [
      `From: ${creds.email}`,
      `To: ${payload.to}`,
      `Subject: ${payload.subject}`,
      "",
      payload.body,
      "",
      "Looks right? /confirm to send  |  /cancel send to abort",
    ].join("\n");

    for (const part of splitTelegramMessage(preview)) {
      await ctx.reply(part);
    }
  });

  bot.command("confirm", async (ctx) => {
    const uid = userId(ctx);
    if (!uid) return;

    const pending = pendingSends.get(uid);
    if (!pending) {
      await ctx.reply("Nothing queued. Reply to a draft with /send first.");
      return;
    }
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
      pendingSends.delete(uid);
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

      await sendMail(toConfig(creds), { to, subject, text: body });
      await markDraftSent(uid, draft.id);
      pendingSends.delete(uid);

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
  });

  bot.command("cancel", async (ctx) => {
    const uid = userId(ctx);
    if (!uid) return;
    const arg = (ctx.match?.toString() ?? "").trim().toLowerCase();
    if (arg === "send" || pendingSends.has(uid)) {
      pendingSends.delete(uid);
      await ctx.reply("Queued send cancelled.");
      return;
    }
    // fall through for mail link cancel handled elsewhere — keep simple
    if (linkState.has(uid)) {
      linkState.delete(uid);
      await ctx.reply("Mail linking cancelled.");
      return;
    }
    await ctx.reply("Nothing to cancel.");
  });

  bot.command("drafts", async (ctx) => {
    const uid = userId(ctx);
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
    for (const part of splitTelegramMessage(text)) await ctx.reply(part);
  });

  bot.command("approve", async (ctx) => {
    const uid = userId(ctx);
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
    if (draft.to_email.includes("NEED_EMAIL") || draft.to_email.includes("example.com")) {
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
      await sendMail(toConfig(creds), {
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
  });

  bot.command("reject", async (ctx) => {
    const uid = userId(ctx);
    if (!uid) return;
    const id = ctx.match?.toString().trim();
    if (!id) {
      await ctx.reply("Usage: /reject <draftId>");
      return;
    }
    const row = await cancelMailDraft(uid, id);
    await ctx.reply(row ? `Cancelled draft #${id}` : "Draft not found.");
  });
}

export { createMailDraft };
