import { clearTelegramAttachments } from "@ugpilot/db";
import { deleteStoredFile } from "@ugpilot/storage";

export async function clearChatMedia(chatId: string): Promise<number> {
  const { count, paths } = await clearTelegramAttachments(chatId);
  await Promise.all(paths.map((p) => deleteStoredFile(p)));
  return count;
}
