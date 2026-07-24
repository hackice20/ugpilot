/** Strip LLM chat leftovers that must never go out over SMTP. */
export function scrubEmailBody(body: string): string {
  let text = body.replace(/\r/g, "").trim();

  const cutPatterns = [
    /\n\s*Would you like\b[\s\S]*$/i,
    /\n\s*Do you want\b[\s\S]*$/i,
    /\n\s*Should I\b[\s\S]*$/i,
    /\n\s*I can (also |tailor|revise|adjust|send|draft)\b[\s\S]*$/i,
    /\n\s*Let me know\b[\s\S]*$/i,
    /\n\s*If you('d| would) like\b[\s\S]*$/i,
    /\n\s*Want me to\b[\s\S]*$/i,
    /\n\s*---+\s*\n[\s\S]*$/i,
    /\n\s*Drafts?:[\s\S]*$/i,
    /\n\s*\/approve[\s\S]*$/i,
    /\n\s*\/send[\s\S]*$/i,
    /\n\s*Reply to[\s\S]*$/i,
  ];

  for (const re of cutPatterns) {
    text = text.replace(re, "").trim();
  }

  // If multiple drafts numbered, keep first only
  text = text.split(/\n(?=\d+\.\s)/)[0]?.trim() ?? text;

  // Kill em/en dashes the model sneaks in despite the system prompt
  text = text.replace(/[\u2014\u2013\u2012\u2015]/g, "-");

  return text.trim();
}

export function isPlaceholderRecipient(email: string): boolean {
  return email.includes("NEED_EMAIL") || email.includes("example.com");
}
