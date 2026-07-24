import { scrapePage } from "@ugpilot/skills-search";
import { createLogger } from "@ugpilot/logger";
import type { YcCompanyHit, YcCompanyScraped } from "./types.js";

const log = createLogger("agents:yc:scrape");

const SKIP_HOST_FRAGMENTS = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "crunchbase.com",
  "wikipedia.org",
  "glassdoor.com",
  "indeed.com",
];

/**
 * Scrape each company URL in parallel (free fetch). Prefers real product
 * sites over social / job-board domains when the hit URL is junk.
 */
export async function scrapeYcCompanies(
  hits: YcCompanyHit[],
  limit = 5,
): Promise<YcCompanyScraped[]> {
  const selected = hits.filter((h) => !isSkipHost(h.url)).slice(0, limit);

  log.info("yc.scrape_batch", { count: selected.length });

  const results = await Promise.all(
    selected.map(async (hit): Promise<YcCompanyScraped> => {
      const scrapeUrl = pickScrapeUrl(hit);
      const { text, ok } = await scrapePage(scrapeUrl, { maxChars: 2000 });

      // If YC page scraped, try to pull an external homepage and scrape that too.
      let scrapedText = ok ? text : hit.blurb;
      if (ok && isYcHost(scrapeUrl)) {
        const external = extractExternalHomepage(text, scrapeUrl);
        if (external) {
          const second = await scrapePage(external, { maxChars: 2000 });
          if (second.ok) {
            scrapedText = `${text.slice(0, 600)}\n\n--- company site (${external}) ---\n\n${second.text}`;
          }
        }
      }

      if (!ok && !hit.blurb) {
        scrapedText = "(scrape failed - use search title only)";
      }

      return {
        ...hit,
        scrapeUrl,
        scrapedText: scrapedText.slice(0, 2200),
      };
    }),
  );

  return results;
}

function pickScrapeUrl(hit: YcCompanyHit): string {
  const fromBlurb = extractUrlFromText(hit.blurb);
  if (fromBlurb && !isSkipHost(fromBlurb) && !isYcHost(fromBlurb)) {
    return fromBlurb;
  }
  return hit.url;
}

function extractExternalHomepage(scraped: string, pageUrl: string): string | null {
  const urls = scraped.match(/https?:\/\/[^\s)\]"'<>]+/gi) ?? [];
  for (const raw of urls) {
    const cleaned = raw.replace(/[.,;:]+$/, "");
    if (isSkipHost(cleaned) || isYcHost(cleaned)) continue;
    try {
      const u = new URL(cleaned);
      if (u.hostname === new URL(pageUrl).hostname) continue;
      return `${u.origin}/`;
    } catch {
      continue;
    }
  }
  return null;
}

function extractUrlFromText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)\]"'<>]+/i);
  return m?.[0]?.replace(/[.,;:]+$/, "") ?? null;
}

function isYcHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h.includes("ycombinator.com") || h.includes("workatastartup.com");
  } catch {
    return false;
  }
}

function isSkipHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return SKIP_HOST_FRAGMENTS.some((f) => h.includes(f));
  } catch {
    return true;
  }
}
