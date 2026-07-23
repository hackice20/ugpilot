import { upsertTelegramChat } from "@ugpilot/db";

type EnsureChatContext = {
  chat?: { id: number };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
};

export async function ensureChat(ctx: EnsureChatContext) {
  if (!ctx.chat) throw new Error("Missing chat on update");
  return upsertTelegramChat({
    telegramChatId: ctx.chat.id,
    telegramUserId: ctx.from?.id,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
  });
}
