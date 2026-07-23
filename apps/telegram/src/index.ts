import { migrate, closePool } from "@ugpilot/db";
import { createLogger } from "@ugpilot/logger";
import { createBot } from "./bot.js";
import { env } from "./env.js";

const log = createLogger("telegram:boot");

async function main(): Promise<void> {
  // Touch token early so we fail before migrate if misconfigured.
  env.telegramBotToken();

  log.info("boot.start", {
    historyLimit: env.historyLimit(),
    model: env.llmModel(),
    searxngUrl: env.searxngUrl(),
  });

  await migrate();
  log.info("db.migrated");

  const bot = createBot();

  const shutdown = async (signal: string) => {
    log.info("boot.shutdown", { signal });
    bot.stop();
    await closePool();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await bot.start({
    onStart: (info) => {
      log.info("bot.ready", { botId: info.id, username: info.username });
    },
  });
}

main().catch((err) => {
  log.error("boot.failed", err);
  process.exit(1);
});
