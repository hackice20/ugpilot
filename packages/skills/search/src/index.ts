import { createLogger } from "@ugpilot/logger";

const log = createLogger("skills:search");

export type SearchResult = {
  title: string;
  url: string;
  content: string;
  engine?: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  latencyMs: number;
};

type SearxngJson = {
  query?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    engine?: string;
  }>;
};

function getBaseUrl(): string {
  const raw = process.env.SEARXNG_URL ?? "http://127.0.0.1:8080";
  return raw.replace(/\/$/, "");
}

/**
 * Query a private SearXNG instance (JSON API).
 * Safe for Oracle ARM: talks to localhost / internal docker network only.
 */
export async function webSearch(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const baseUrl = getBaseUrl();
  const started = Date.now();

  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");

  log.info("search.request", { query, limit, baseUrl });

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal ?? AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error("search.http_error", {
      status: res.status,
      bodyPreview: body.slice(0, 200),
    });
    throw new Error(`SearXNG HTTP ${res.status}`);
  }

  const data = (await res.json()) as SearxngJson;
  const results = (data.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, limit)
    .map((r) => ({
      title: r.title!.trim(),
      url: r.url!.trim(),
      content: (r.content ?? "").trim(),
      engine: r.engine,
    }));

  const latencyMs = Date.now() - started;
  log.info("search.response", {
    query,
    resultCount: results.length,
    latencyMs,
  });

  return {
    query: data.query ?? query,
    results,
    latencyMs,
  };
}

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
