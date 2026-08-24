export type SqlMetadata = {
  changes?: number;
  last_row_id?: number | string;
  [key: string]: unknown;
};

export type SqlResult<T = unknown> = {
  results: T[];
  meta: SqlMetadata;
};

export interface SqlPreparedStatement {
  bind(...values: unknown[]): SqlPreparedStatement;
  run<T = unknown>(): Promise<SqlResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
}

export interface SqlDatabase {
  prepare(query: string): SqlPreparedStatement;
  batch<T = unknown>(statements: SqlPreparedStatement[]): Promise<SqlResult<T>[]>;
}

export type ObjectMetadata = {
  contentType?: string;
};

export interface StoredObject {
  body: ReadableStream;
  customMetadata?: Record<string, string>;
  httpMetadata?: ObjectMetadata;
  arrayBuffer(): Promise<ArrayBuffer>;
  writeHttpMetadata(headers: Headers): void;
}

export interface ObjectStorage {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: ObjectMetadata;
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

export type RuntimeProvider = "cloudflare" | "node";
export type DatabaseDialect = "sqlite" | "postgres";
export type StorageProvider = "cloudflare-r2" | "filesystem" | "azure-blob";

export type ApplicationRuntime = {
  database: SqlDatabase;
  resumeStorage: ObjectStorage;
  provider: RuntimeProvider;
  databaseDialect: DatabaseDialect;
  storageProvider: StorageProvider;
  dataLocation: string;
};
