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
        `Website scrape (use this - pick 1 concrete fact):`,
        c.scrapedText || "(empty)",
      ].join("\n");
    })
    .join("\n\n");

  return `Write cold outreach emails for Yash applying to / pitching these companies.

Candidate:
- Name: ${input.profile.displayName || "Yash"}
- Target role: ${input.profile.targetRole || "(not set)"}
- Resume / proof (use SPECIFIC projects from here):
${resume}

User query: ${input.companyQuery}

Scraped companies:
${companiesBlock || "(no companies scraped)"}

CRITICAL OUTPUT RULES (break any = bad email):
1. THE FIRST SENTENCE AFTER THE GREETING must be the deliverable line. Format:
   "{company} is a {batch/stage if known} company that {what they build from scrape}. I can build you {specific agent/feature/thing they would actually want}."
   Example: "result.dev is a YC W26 company that builds AI agents for ecommerce. I can build you an agent for UGC generation, abandoned cart revival, etc."
   This line is the whole point. If it is vague ("I'd love to contribute" / "excited about your mission") the draft FAILS.
2. Body: max 5 sentences OR 100 words, whichever is shorter. Prefer fewer.
3. Use bullet points for the 2-3 concrete things Yash can ship (pulled from resume, mapped to THEIR product).
4. Reference ONE specific fact from the scrape (product, customer, batch, feature). Not generic praise.
5. Start greeting with exactly one of: hey / hello / hi / yo (lowercase ok). Address contact if known.
6. Sign off with exactly: - yash
7. NEVER use the unicode characters U+2014 or U+2013 (long dashes). Use commas, periods, or ASCII hyphen (-). Non-negotiable.
8. Sound human. No fluff, no "I hope this finds you well", no "passionate about", no template sludge.
9. Do NOT claim you sent anything.

For each company output this block:

1. Company: <name>
Why fit: <one line>
To: <email or NEED_EMAIL@example.com>
Subject: <one short line, no long dashes>
Body:
hey <name or team>,

<DELIVERABLE LINE - see rule 1>

- <concrete thing 1>
- <concrete thing 2>
- <optional concrete thing 3>

- yash
`;
}
