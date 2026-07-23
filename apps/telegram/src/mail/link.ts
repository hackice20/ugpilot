import type { Context } from "grammy";
import { upsertMailAccount } from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { verifyMailbox } from "@ugpilot/skills-email";
import { getTelegramUserId } from "../lib/telegram-user.js";
import { mailboxConfigForLink } from "./mailbox.js";
import { clearMailLink, mailLinkState } from "./state.js";

const log = createLogger("telegram:mail:link");

/** Continue the /mail add wizard from a free-text message. */
export async function handleMailLinkMessage(ctx: Context): Promise<boolean> {
  const uid = getTelegramUserId(ctx);
  const text = ctx.message?.text?.trim();
  if (!uid || !text) return false;

  const state = mailLinkState.get(uid);
  if (!state) return false;

  if (state.step === "email") {
    return handleEmailStep(ctx, uid, text, state);
  }

  return handlePasswordStep(ctx, uid, text, state);
}

async function handleEmailStep(
  ctx: Context,
  uid: number,
  text: string,
  state: Extract<
    NonNullable<ReturnType<typeof mailLinkState.get>>,
    { step: "email" }
  >,
): Promise<true> {
  if (!text.includes("@")) {
    await ctx.reply(
      "That doesn't look like an email. Send the address or /mail cancel",
    );
    return true;
  }

  mailLinkState.set(uid, {
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

async function handlePasswordStep(
  ctx: Context,
  uid: number,
  text: string,
  state: Extract<
    NonNullable<ReturnType<typeof mailLinkState.get>>,
    { step: "password" }
  >,
): Promise<true> {
  const password = text.replace(/\s+/g, "");

  try {
    const cfg = mailboxConfigForLink({
      email: state.email,
      provider: state.provider,
      password,
    });

    await verifyMailbox(cfg);
    await upsertMailAccount({
      telegramUserId: uid,
      slot: state.slot,
      email: state.email,
      password,
      provider: state.provider,
      makeActive: true,
    });
    clearMailLink(uid);

    await tryDeletePasswordMessage(ctx);
    await ctx.reply(
      `Linked slot ${state.slot}: ${state.email} (active).\nTry /inbox or /digest`,
    );
  } catch (err) {
    log.error("mail.link_failed", err, { userId: uid, email: state.email });
    clearMailLink(uid);
    await ctx.reply(
      "IMAP login failed. Check app password / IMAP, then /mail add again.",
    );
  }

  return true;
}

async function tryDeletePasswordMessage(ctx: Context): Promise<void> {
  if (!ctx.chat?.id || !ctx.message?.message_id) return;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch {
    await ctx.reply(
      "(Could not delete password message — delete it manually.)",
    );
  }
}
