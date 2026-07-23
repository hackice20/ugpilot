type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "debug").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "debug";
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
    };
  }
  return { error: err };
}

function write(level: LogLevel, scope: string, message: string, fields?: LogFields) {
  const min = resolveMinLevel();
  if (LEVEL_ORDER[level] < LEVEL_ORDER[min]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...fields,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, fields?: LogFields) =>
      write("debug", scope, message, fields),
    info: (message: string, fields?: LogFields) =>
      write("info", scope, message, fields),
    warn: (message: string, fields?: LogFields) =>
      write("warn", scope, message, fields),
    error: (message: string, errOrFields?: unknown, fields?: LogFields) => {
      if (errOrFields instanceof Error || typeof errOrFields !== "object" || errOrFields === null) {
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
