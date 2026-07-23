import type { MailProvider } from "@ugpilot/db";

export type MailLinkState =
  | { step: "email"; slot: 1 | 2; provider: MailProvider }
  | { step: "password"; slot: 1 | 2; provider: MailProvider; email: string };

export type ParsedEmailDraft = {
  to: string;
  subject: string;
  body: string;
  company?: string;
};

export type ResolvedSendPayload = {
  to: string;
  subject: string;
  body: string;
  source: string;
};

export type PendingSend = ResolvedSendPayload & {
  createdAt: number;
};
