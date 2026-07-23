export { registerMailCommands } from "./commands/index.js";
export { handleMailLinkMessage } from "./link.js";
export { isMailLinkPending } from "./state.js";
export { parseEmailDraft, parseEmailDraftBlocks } from "./parse-draft.js";
export type {
  MailLinkState,
  PendingSend,
  ParsedEmailDraft,
  ResolvedSendPayload,
} from "../types/mail.js";
