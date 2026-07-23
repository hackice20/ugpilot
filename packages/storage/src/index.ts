import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function rootDir(): string {
  return process.env.STORAGE_PATH || "./.storage";
}

export async function ensureStorage(): Promise<string> {
  const root = path.resolve(rootDir());
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function saveBuffer(input: {
  namespace: string;
  buffer: Buffer;
  ext?: string;
  originalName?: string;
}): Promise<{ relativePath: string; absolutePath: string; bytes: number }> {
  const root = await ensureStorage();
  const dir = path.join(root, input.namespace);
  await fs.mkdir(dir, { recursive: true });

  const safeExt =
    (input.ext || path.extname(input.originalName || "").replace(/^\./, "") || "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";

  const relativePath = path.join(
    input.namespace,
    `${Date.now()}-${randomUUID()}.${safeExt}`,
  );
  const absolutePath = path.join(root, relativePath);
  await fs.writeFile(absolutePath, input.buffer);
  return {
    relativePath,
    absolutePath,
    bytes: input.buffer.byteLength,
  };
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  const absolutePath = path.join(await ensureStorage(), relativePath);
  return fs.readFile(absolutePath);
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  try {
    await fs.unlink(path.join(await ensureStorage(), relativePath));
  } catch {
    /* ignore missing */
  }
}
