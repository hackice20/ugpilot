import nodemailer from "nodemailer";
import { createLogger } from "@ugpilot/logger";
import type { MailboxConfig } from "./types.js";

const log = createLogger("skills:email:send");

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
