import type { Context } from "grammy";
import type { ResolvedSendPayload } from "../types/mail.js";
import { parseEmailDraft } from "./parse-draft.js";
import { scrubEmailBody } from "./scrub.js";

/** Resolve `/send` payload from a reply-to draft or pipe args. */
export function resolveSendPayload(ctx: Context): ResolvedSendPayload | null {
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

    return {
      ...parsed,
      body: scrubEmailBody(parsed.body),
      source: "reply",
    };
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
