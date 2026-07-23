import type { SearchResponse } from "./types.js";

/** Compact text block for LLM tool results / Telegram /search. */
export function formatSearchResultsForLlm(response: SearchResponse): string {
  if (response.results.length === 0) {
    return `No web results for: ${response.query}`;
  }

  return response.results
    .map((r, i) => {
      const snippet = r.content ? `\n   ${r.content}` : "";
      return `${i + 1}. ${r.title}\n   ${r.url}${snippet}`;
    })
    .join("\n\n");
}
