import OpenAI from "openai";
import { env } from "../env.js";

export const llm = new OpenAI({ apiKey: env.openaiApiKey() });

export function llmModel(): string {
  return env.llmModel();
}
