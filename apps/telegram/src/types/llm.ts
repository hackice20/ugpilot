export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatWithLlmOptions = {
  enableTools?: boolean;
  /** Replaces the default SYSTEM_PROMPT when set. */
  systemPrompt?: string;
};

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
