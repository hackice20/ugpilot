import { createLocalDriver } from "./local.js";
import { createR2Driver } from "./r2.js";
import type { SaveBufferInput, SavedObject, StorageDriver } from "./types.js";

export type { SaveBufferInput, SavedObject };

function driverName(): string {
  return (process.env.STORAGE_DRIVER || "local").trim().toLowerCase();
}

let driver: StorageDriver | undefined;

function getDriver(): StorageDriver {
  if (driver) return driver;

  switch (driverName()) {
    case "local":
      driver = createLocalDriver();
      break;
    case "r2":
      driver = createR2Driver();
      break;
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER="${driverName()}". Use "local" or "r2".`,
      );
  }

  return driver;
}

/** Resolve / create the active driver (local mkdir, or R2 credential check). */
export async function ensureStorage(): Promise<string> {
  const active = getDriver();
  await active.ensure();
  return driverName() === "r2"
    ? `r2://${process.env.R2_BUCKET}`
    : process.env.STORAGE_PATH || "./.storage";
}

export async function saveBuffer(input: SaveBufferInput): Promise<SavedObject> {
  return getDriver().save(input);
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  return getDriver().read(relativePath);
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  return getDriver().delete(relativePath);
}
