import {
  webSearch,
  formatSearchResultsForLlm,
} from "@ugpilot/skills-search";
import { createLogger } from "@ugpilot/logger";

const log = createLogger("agents:placement");

export type YcCompanyHit = {
  name: string;
  url: string;
  blurb: string;
};

/**
 * Find YC companies via private SearXNG (free).
 * Biases queries toward ycombinator.com / workatastartup.
 */
export async function findYcCompanies(
  query: string,
  limit = 8,
): Promise<{ hits: YcCompanyHit[]; rawForLlm: string }> {
  const q = [
    query.trim(),
    "Y Combinator",
    "(site:ycombinator.com/companies OR site:workatastartup.com)",
  ]
    .filter(Boolean)
    .join(" ");

  log.info("yc.search", { query, expanded: q, limit });
  const response = await webSearch(q, { limit });

  const hits: YcCompanyHit[] = response.results.map((r) => ({
    name: r.title,
    url: r.url,
    blurb: r.content,
  }));

  return {
    hits,
    rawForLlm: formatSearchResultsForLlm(response),
  };
}

export function buildYcOutreachPrompt(input: {
  companyQuery: string;
  searchRaw: string;
  profile: {
    displayName?: string | null;
    targetRole?: string | null;
    resumeBlurb?: string | null;
  };
}): string {
  return `You are drafting cold outreach for YC startups (job application / founder email).

Candidate profile:
- Name: ${input.profile.displayName || "(unknown)"}
- Target role: ${input.profile.targetRole || "(not set)"}
- Resume / proof:
${input.profile.resumeBlurb || "(not set — ask user to /profile set)"}

User asked for companies matching: ${input.companyQuery}

Web results (YC-biased):
${input.searchRaw}

Tasks:
1. Pick up to 5 real YC-related companies from the results (skip junk).
2. For each, propose: company name, why fit (1 line), founder/contact guess if present in results else "NEED_EMAIL", and a short cold email (subject + body).
3. Tone: direct, specific, no em dashes, no fluff. Human-sounding.
4. Output clearly numbered drafts the user can approve to send later.
5. Do NOT claim you already sent anything.`;
}
