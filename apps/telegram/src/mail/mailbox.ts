import type { MailProvider } from "@ugpilot/db";
import type { MailboxConfig } from "@ugpilot/skills-email";
import { getActiveMailCredentials } from "@ugpilot/db";

type ActiveCreds = NonNullable<
  Awaited<ReturnType<typeof getActiveMailCredentials>>
>;

const PROVIDER_HOSTS: Record<
  MailProvider,
  { imapHost: string; smtpHost: string; smtpPort: number }
> = {
  gmail: {
    imapHost: "imap.gmail.com",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
  },
  outlook: {
    imapHost: "outlook.office365.com",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
};

export function mailboxConfigFromCreds(creds: ActiveCreds): MailboxConfig {
  return {
    email: creds.email,
    provider: creds.provider,
    imapHost: creds.imapHost,
    imapPort: creds.imapPort,
    smtpHost: creds.smtpHost,
    smtpPort: creds.smtpPort,
    username: creds.username,
    password: creds.password,
  };
}

export function mailboxConfigForLink(input: {
  email: string;
  provider: MailProvider;
  password: string;
}): MailboxConfig {
  const hosts = PROVIDER_HOSTS[input.provider];
  return {
    email: input.email,
    provider: input.provider,
    imapHost: hosts.imapHost,
    imapPort: 993,
    smtpHost: hosts.smtpHost,
    smtpPort: hosts.smtpPort,
    username: input.email,
    password: input.password,
  };
}

export function isMailSlot(n: number): n is 1 | 2 {
  return n === 1 || n === 2;
}

export function isMailProvider(value: string): value is MailProvider {
  return value === "gmail" || value === "outlook";
}
