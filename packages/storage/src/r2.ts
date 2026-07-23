import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { SaveBufferInput, SavedObject, StorageDriver } from "./types.js";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set Cloudflare R2 credentials when STORAGE_DRIVER=r2.`,
    );
  }
  return value;
}

function loadConfig(): R2Config {
  return {
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET"),
    endpoint: process.env.R2_ENDPOINT?.trim() || undefined,
  };
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

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("Empty R2 object body");
  }
  // AWS SDK v3 stream / Uint8Array / Blob-ish
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    return Buffer.from(
      await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray(),
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createR2Driver(): StorageDriver {
  const config = loadConfig();
  const endpoint =
    config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async ensure() {
      // Bucket must already exist in the Cloudflare dashboard.
    },

    async save(input) {
      const ext = safeExt(input);
      const key = objectKey(input.namespace, ext);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: guessContentType(ext),
        }),
      );

      return {
        relativePath: key,
        absolutePath: `r2://${config.bucket}/${key}`,
        bytes: input.buffer.byteLength,
      } satisfies SavedObject;
    },

    async read(relativePath) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: relativePath,
        }),
      );
      return bodyToBuffer(result.Body);
    },

    async delete(relativePath) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: relativePath,
          }),
        );
      } catch {
        /* ignore missing / transient */
      }
    },
  };
}

function guessContentType(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "ogg":
      return "audio/ogg";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}
