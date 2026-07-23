export { getPool, closePool } from "./client.js";
export { migrate } from "./migrate.js";
export {
  upsertTelegramChat,
  appendTelegramMessage,
  getRecentTelegramMessages,
  clearTelegramMessages,
  type ChatRole,
  type TelegramChatRow,
  type TelegramMessageRow,
  type UpsertChatInput,
} from "./telegram.js";
export {
  upsertMailAccount,
  listMailAccounts,
  setActiveMailAccount,
  removeMailAccount,
  getActiveMailCredentials,
  getMailCredentialsBySlot,
  type MailProvider,
  type MailAccountPublic,
  type MailCredentials,
} from "./mail.js";
export {
  upsertUserProfile,
  getUserProfile,
  type UserProfileRow,
} from "./profile.js";
export {
  createMailDraft,
  listPendingDrafts,
  getMailDraft,
  markDraftSent,
  cancelMailDraft,
  type MailDraftRow,
} from "./drafts.js";
export {
  insertTelegramAttachment,
  listTelegramAttachments,
  getRecentAttachmentContext,
  clearTelegramAttachments,
  type AttachmentKind,
  type TelegramAttachmentRow,
} from "./attachments.js";
export { encryptSecret, decryptSecret } from "./crypto.js";
