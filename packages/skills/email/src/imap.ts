import { ImapFlow } from "imapflow";
import type { MailboxConfig } from "./types.js";

export function createImapClient(cfg: MailboxConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: {
      user: cfg.username,
      pass: cfg.password,
    },
    logger: false,
  });
}

export async function withImap<T>(
  cfg: MailboxConfig,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createImapClient(cfg);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
