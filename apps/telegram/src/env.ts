function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in environment`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  telegramBotToken: () => required("TELEGRAM_BOT_TOKEN"),
  openaiApiKey: () => required("OPENAI_API_KEY"),
  llmModel: () => process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
  historyLimit: () => numberEnv("TELEGRAM_HISTORY_LIMIT", 40),
  maxToolRounds: () => numberEnv("TELEGRAM_MAX_TOOL_ROUNDS", 3),
  maxMediaBytes: () => numberEnv("TELEGRAM_MAX_MEDIA_BYTES", 20 * 1024 * 1024),
  searxngUrl: () => process.env.SEARXNG_URL?.trim() || "http://127.0.0.1:8080",
};
