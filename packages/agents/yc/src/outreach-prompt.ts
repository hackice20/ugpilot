import type { YcOutreachPromptInput } from "./types.js";

const CANDIDATE = {
  name: "Yash",
  portfolio: "https://yashworks.com",
  resumeUrl: "https://yashworks.com/resume",
  email: "contact@yashworks.com",
};

/**
 * Ground-truth resume summary. Use when attachment text is missing.
 * Do NOT invent beyond this + attached resume text.
 */
export const RESUME_FACTS = `Yash Kamble - Full-stack / backend engineer
Email: contact@yashworks.com | yashworks.com | github.com/hackice20

Education: BE Information Technology, D.Y. Patil Institute of Technology (SPPU), Nov 2022 - Jun 2026, CGPA 7.86

Experience:
- Full Value Technologies (Full-Stack Developer Intern): PostgreSQL, Angular, Nest.js, Elasticsearch, Redis, RabbitMQ. Elasticsearch search across 4 data sources for 2 enterprise clients. Signed URL downloads + Redis cache. Unified JWT auth service with dynamic DB routing.
- Magnacamz Technologies (Full-Stack Developer Intern): Express, React, Node.js, TypeScript, Tailwind, MongoDB. 3 full-stack apps, rate limiting/caching (~40% backend gain), SEO UIs (Lighthouse 90+).

Projects (ONLY these - do not invent others):
- QueryNox: multi-model AI chat platform (React, TS, Node, Express, PostgreSQL, AWS EC2, NGINX, Cloudflare R2, Prometheus/Grafana/Loki). 8+ models, RAG, 100+ users, 30K+ req/month.
- Sync-Script: real-time collaborative editor (Socket.IO, MongoDB, React).
- Micro-GPT: GPT from scratch in PyTorch.

Also: HackerRank 5-star Java, LeetCode ~1729, 500+ problems.`;

/**
 * Cold email writer - short, point-wise, resume-honest.
 */
export function buildYcOutreachPrompt(input: YcOutreachPromptInput): string {
  const displayName = input.profile.displayName?.trim() || CANDIDATE.name;
  const resume =
    input.profile.resumeAttached?.trim() ||
    input.profile.resumeBlurb?.trim() ||
    RESUME_FACTS;

  const companiesBlock = input.companies
    .map((c, i) => {
      return [
        `### Company ${i + 1}: ${c.name}`,
        `Search URL: ${c.url}`,
        `Scraped from: ${c.scrapeUrl}`,
        `Search blurb: ${c.blurb || "(none)"}`,
        `Website scrape (one specific detail for bullet 1):`,
        c.scrapedText || "(empty)",
      ].join("\n");
    })
    .join("\n\n");

  return `Write SHORT cold emails for ${displayName}. Point-wise. Not a cover letter. Not long prose.

Candidate:
- Name: ${displayName}
- Portfolio: ${CANDIDATE.portfolio}
- Resume URL: ${CANDIDATE.resumeUrl}
- Email: ${CANDIDATE.email}
- Target role: ${input.profile.targetRole || "(not set)"}

RESUME (cite ONLY this - never invent):
${resume}

User query: ${input.companyQuery}

Scraped companies:
${companiesBlock || "(none)"}

## Subject (exact)
Quick intro - ${displayName}

## Body shape (mandatory)
1. Greeting line: Hi <Name>,
2. ONE short opener sentence (specific thing from scrape - not "{Company} builds X", not generic praise).
3. Exactly 4 or 5 bullet points. That is the email. No essay paragraphs after the opener.
4. Then:
More about me: ${CANDIDATE.portfolio}

${displayName}
${CANDIDATE.email}

## What the 4-5 bullets are
- Bullet 1: specific observation about THEIR product/tech (from scrape) OR the concrete thing you can ship for them
- Bullets 2-4: real resume facts only (Nest/Elasticsearch/Redis/auth, QueryNox, etc.)
- Bullet 5 (optional): honest technical fit in one line
If company domain != resume domain: bullets stay technical (APIs, search, auth, shipping). Do NOT invent matching-domain projects.

## Body bans (instant fail)
- No labels inside Body: Hook / Why fit / Connection / Who I am / Opening / Closing
- No long paragraphs (max 1 opener sentence + bullets)
- No inventing resume items
- No "based in" / location
- No unicode em/en dashes
- No "I look forward to hearing from you" / "love the opportunity"

## Example Body
Hi Marcus,

Spent time on your clinical data + LLM infra angle - rebuilding the data flow, not just wrapping a model.

- Nest.js / Node APIs with Elasticsearch across multiple data sources for enterprise clients
- Redis-backed signed downloads + unified JWT auth
- Shipped QueryNox: multi-model AI chat, RAG, streaming, 30K+ req/month
- Comfortable owning backend + infra (AWS EC2, NGINX, observability)
- Happy to dig into whatever API / search / data layer work you need next

More about me: ${CANDIDATE.portfolio}

${displayName}
${CANDIDATE.email}

## Output per company
Why fit is private notes for Yash - NOT in Body.

1. Company: <name>
Why fit: <one technical line>
To: <email or NEED_EMAIL@example.com>
Subject: Quick intro - ${displayName}
Body:
Hi <Name>,

<one opener sentence>

- <bullet>
- <bullet>
- <bullet>
- <bullet>
- <optional 5th bullet>

More about me: ${CANDIDATE.portfolio}

${displayName}
${CANDIDATE.email}
`;
}
