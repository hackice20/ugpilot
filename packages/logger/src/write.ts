import type { LogFields, LogLevel } from "./types.js";
import { LEVEL_ORDER } from "./types.js";

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "debug").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "debug";
}

export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
    };
  }
  return { error: err };
}

export function write(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  const min = resolveMinLevel();
  if (LEVEL_ORDER[level] < LEVEL_ORDER[min]) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...fields,
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
