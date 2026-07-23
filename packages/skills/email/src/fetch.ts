import { createLogger } from "@ugpilot/logger";
import type { MailboxConfig, MailMessageSummary } from "./types.js";
import { withImap } from "./imap.js";
import { classifyGmailLabels, formatAddress } from "./format.js";

const log = createLogger("skills:email:fetch");

/**
 * Fetch recent Primary (important) mail.
 * Gmail: uses category:primary via X-GM-RAW.
 * Outlook/other: recent INBOX mail (no Gmail categories).
 */
export async function fetchImportantMail(
  cfg: MailboxConfig,
  options: { limit?: number; days?: number } = {},
): Promise<MailMessageSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 40);
  const days = options.days ?? 5;
  const started = Date.now();

  log.info("imap.fetch_important", {
    email: cfg.email,
    provider: cfg.provider,
    limit,
    days,
  });

  return withImap(cfg, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await searchRecentUids(client, cfg.provider, days);
      const selected = uids.slice(-limit);
      if (selected.length === 0) return [];

      const out: MailMessageSummary[] = [];
      for await (const msg of client.fetch(
        selected,
        {
          uid: true,
          envelope: true,
          labels: true,
          bodyStructure: true,
        },
        { uid: true },
      )) {
        const subject = msg.envelope?.subject?.trim() || "(no subject)";
        const labels = msg.labels
          ? Array.isArray(msg.labels)
            ? msg.labels
            : [...msg.labels]
          : undefined;

        out.push({
          uid: msg.uid,
          subject,
          from: formatAddress(msg.envelope?.from),
          date: msg.envelope?.date?.toISOString(),
          snippet: subject,
          category:
            cfg.provider === "gmail"
              ? classifyGmailLabels(labels)
              : "primary",
        });
      }

      out.sort((a, b) => a.uid - b.uid);
      log.info("imap.fetch_important.done", {
        email: cfg.email,
        count: out.length,
        latencyMs: Date.now() - started,
      });
      return out;
    } finally {
      lock.release();
    }
  });
}

/** Count recent mail in noisy Gmail categories (for digest context). */
export async function countNoiseMail(
  cfg: MailboxConfig,
  days = 3,
): Promise<Record<string, number>> {
  if (cfg.provider !== "gmail") {
    return { promotions: 0, social: 0, updates: 0 };
  }

  return withImap(cfg, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const cats = ["promotions", "social", "updates"] as const;
      const counts: Record<string, number> = {};
      for (const cat of cats) {
        const found = await client.search(
          { gmraw: `category:${cat} newer_than:${days}d` },
          { uid: true },
        );
        counts[cat] = found === false ? 0 : found.length;
      }
      return counts;
    } finally {
      lock.release();
    }
  });
}

async function searchRecentUids(
  client: {
    search: (
      query: object,
      options: { uid: true },
    ) => Promise<number[] | false>;
  },
  provider: MailboxConfig["provider"],
  days: number,
): Promise<number[]> {
  if (provider === "gmail") {
    const found = await client.search(
      { gmraw: `category:primary newer_than:${days}d` },
      { uid: true },
    );
    return found === false ? [] : found;
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const found = await client.search({ since }, { uid: true });
  return found === false ? [] : found;
}
