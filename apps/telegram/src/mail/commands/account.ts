import type { Context } from "grammy";
import {
  listMailAccounts,
  setActiveMailAccount,
  removeMailAccount,
} from "@ugpilot/db";
import { getTelegramUserId } from "../../lib/telegram-user.js";
import { isMailProvider, isMailSlot } from "../mailbox.js";
import { clearMailLink, mailLinkState } from "../state.js";

const HELP = [
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
].join("\n");

export async function handleMailCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const raw = (ctx.match?.toString() ?? "").trim();
  const [action, a1, a2] = raw.split(/\s+/);

  if (!action || action === "help") {
    await ctx.reply(HELP);
    return;
  }

  if (action === "cancel") {
    clearMailLink(uid);
    await ctx.reply("Mail linking cancelled.");
    return;
  }

  if (action === "list") {
    await listAccounts(ctx, uid);
    return;
  }

  if (action === "use") {
    await useSlot(ctx, uid, a1);
    return;
  }

  if (action === "remove") {
    await removeSlot(ctx, uid, a1);
    return;
  }

  if (action === "add") {
    await startAdd(ctx, uid, a1, a2);
    return;
  }

  await ctx.reply("Unknown /mail action. Try /mail help");
}

async function listAccounts(ctx: Context, uid: number): Promise<void> {
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
}

async function useSlot(
  ctx: Context,
  uid: number,
  rawSlot: string | undefined,
): Promise<void> {
  const slot = Number(rawSlot);
  if (!isMailSlot(slot)) {
    await ctx.reply("Usage: /mail use 1|2");
    return;
  }

  const account = await setActiveMailAccount(uid, slot);
  await ctx.reply(
    account
      ? `Active mailbox: ${account.email}`
      : `No mailbox in slot ${slot}.`,
  );
}

async function removeSlot(
  ctx: Context,
  uid: number,
  rawSlot: string | undefined,
): Promise<void> {
  const slot = Number(rawSlot);
  if (!isMailSlot(slot)) {
    await ctx.reply("Usage: /mail remove 1|2");
    return;
  }

  const ok = await removeMailAccount(uid, slot);
  await ctx.reply(ok ? `Removed slot ${slot}.` : `Nothing in slot ${slot}.`);
}

async function startAdd(
  ctx: Context,
  uid: number,
  rawSlot: string | undefined,
  rawProvider: string | undefined,
): Promise<void> {
  const slot = Number(rawSlot);
  const provider = (rawProvider || "gmail").toLowerCase();

  if (!isMailSlot(slot)) {
    await ctx.reply("Usage: /mail add 1|2 [gmail|outlook]");
    return;
  }
  if (!isMailProvider(provider)) {
    await ctx.reply("Provider must be gmail or outlook.");
    return;
  }

  mailLinkState.set(uid, { step: "email", slot, provider });
  await ctx.reply(
    `Linking slot ${slot} (${provider}).\nSend the email address next.`,
  );
}
