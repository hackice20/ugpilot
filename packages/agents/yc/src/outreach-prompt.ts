import type { YcOutreachPromptInput } from "./types.js";

export function buildYcOutreachPrompt(input: YcOutreachPromptInput): string {
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
