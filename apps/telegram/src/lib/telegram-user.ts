import type { Context } from "grammy";

export function getTelegramUserId(ctx: Context): number | null {
  return ctx.from?.id ?? null;
}
