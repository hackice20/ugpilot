import type { Context } from "grammy";
import {
  getUserProfile,
  createMailDraft,
  getActiveMailCredentials,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import {
  findYcCompanies,
  buildYcOutreachPrompt,
} from "@ugpilot/agents-yc";
import { chatWithLlm } from "../../llm/index.js";
import { getTelegramUserId, replyLong } from "../../lib/index.js";
import { parseEmailDraftBlocks } from "../../mail/parse-draft.js";

const log = createLogger("telegram:yc");

const HELP = [
  "YC job outreach (free SearXNG + drafts)",
  "",
  "/profile set name=... | role=... | blurb=...",
  "/yc find <query>   — list YC-ish companies",
  "/yc draft <query>  — drafts founder emails (approve to send)",
  "",
  "Then: /drafts → /approve <id>",
].join("\n");

export async function handleYcCommand(ctx: Context): Promise<void> {
  const userId = getTelegramUserId(ctx);
  if (!userId) return;

  const raw = (ctx.match?.toString() ?? "").trim();
  const [action, ...rest] = raw.split(/\s+/);
  const query = rest.join(" ").trim();

  if (!action || action === "help") {
    await ctx.reply(HELP);
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
      await handleFind(ctx, hits);
      return;
    }

    if (action === "draft") {
      await handleDraft(ctx, userId, query, rawForLlm);
      return;
    }

    await ctx.reply("Unknown /yc action. Try /yc help");
  } catch (err) {
    log.error("command.yc_failed", err, { userId, action, query });
    await ctx.reply("YC command failed. Is SearXNG up?");
  }
}

async function handleFind(
  ctx: Context,
  hits: Array<{ name: string; url: string; blurb: string }>,
): Promise<void> {
  if (hits.length === 0) {
    await ctx.reply("No results. Try a narrower query.");
    return;
  }

  const text = hits
    .map(
      (h, i) =>
        `${i + 1}. ${h.name}\n   ${h.url}\n   ${h.blurb.slice(0, 160)}`,
    )
    .join("\n\n");

  await replyLong(ctx, text);
}

async function handleDraft(
  ctx: Context,
  userId: number,
  query: string,
  searchRaw: string,
): Promise<void> {
  const profile = await getUserProfile(userId);
  const prompt = buildYcOutreachPrompt({
    companyQuery: query,
    searchRaw,
    profile: {
      displayName: profile?.display_name,
      targetRole: profile?.target_role,
      resumeBlurb: profile?.resume_blurb,
    },
  });

  const result = await chatWithLlm(prompt, [], { enableTools: false });
  const creds = await getActiveMailCredentials(userId);
  const parsed = parseEmailDraftBlocks(result.content);

  if (parsed.length === 0) {
    const draft = await createMailDraft({
      telegramUserId: userId,
      mailAccountId: creds?.id,
      toEmail: "NEED_EMAIL@example.com",
      subject: `YC outreach: ${query}`,
      body: result.content,
      meta: { query, source: "yc.draft" },
    });

    await replyLong(
      ctx,
      `${result.content}\n\nSaved as draft #${draft.id} (edit To before approve).\n/approve ${draft.id}`,
    );
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

  await replyLong(
    ctx,
    `${result.content}\n\nDrafts: ${ids.map((id) => `#${id}`).join(", ")}\n/drafts then /approve <id>`,
  );
}
