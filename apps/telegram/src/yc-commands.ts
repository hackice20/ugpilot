import type { Bot } from "grammy";
import {
  getUserProfile,
  upsertUserProfile,
  createMailDraft,
  getActiveMailCredentials,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import {
  findYcCompanies,
  buildYcOutreachPrompt,
} from "@ugpilot/agents-placement";
import { chatWithLlm } from "./llm.js";
import { splitTelegramMessage } from "./split-message.js";

const log = createLogger("telegram:yc");

function requireUserId(ctx: { from?: { id: number } }): number | null {
  return ctx.from?.id ?? null;
}

export function registerYcCommands(bot: Bot) {
  bot.command("profile", async (ctx) => {
    const userId = requireUserId(ctx);
    if (!userId) return;
    const raw = (ctx.match?.toString() ?? "").trim();

    if (!raw || raw === "show") {
      const profile = await getUserProfile(userId);
      if (!profile) {
        await ctx.reply(
          "No profile yet.\n/profile set name=Your Name | role=Product Engineer | blurb=I built X, Y, Z",
        );
        return;
      }
      await ctx.reply(
        [
          `Name: ${profile.display_name ?? "-"}`,
          `Role: ${profile.target_role ?? "-"}`,
          `Blurb:\n${profile.resume_blurb ?? "-"}`,
        ].join("\n"),
      );
      return;
    }

    if (raw.startsWith("set ")) {
      const body = raw.slice(4);
      const parts = Object.fromEntries(
        body.split("|").map((p) => {
          const [k, ...rest] = p.trim().split("=");
          return [k?.trim().toLowerCase(), rest.join("=").trim()];
        }),
      ) as Record<string, string>;

      const profile = await upsertUserProfile({
        telegramUserId: userId,
        displayName: parts.name,
        targetRole: parts.role,
        resumeBlurb: parts.blurb,
      });
      await ctx.reply(
        `Profile saved.\nName: ${profile.display_name}\nRole: ${profile.target_role}`,
      );
      return;
    }

    await ctx.reply(
      "Usage:\n/profile show\n/profile set name=... | role=... | blurb=...",
    );
  });

  bot.command("yc", async (ctx) => {
    const userId = requireUserId(ctx);
    if (!userId) return;

    const raw = (ctx.match?.toString() ?? "").trim();
    const [action, ...rest] = raw.split(/\s+/);
    const query = rest.join(" ").trim();

    if (!action || action === "help") {
      await ctx.reply(
        [
          "YC job outreach (free SearXNG + drafts)",
          "",
          "/profile set name=... | role=... | blurb=...",
          "/yc find <query>   — list YC-ish companies",
          "/yc draft <query>  — drafts founder emails (approve to send)",
          "",
          "Then: /drafts → /approve <id>",
        ].join("\n"),
      );
      return;
    }

    if (!query) {
      await ctx.reply("Usage: /yc find|draft <query>");
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      const { hits, rawForLlm } = await findYcCompanies(query, 8);
      log.info("command.yc", { userId, action, query, hits: hits.length });

      if (action === "find") {
        if (hits.length === 0) {
          await ctx.reply("No results. Try a narrower query.");
          return;
        }
        const text = hits
          .map((h, i) => `${i + 1}. ${h.name}\n   ${h.url}\n   ${h.blurb.slice(0, 160)}`)
          .join("\n\n");
        for (const part of splitTelegramMessage(text)) await ctx.reply(part);
        return;
      }

      if (action === "draft") {
        const profile = await getUserProfile(userId);
        const prompt = buildYcOutreachPrompt({
          companyQuery: query,
          searchRaw: rawForLlm,
          profile: {
            displayName: profile?.display_name,
            targetRole: profile?.target_role,
            resumeBlurb: profile?.resume_blurb,
          },
        });

        const result = await chatWithLlm(prompt, [], { enableTools: false });

        // Best-effort: ask model again is heavy; store one combined draft packet
        // and also try to parse simple "To:" lines if present.
        const creds = await getActiveMailCredentials(userId);
        const parsed = parseDraftBlocks(result.content);
        if (parsed.length === 0) {
          const draft = await createMailDraft({
            telegramUserId: userId,
            mailAccountId: creds?.id,
            toEmail: "NEED_EMAIL@example.com",
            subject: `YC outreach: ${query}`,
            body: result.content,
            meta: { query, source: "yc.draft" },
          });
          for (const part of splitTelegramMessage(
            `${result.content}\n\nSaved as draft #${draft.id} (edit To before approve).\n/approve ${draft.id}`,
          )) {
            await ctx.reply(part);
          }
          return;
        }

        const ids: string[] = [];
        for (const d of parsed.slice(0, 5)) {
          const row = await createMailDraft({
            telegramUserId: userId,
            mailAccountId: creds?.id,
            toEmail: d.to,
            subject: d.subject,
            body: d.body,
            meta: { query, company: d.company, source: "yc.draft" },
          });
          ids.push(row.id);
        }

        for (const part of splitTelegramMessage(
          `${result.content}\n\nDrafts: ${ids.map((id) => `#${id}`).join(", ")}\n/drafts then /approve <id>`,
        )) {
          await ctx.reply(part);
        }
        return;
      }

      await ctx.reply("Unknown /yc action. Try /yc help");
    } catch (err) {
      log.error("command.yc_failed", err, { userId, action, query });
      await ctx.reply("YC command failed. Is SearXNG up?");
    }
  });
}

function parseDraftBlocks(
  text: string,
): Array<{ company?: string; to: string; subject: string; body: string }> {
  const blocks = text.split(/\n(?=\d+\.\s)/);
  const out: Array<{
    company?: string;
    to: string;
    subject: string;
    body: string;
  }> = [];

  for (const block of blocks) {
    const to =
      block.match(/To:\s*([^\n]+)/i)?.[1]?.trim() ||
      block.match(/([\w.+-]+@[\w.-]+\.\w+)/)?.[1];
    const subject = block.match(/Subject:\s*([^\n]+)/i)?.[1]?.trim();
    const bodyMatch =
      block.match(/Body:\s*([\s\S]+)/i) ||
      block.match(/Email:\s*([\s\S]+)/i);
    if (!to || !subject || !bodyMatch?.[1]) continue;
    if (to.toUpperCase().includes("NEED_EMAIL")) continue;
    out.push({
      to,
      subject,
      body: bodyMatch[1].trim(),
      company: block.match(/Company:\s*([^\n]+)/i)?.[1]?.trim(),
    });
  }
  return out;
}
