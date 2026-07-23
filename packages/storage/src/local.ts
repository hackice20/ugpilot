import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SaveBufferInput, SavedObject, StorageDriver } from "./types.js";

function rootDir(): string {
  return process.env.STORAGE_PATH || "./.storage";
}

function objectKey(namespace: string, ext: string): string {
  return path.posix.join(namespace, `${Date.now()}-${randomUUID()}.${ext}`);
}

function safeExt(input: SaveBufferInput): string {
  return (
    (input.ext || path.extname(input.originalName || "").replace(/^\./, "") || "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin"
  );
}

export function createLocalDriver(): StorageDriver {
  return {
    async ensure() {
      await fs.mkdir(path.resolve(rootDir()), { recursive: true });
    },

    async save(input) {
      const root = path.resolve(rootDir());
      await fs.mkdir(path.join(root, input.namespace), { recursive: true });

      const relativePath = objectKey(input.namespace, safeExt(input));
      const absolutePath = path.join(root, relativePath);
      await fs.writeFile(absolutePath, input.buffer);

      return {
        relativePath,
        absolutePath,
        bytes: input.buffer.byteLength,
      } satisfies SavedObject;
    },

    async read(relativePath) {
      return fs.readFile(path.join(path.resolve(rootDir()), relativePath));
    },

    async delete(relativePath) {
      try {
        await fs.unlink(path.join(path.resolve(rootDir()), relativePath));
      } catch {
        /* ignore missing */
      }
    },
  };
}
