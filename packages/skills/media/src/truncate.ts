export const MAX_TEXT_CHARS = Number(
  process.env.MEDIA_MAX_TEXT_CHARS ?? 14_000,
);

export function truncate(text: string, max = MAX_TEXT_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[truncated ${t.length - max} chars]`;
}
