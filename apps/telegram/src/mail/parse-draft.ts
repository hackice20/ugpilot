import type { ParsedEmailDraft } from "../types/mail.js";
import { isPlaceholderRecipient, scrubEmailBody } from "./scrub.js";

/** Parse a single To / Subject / Body draft block. */
export function parseEmailDraft(text: string): ParsedEmailDraft | null {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return null;

  const toLine = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2})(?:To|Recipient|Email\s*to)(?:\*{0,2})\s*[:\-]\s*<?\s*([^\s<>\n]+@[^\s<>\n]+)\s*>?/i,
  );
  const to = toLine?.[1]?.trim();
  if (!to || !to.includes("@") || isPlaceholderRecipient(to)) return null;

  const subjectMatch = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2})Subject(?:\*{0,2})\s*[:\-]\s*(.+)$/im,
  );
  const subject = subjectMatch?.[1]?.trim();
  if (!subject) return null;

  let body = "";
  const bodyMatch = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2})(?:Body|Message|Email(?:\s*body)?)(?:\*{0,2})\s*[:\-]\s*\n?([\s\S]+)/i,
  );
  if (bodyMatch?.[1]) {
    body = bodyMatch[1];
  } else if (subjectMatch?.index != null) {
    body = cleaned.slice(subjectMatch.index + subjectMatch[0].length);
  }

  body = scrubEmailBody(body);
  if (!body) return null;

  return { to, subject, body };
}

/** Parse numbered draft blocks (YC multi-draft responses). */
export function parseEmailDraftBlocks(text: string): ParsedEmailDraft[] {
  const blocks = text.split(/\n(?=\d+\.\s)/);
  const out: ParsedEmailDraft[] = [];

  for (const block of blocks) {
    const to =
      block.match(/To:\s*([^\n]+)/i)?.[1]?.trim() ||
      block.match(/([\w.+-]+@[\w.-]+\.\w+)/)?.[1];
    const subject = block.match(/Subject:\s*([^\n]+)/i)?.[1]?.trim();
    const bodyMatch =
      block.match(/Body:\s*([\s\S]+)/i) || block.match(/Email:\s*([\s\S]+)/i);

    if (!to || !subject || !bodyMatch?.[1]) continue;
    if (isPlaceholderRecipient(to)) continue;

    out.push({
      to,
      subject: subject.replace(/[\u2014\u2013\u2012\u2015]/g, "-"),
      body: scrubEmailBody(bodyMatch[1].trim()),
      company: block.match(/Company:\s*([^\n]+)/i)?.[1]?.trim(),
    });
  }

  return out;
}
