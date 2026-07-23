import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { createLogger } from "@ugpilot/logger";
import {
  webSearch,
  formatSearchResultsForLlm,
} from "@ugpilot/skills-search";

const log = createLogger("telegram:llm:tools");

export const chatTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web via the private SearXNG instance for current facts, docs, news, colleges, companies, or anything you are unsure about.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          limit: {
            type: "integer",
            description: "Max results (1-10). Default 5.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export async function runWebSearchTool(argsJson: string): Promise<string> {
  let parsed: { query?: string; limit?: number } = {};
  try {
    parsed = JSON.parse(argsJson) as { query?: string; limit?: number };
  } catch {
    return "Invalid web_search arguments.";
  }

  const query = parsed.query?.trim();
  if (!query) return "web_search requires a non-empty query.";

  try {
    const response = await webSearch(query, { limit: parsed.limit ?? 5 });
    return formatSearchResultsForLlm(response);
  } catch (err) {
    log.error("tool.web_search_failed", err, { query });
    return `Search failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

export function extractSearchQuery(argsJson: string): string | undefined {
  try {
    const parsed = JSON.parse(argsJson) as { query?: string };
    return parsed.query?.trim() || undefined;
  } catch {
    return undefined;
  }
}
