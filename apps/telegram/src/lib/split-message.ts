/** Telegram sendMessage hard limit helpers. */
export { TELEGRAM_MAX_MESSAGE_LENGTH } from "../constants.js";

/**
 * Split text into chunks that fit Telegram's message limit.
 * Prefers breaking on paragraph / newline / space boundaries.
 */
export function splitTelegramMessage(
  text: string,
  maxLen = 4096,
): string[] {
  const trimmed = text.trimEnd();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > maxLen) {
    const window = remaining.slice(0, maxLen);
    const softBreak = lastIndexOfAny(window, ["\n\n", "\n", " "]);
    const breakAt = softBreak > maxLen * 0.4 ? softBreak : maxLen;

    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function lastIndexOfAny(haystack: string, needles: string[]): number {
  let best = -1;
  for (const needle of needles) {
    const idx = haystack.lastIndexOf(needle);
    if (idx > best) best = idx;
  }
  return best;
}
