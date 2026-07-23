import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { createLogger } from "@ugpilot/logger";
import {
  webSearch,
  formatSearchResultsForLlm,
} from "@ugpilot/skills-search";
import { SYSTEM_PROMPT } from "./prompt.js";

const log = createLogger("telegram:llm");

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("Missing OPENAI_API_KEY in .env");
}

const model = process.env.LLM_MODEL || "gpt-4o-mini";
const MAX_TOOL_ROUNDS = Number(process.env.TELEGRAM_MAX_TOOL_ROUNDS ?? 3);

export const llm = new OpenAI({ apiKey });

const tools: ChatCompletionTool[] = [
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

export type ChatResult = {
  content: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCalls: number;
  searches: string[];
};

async function runWebSearchTool(argsJson: string): Promise<string> {
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

export async function chatWithLlm(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  options: { enableTools?: boolean } = {},
): Promise<ChatResult> {
  const started = Date.now();
  const searches: string[] = [];
  let toolCalls = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastModel = model;
  const enableTools = options.enableTools !== false;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  log.debug("llm.request", {
    model,
    historyTurns: history.length,
    userChars: userMessage.length,
    enableTools,
  });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const completion = await llm.chat.completions.create({
      model,
      messages,
      ...(enableTools
        ? {
            tools,
            tool_choice: round === MAX_TOOL_ROUNDS ? "none" as const : "auto" as const,
          }
        : {}),
    });

    lastModel = completion.model ?? model;
    promptTokens += completion.usage?.prompt_tokens ?? 0;
    completionTokens += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) break;

    const pendingTools = msg.tool_calls ?? [];
    if (pendingTools.length === 0) {
      const content =
        msg.content?.trim() || "Sorry, I couldn't generate a reply.";
      const latencyMs = Date.now() - started;

      log.info("llm.response", {
        model: lastModel,
        latencyMs,
        replyChars: content.length,
        finishReason: choice?.finish_reason,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        toolCalls,
        searches,
      });

      return {
        content,
        model: lastModel,
        latencyMs,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        toolCalls,
        searches,
      };
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: pendingTools,
    });

    for (const call of pendingTools) {
      toolCalls += 1;
      const name = call.function.name;
      const args = call.function.arguments;

      log.info("llm.tool_call", {
        round,
        name,
        argsPreview: args.slice(0, 200),
      });

      let toolResult: string;
      if (name === "web_search") {
        try {
          const parsed = JSON.parse(args) as { query?: string };
          if (parsed.query) searches.push(parsed.query);
        } catch {
          /* ignore */
        }
        toolResult = await runWebSearchTool(args);
      } else {
        toolResult = `Unknown tool: ${name}`;
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResult,
      });
    }
  }

  const latencyMs = Date.now() - started;
  log.warn("llm.tool_rounds_exhausted", { toolCalls, searches, latencyMs });

  return {
    content:
      "I hit the search/tool limit before finishing. Try a narrower question.",
    model: lastModel,
    latencyMs,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    toolCalls,
    searches,
  };
}
