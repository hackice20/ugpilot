import type { Context } from "grammy";
import {
  getUserProfile,
  createMailDraft,
  getActiveMailCredentials,
  getRecentAttachmentContext,
} from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import {
  findYcCompanies,
  scrapeYcCompanies,
  buildYcOutreachPrompt,
} from "@ugpilot/agents-yc";
import { chatWithLlm } from "../../llm/index.js";
import { ensureChat, getTelegramUserId, replyLong } from "../../lib/index.js";
import { parseEmailDraftBlocks } from "../../mail/parse-draft.js";

const log = createLogger("telegram:yc");

const HELP = [
  "YC job outreach (SearXNG + free site scrape + drafts)",
  "",
  "/profile set name=... | role=... | blurb=...",
  "Attach resume PDF anytime before drafting",
  "/yc find <query>   — list YC-ish companies",
  "/yc draft <query>  — scrape sites + draft emails (approve to send)",
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
    const { hits } = await findYcCompanies(query, 8);
    log.info("command.yc", { userId, action, query, hits: hits.length });

    if (action === "find") {
      await handleFind(ctx, hits);
      return;
    }

    if (action === "draft") {
      await handleDraft(ctx, userId, query, hits);
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
  hits: Array<{ name: string; url: string; blurb: string }>,
): Promise<void> {
  if (hits.length === 0) {
    await ctx.reply("No results to draft against. Try a narrower query.");
    return;
  }

  await ctx.reply(`Found ${hits.length}. Scraping sites (free fetch)...`);
  await ctx.replyWithChatAction("typing");

  const companies = await scrapeYcCompanies(hits, 5);
  const profile = await getUserProfile(userId);
  const chat = await ensureChat(ctx);
  const resumeAttached = await loadAttachedResume(chat.id);

  const prompt = buildYcOutreachPrompt({
    companyQuery: query,
    companies,
    profile: {
      displayName: profile?.display_name,
      targetRole: profile?.target_role,
      resumeBlurb: profile?.resume_blurb,
      resumeAttached,
    },
  });

  const result = await chatWithLlm(prompt, [], {
    enableTools: false,
    systemPrompt: YC_DRAFT_SYSTEM_PROMPT,
  });
  const content = stripLongDashes(result.content);
  const creds = await getActiveMailCredentials(userId);
  const parsed = parseEmailDraftBlocks(content);

  if (parsed.length === 0) {
    const draft = await createMailDraft({
      telegramUserId: userId,
      mailAccountId: creds?.id,
      toEmail: "NEED_EMAIL@example.com",
      subject: `YC outreach: ${query}`,
      body: content,
      meta: { query, source: "yc.draft", scraped: companies.length },
    });

    await replyLong(
      ctx,
      `${content}\n\nSaved as draft #${draft.id} (edit To before approve).\n/approve ${draft.id}`,
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
      meta: {
        query,
        company: d.company,
        source: "yc.draft",
        scraped: companies.length,
      },
    });
    ids.push(row.id);
  }

  await replyLong(
    ctx,
    `${content}\n\nDrafts: ${ids.map((id) => `#${id}`).join(", ")}\n/drafts then /approve <id>`,
  );
}

const YC_DRAFT_SYSTEM_PROMPT = `You draft short cold emails for Yash.

Hard rules:
- NEVER tell a company what their own product is. No "you build X", no About-page paraphrase.
- Scrape/context is private. Use it only to choose what to offer.
- First line after greeting = deliverable only ("I can build/ship you ...").
- Max 5 sentences or 100 words. Bullets for concrete ships.
- Greeting: hey / hello / hi / yo. Sign-off: - yash
- No unicode long dashes. No fluff. Follow the user format exactly.`;

function stripLongDashes(text: string): string {
  return text.replace(/[\u2014\u2013\u2012\u2015]/g, "-");
}

async function loadAttachedResume(chatId: string): Promise<string | null> {
  const attachments = await getRecentAttachmentContext(chatId, 8);
  const docs = attachments.filter(
    (a) =>
      (a.kind === "pdf" || a.kind === "docx") &&
      a.extractedText.trim().length > 80,
  );
  if (docs.length === 0) return null;

  // Prefer a file that looks like a resume; else most recent doc.
  const resumeish =
    docs.find((a) => /resume|cv|curriculum/i.test(a.fileName)) ??
    docs[docs.length - 1];

  if (!resumeish) return null;
  return `[Attached ${resumeish.fileName}]\n${resumeish.extractedText.slice(0, 12_000)}`;
}
