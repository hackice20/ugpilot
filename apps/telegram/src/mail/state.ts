import type { MailLinkState, PendingSend } from "../types/mail.js";

/** In-memory wizard state while linking a mailbox. */
export const mailLinkState = new Map<number, MailLinkState>();

/** In-memory queued sends awaiting `/confirm`. */
export const pendingSends = new Map<number, PendingSend>();

export function isMailLinkPending(telegramUserId: number): boolean {
  return mailLinkState.has(telegramUserId);
}

export function clearMailLink(telegramUserId: number): void {
  mailLinkState.delete(telegramUserId);
}

export function clearPendingSend(telegramUserId: number): void {
  pendingSends.delete(telegramUserId);
}
