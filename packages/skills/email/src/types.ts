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
