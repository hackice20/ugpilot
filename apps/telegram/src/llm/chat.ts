import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { createLogger } from "@ugpilot/logger";
import { env } from "../env.js";
import type {
  ChatHistoryTurn,
  ChatResult,
  ChatWithLlmOptions,
} from "../types/llm.js";
import { llm, llmModel } from "./client.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import {
  chatTools,
  extractSearchQuery,
  runWebSearchTool,
} from "./tools.js";

const log = createLogger("telegram:llm");

export async function chatWithLlm(
  userMessage: string,
  history: ChatHistoryTurn[] = [],
  options: ChatWithLlmOptions = {},
): Promise<ChatResult> {
  const started = Date.now();
  const model = llmModel();
  const maxRounds = env.maxToolRounds();
  const enableTools = options.enableTools !== false;
  const searches: string[] = [];
  let toolCalls = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastModel = model;

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

  for (let round = 0; round <= maxRounds; round++) {
    const completion = await llm.chat.completions.create({
      model,
      messages,
      ...(enableTools
        ? {
            tools: chatTools,
            tool_choice:
              round === maxRounds ? ("none" as const) : ("auto" as const),
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
      return finishReply({
        content: msg.content?.trim() || "Sorry, I couldn't generate a reply.",
        model: lastModel,
        started,
        promptTokens,
        completionTokens,
        toolCalls,
        searches,
        finishReason: choice?.finish_reason,
      });
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: pendingTools,
    });

    toolCalls += await appendToolResults({
      messages,
      pendingTools,
      searches,
      round,
    });
  }

  return exhaustedReply({
    started,
    model: lastModel,
    promptTokens,
    completionTokens,
    toolCalls,
    searches,
  });
}

async function appendToolResults(input: {
  messages: ChatCompletionMessageParam[];
  pendingTools: ChatCompletionMessageToolCall[];
  searches: string[];
  round: number;
}): Promise<number> {
  let count = 0;

  for (const call of input.pendingTools) {
    count += 1;
    const { name, arguments: args } = call.function;

    log.info("llm.tool_call", {
      round: input.round,
      name,
      argsPreview: args.slice(0, 200),
    });

    const query = name === "web_search" ? extractSearchQuery(args) : undefined;
    if (query) input.searches.push(query);

    const toolResult =
      name === "web_search"
        ? await runWebSearchTool(args)
        : `Unknown tool: ${name}`;

    input.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: toolResult,
    });
  }

  return count;
}

function exhaustedReply(input: {
  started: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  toolCalls: number;
  searches: string[];
}): ChatResult {
  const latencyMs = Date.now() - input.started;
  log.warn("llm.tool_rounds_exhausted", {
    toolCalls: input.toolCalls,
    searches: input.searches,
    latencyMs,
  });

  return {
    content:
      "I hit the search/tool limit before finishing. Try a narrower question.",
    model: input.model,
    latencyMs,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.promptTokens + input.completionTokens,
    toolCalls: input.toolCalls,
    searches: input.searches,
  };
}

function finishReply(input: {
  content: string;
  model: string;
  started: number;
  promptTokens: number;
  completionTokens: number;
  toolCalls: number;
  searches: string[];
  finishReason?: string | null;
}): ChatResult {
  const latencyMs = Date.now() - input.started;

  log.info("llm.response", {
    model: input.model,
    latencyMs,
    replyChars: input.content.length,
    finishReason: input.finishReason,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.promptTokens + input.completionTokens,
    toolCalls: input.toolCalls,
    searches: input.searches,
  });

  return {
    content: input.content,
    model: input.model,
    latencyMs,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.promptTokens + input.completionTokens,
    toolCalls: input.toolCalls,
    searches: input.searches,
  };
}
