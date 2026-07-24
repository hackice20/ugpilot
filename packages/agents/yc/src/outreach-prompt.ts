import type { YcOutreachPromptInput } from "./types.js";

export function buildYcOutreachPrompt(input: YcOutreachPromptInput): string {
  const resume =
    input.profile.resumeAttached?.trim() ||
    input.profile.resumeBlurb?.trim() ||
    "(no resume yet - user may attach PDF next)";

  const companiesBlock = input.companies
    .map((c, i) => {
      return [
        `### Company ${i + 1}: ${c.name}`,
        `Search URL: ${c.url}`,
        `Scraped from: ${c.scrapeUrl}`,
        `Search blurb: ${c.blurb || "(none)"}`,
        `Website scrape (PRIVATE context only - NEVER restate this back to them):`,
        c.scrapedText || "(empty)",
      ].join("\n");
    })
    .join("\n\n");

  return `Write cold outreach emails for Yash.

Candidate:
- Name: ${input.profile.displayName || "Yash"}
- Target role: ${input.profile.targetRole || "(not set)"}
- Resume / proof (pull SPECIFIC projects from here):
${resume}

User query: ${input.companyQuery}

Scraped companies (for YOUR brain only):
${companiesBlock || "(no companies scraped)"}

CRITICAL RULES (break any = fail):

1. NEVER explain the company to the company.
   Banned patterns (instant fail):
   - "{company} is a ... company that builds/does..."
   - "I saw you build X / you help customers with Y"
   - paraphrasing their About page, tagline, or homepage back at them
   They already know what they do. Scrape = silent context so YOU pick the right offer.

2. FIRST sentence after greeting = only what Yash can DELIVER for them.
   Format: "I can build/ship you {specific thing(s) that fit their product}."
   Good: "I can build you agents for UGC generation, abandoned cart revival, and post-purchase upsells."
   Good: "I can ship a Discord + Telegram bot that onboards your B2B trial users in under a day."
   Bad: "Acme is a YC company that builds AI for ecommerce. I can..."
   Bad: "Excited about your mission / love what you're building / I'd love to contribute"

3. Body: max 5 sentences OR 100 words (whichever shorter). Prefer less.
4. 2-3 bullets: concrete ships mapped from resume -> their stack/problem. No fluff bullets.
5. Greeting: hey / hello / hi / yo. Sign-off exactly: - yash
6. No unicode long dashes. ASCII hyphen (-) only if needed.
7. Sound human. No "hope this finds you well", "passionate", template sludge.
8. Do not claim anything was sent.

Output per company:

1. Company: <name>
Why fit: <one line for Yash, not for the email>
To: <email or NEED_EMAIL@example.com>
Subject: <short, about the deliverable, not their tagline>
Body:
hey <name or team>,

<DELIVERABLE ONLY - rule 2>

- <concrete ship 1>
- <concrete ship 2>
- <optional ship 3>

- yash
`;
}
