import { createLogger } from "@ugpilot/logger";
import type { MailboxConfig } from "./types.js";
import { withImap } from "./imap.js";

const log = createLogger("skills:email:verify");

export async function verifyMailbox(cfg: MailboxConfig): Promise<void> {
  log.info("imap.verify", { email: cfg.email, provider: cfg.provider });
  await withImap(cfg, async (client) => {
    await client.mailboxOpen("INBOX");
  });
}
