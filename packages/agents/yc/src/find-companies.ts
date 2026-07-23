import {
  webSearch,
  formatSearchResultsForLlm,
} from "@ugpilot/skills-search";
import { createLogger } from "@ugpilot/logger";
import type { YcCompanyHit } from "./types.js";

const log = createLogger("agents:yc");

/**
 * Find YC companies via private SearXNG (free).
 * Biases queries toward ycombinator.com / workatastartup.
 */
export async function findYcCompanies(
  query: string,
  limit = 8,
): Promise<{ hits: YcCompanyHit[]; rawForLlm: string }> {
  const expanded = [
    query.trim(),
    "Y Combinator",
    "(site:ycombinator.com/companies OR site:workatastartup.com)",
  ]
    .filter(Boolean)
    .join(" ");

  log.info("yc.search", { query, expanded, limit });
  const response = await webSearch(expanded, { limit });

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
