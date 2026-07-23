import type { MailMessageSummary } from "./types.js";

export function classifyGmailLabels(
  labels: string[] | undefined,
): MailMessageSummary["category"] {
  const set = new Set((labels ?? []).map((l) => l.toLowerCase()));
  if (set.has("category_promotions")) return "promotions";
  if (set.has("category_social")) return "social";
  if (set.has("category_updates")) return "updates";
  if (set.has("category_forums")) return "forums";
  if (set.has("category_personal")) return "primary";
  return "other";
}

export function formatAddress(
  list?: Array<{ name?: string; address?: string }> | null,
): string {
  if (!list?.length) return "(unknown)";
  const first = list[0];
  if (!first) return "(unknown)";
  if (first.name && first.address) return `${first.name} <${first.address}>`;
  return first.address || first.name || "(unknown)";
}

export function formatInboxList(messages: MailMessageSummary[]): string {
  if (messages.length === 0) return "No important mail in range.";
  return messages
    .map((m, i) => `${i + 1}. [${m.category}] ${m.from}\n   ${m.subject}`)
    .join("\n\n");
}
