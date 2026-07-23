import type { LogFields } from "./types.js";
import { serializeError, write } from "./write.js";

export function createLogger(scope: string) {
  return {
    debug: (message: string, fields?: LogFields) =>
      write("debug", scope, message, fields),
    info: (message: string, fields?: LogFields) =>
      write("info", scope, message, fields),
    warn: (message: string, fields?: LogFields) =>
      write("warn", scope, message, fields),
    error: (message: string, errOrFields?: unknown, fields?: LogFields) => {
      if (
        errOrFields instanceof Error ||
        typeof errOrFields !== "object" ||
        errOrFields === null
      ) {
        write("error", scope, message, {
          ...serializeError(errOrFields),
          ...fields,
        });
        return;
      }
      write("error", scope, message, errOrFields as LogFields);
    },
    child: (childScope: string) => createLogger(`${scope}:${childScope}`),
  };
}

export type Logger = ReturnType<typeof createLogger>;
