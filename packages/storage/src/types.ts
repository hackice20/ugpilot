export type SaveBufferInput = {
  namespace: string;
  buffer: Buffer;
  ext?: string;
  originalName?: string;
};

export type SavedObject = {
  /** Opaque storage key persisted in the DB (local relative path or R2 object key). */
  relativePath: string;
  /** Local absolute path, or `r2://bucket/key` for R2. */
  absolutePath: string;
  bytes: number;
};

export type StorageDriver = {
  ensure(): Promise<void>;
  save(input: SaveBufferInput): Promise<SavedObject>;
  read(relativePath: string): Promise<Buffer>;
  delete(relativePath: string): Promise<void>;
};
