import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createLogger } from "@ugpilot/logger";

const log = createLogger("skills:email");

export type MailboxConfig = {
  email: string;
  provider: "gmail" | "outlook";
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
};

export type MailMessageSummary = {
  uid: number;
  subject: string;
  from: string;
  date?: string;
  snippet: string;
  category: "primary" | "promotions" | "social" | "updates" | "forums" | "other";
};

function createImapClient(cfg: MailboxConfig) {
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

function classifyGmailLabels(
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

function formatAddress(
  list?: Array<{ name?: string; address?: string }> | null,
): string {
  if (!list?.length) return "(unknown)";
  const first = list[0];
  if (!first) return "(unknown)";
  if (first.name && first.address) return `${first.name} <${first.address}>`;
  return first.address || first.name || "(unknown)";
}

async function withImap<T>(
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
      let uids: number[] = [];

      if (cfg.provider === "gmail") {
        const found = await client.search(
          { gmraw: `category:primary newer_than:${days}d` },
          { uid: true },
        );
        uids = found === false ? [] : found;
      } else {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const found = await client.search({ since }, { uid: true });
        uids = found === false ? [] : found;
      }

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
        const from = formatAddress(msg.envelope?.from);
        const labels = msg.labels
          ? Array.isArray(msg.labels)
            ? msg.labels
            : [...msg.labels]
          : undefined;
        const category =
          cfg.provider === "gmail" ? classifyGmailLabels(labels) : "primary";

        out.push({
          uid: msg.uid,
          subject,
          from,
          date: msg.envelope?.date?.toISOString(),
          snippet: subject,
          category,
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

export async function verifyMailbox(cfg: MailboxConfig): Promise<void> {
  log.info("imap.verify", { email: cfg.email, provider: cfg.provider });
  await withImap(cfg, async (client) => {
    await client.mailboxOpen("INBOX");
  });
}

export async function sendMail(
  cfg: MailboxConfig,
  input: { to: string; subject: string; text: string },
): Promise<{ messageId?: string }> {
  log.info("smtp.send", {
    from: cfg.email,
    to: input.to,
    subject: input.subject,
    bodyChars: input.text.length,
  });

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: {
      user: cfg.username,
      pass: cfg.password,
    },
  });

  const info = await transporter.sendMail({
    from: cfg.email,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });

  log.info("smtp.send.done", {
    from: cfg.email,
    to: input.to,
    messageId: info.messageId,
  });

  return { messageId: info.messageId };
}

export function formatInboxList(messages: MailMessageSummary[]): string {
  if (messages.length === 0) return "No important mail in range.";
  return messages
    .map((m, i) => `${i + 1}. [${m.category}] ${m.from}\n   ${m.subject}`)
    .join("\n\n");
}
