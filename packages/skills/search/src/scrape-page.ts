import { createLogger } from "@ugpilot/logger";

const log = createLogger("skills:search:scrape");

const DEFAULT_MAX_CHARS = 2000;
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Free site scrape: plain fetch + HTML→text. No Firecrawl / paid APIs.
 */
export async function scrapePage(
  url: string,
  options: { maxChars?: number; signal?: AbortSignal } = {},
): Promise<{ url: string; text: string; ok: boolean }> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; UGPilotBot/0.1; +https://github.com/ugpilot)",
        "Accept-Language": "en-US,en;q=0.8",
      },
      signal: options.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      log.warn("scrape.http_error", { url, status: res.status });
      return { url, text: "", ok: false };
    }

    const ctype = res.headers.get("content-type") ?? "";
    if (
      ctype &&
      !ctype.includes("text/html") &&
      !ctype.includes("application/xhtml") &&
      !ctype.includes("text/plain")
    ) {
      log.warn("scrape.skip_non_html", { url, ctype });
      return { url, text: "", ok: false };
    }

    const html = await res.text();
    const text = truncate(htmlToText(html), maxChars);

    log.info("scrape.ok", {
      url,
      chars: text.length,
      latencyMs: Date.now() - started,
    });

    return { url, text, ok: text.length > 40 };
  } catch (err) {
    log.warn("scrape.failed", {
      url,
      err: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    });
    return { url, text: "", ok: false };
  }
}

/** Strip tags / scripts and keep readable page copy. */
export function htmlToText(html: string): string {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ") ??
    "";
  const metaDesc =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    )?.[1] ??
    "";

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&\w+;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const head = [title && `Title: ${title.trim()}`, metaDesc && `Meta: ${metaDesc.trim()}`]
    .filter(Boolean)
    .join("\n");

  return [head, body].filter(Boolean).join("\n\n");
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[truncated]`;
}
