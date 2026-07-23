import type { Context } from "grammy";
import { getActiveMailCredentials } from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { fetchImportantMail, countNoiseMail } from "@ugpilot/skills-email";
import { chatWithLlm } from "../../llm/index.js";
import { getTelegramUserId, replyLong } from "../../lib/index.js";
import { mailboxConfigFromCreds } from "../mailbox.js";

const log = createLogger("telegram:mail:digest");

export async function handleDigestCommand(ctx: Context): Promise<void> {
  const uid = getTelegramUserId(ctx);
  if (!uid) return;

  const creds = await getActiveMailCredentials(uid);
  if (!creds) {
    await ctx.reply("No active mailbox. /mail add 1 gmail");
    return;
  }

  await ctx.replyWithChatAction("typing");
  try {
    const cfg = mailboxConfigFromCreds(creds);
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

    await replyLong(
      ctx,
      `Digest — ${creds.email}\n\n${result.content}\n\n${skipped}`,
    );
  } catch (err) {
    log.error("command.digest_failed", err, { userId: uid });
    await ctx.reply("Digest failed.");
  }
}
