import type {
  ApplicationRuntime,
  ObjectMetadata,
  ObjectStorage,
  SqlDatabase,
  SqlPreparedStatement,
  SqlResult,
  StoredObject,
} from "./contracts";

type NodeSqlite = typeof import("node:sqlite");
type NodeFs = typeof import("node:fs/promises");
type NodePath = typeof import("node:path");
type DatabaseSync = InstanceType<NodeSqlite["DatabaseSync"]>;

function sqliteValue(value: unknown) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(`Unsupported SQLite parameter type: ${typeof value}`);
}

function normalizedRow<T>(value: unknown): T {
  return value as T;
}

class NodePreparedStatement implements SqlPreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqlPreparedStatement {
    return new NodePreparedStatement(this.database, this.query, values);
  }

  executeRun<T = unknown>(): SqlResult<T> {
    const result = this.database
      .prepare(this.query)
      .run(...this.values.map(sqliteValue));
    return {
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  async run<T = unknown>(): Promise<SqlResult<T>> {
    return this.executeRun<T>();
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.database
      .prepare(this.query)
      .get(...this.values.map(sqliteValue));
    return row === undefined ? null : normalizedRow<T>(row);
  }

  async all<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    const rows = this.database
      .prepare(this.query)
      .all(...this.values.map(sqliteValue));
    return { results: rows.map(normalizedRow<T>), meta: {} };
  }
}

class NodeSqlDatabase implements SqlDatabase {
  constructor(private readonly database: DatabaseSync) {}

  prepare(query: string): SqlPreparedStatement {
    return new NodePreparedStatement(this.database, query);
  }

  async batch<T = unknown>(
    statements: SqlPreparedStatement[],
  ): Promise<SqlResult<T>[]> {
    const prepared = statements.map((statement) => {
      if (!(statement instanceof NodePreparedStatement)) {
        throw new TypeError("A SQL batch cannot mix persistence providers.");
      }
      return statement;
    });

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = prepared.map((statement) => statement.executeRun<T>());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class NodeStoredObject implements StoredObject {
  readonly body: ReadableStream;

  constructor(
    private readonly bytes: Uint8Array,
    readonly httpMetadata?: ObjectMetadata,
    readonly customMetadata?: Record<string, string>,
  ) {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    this.body = new Blob([buffer]).stream();
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    ) as ArrayBuffer;
  }

  writeHttpMetadata(headers: Headers) {
    if (this.httpMetadata?.contentType) {
      headers.set("Content-Type", this.httpMetadata.contentType);
    }
  }
}

type StoredMetadata = {
  httpMetadata?: ObjectMetadata;
  customMetadata?: Record<string, string>;
};

class FileObjectStorage implements ObjectStorage {
  constructor(
    private readonly root: string,
    private readonly fs: NodeFs,
    private readonly path: NodePath,
  ) {}

  private objectPath(key: string) {
    const cleanSegments = key
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        if (segment === "." || segment === "..") {
          throw new Error("Object-storage keys cannot traverse directories.");
        }
        return segment;
      });
    const target = this.path.resolve(this.root, ...cleanSegments);
    const relative = this.path.relative(this.root, target);
    if (relative.startsWith("..") || this.path.isAbsolute(relative)) {
      throw new Error("Object-storage key is outside the configured data directory.");
    }
    return target;
  }

  private metadataPath(key: string) {
    return `${this.objectPath(key)}.metadata.json`;
  }

  async put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: StoredMetadata,
  ) {
    const objectPath = this.objectPath(key);
    await this.fs.mkdir(this.path.dirname(objectPath), { recursive: true });
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(await new Response(value).arrayBuffer());
    const temporaryPath = `${objectPath}.${crypto.randomUUID()}.tmp`;
    await this.fs.writeFile(temporaryPath, bytes);
    await this.fs.rename(temporaryPath, objectPath);
    await this.fs.writeFile(
      this.metadataPath(key),
      JSON.stringify({
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      }),
      "utf8",
    );
    return { key };
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const bytes = await this.fs.readFile(this.objectPath(key));
      let metadata: StoredMetadata = {};
      try {
        metadata = JSON.parse(
          await this.fs.readFile(this.metadataPath(key), "utf8"),
        ) as StoredMetadata;
      } catch {
        metadata = {};
      }
      return new NodeStoredObject(
        bytes,
        metadata.httpMetadata,
        metadata.customMetadata,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string | string[]) {
    for (const item of Array.isArray(key) ? key : [key]) {
      await Promise.all([
        this.fs.rm(this.objectPath(item), { force: true }),
        this.fs.rm(this.metadataPath(item), { force: true }),
      ]);
    }
  }

  private async keys(directory = this.root): Promise<string[]> {
    try {
      const entries = await this.fs.readdir(directory, {
        withFileTypes: true,
        encoding: "utf8",
      });
      const keys: string[] = [];
      for (const entry of entries) {
        const entryPath = this.path.join(directory, entry.name);
        if (entry.isDirectory()) {
          keys.push(...(await this.keys(entryPath)));
        } else if (!entry.name.endsWith(".metadata.json")) {
          keys.push(this.path.relative(this.root, entryPath).split(this.path.sep).join("/"));
        }
      }
      return keys;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? "";
    const allKeys = (await this.keys()).filter((key) => key.startsWith(prefix)).sort();
    const offset = Math.max(0, Number(options?.cursor ?? 0) || 0);
    const limit = Math.max(1, Math.min(options?.limit ?? 1_000, 1_000));
    const page = allKeys.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      objects: page.map((key) => ({ key })),
      truncated: nextOffset < allKeys.length,
      cursor: nextOffset < allKeys.length ? String(nextOffset) : undefined,
    };
  }
}

async function nodeModules() {
  const sqliteName = "node:sqlite";
  const fsName = "node:fs/promises";
  const pathName = "node:path";
  return Promise.all([
    import(/* @vite-ignore */ sqliteName) as Promise<NodeSqlite>,
    import(/* @vite-ignore */ fsName) as Promise<NodeFs>,
    import(/* @vite-ignore */ pathName) as Promise<NodePath>,
  ]);
}

export async function createNodeSqliteDatabase(dataDirectory: string) {
  const [{ DatabaseSync }, fs, path] = await nodeModules();
  await fs.mkdir(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, "applitrail.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  return new NodeSqlDatabase(database);
}

export async function createFileObjectStorage(dataDirectory: string) {
  const [, fs, path] = await nodeModules();
  const resumeDirectory = path.join(dataDirectory, "resumes");
  await fs.mkdir(resumeDirectory, { recursive: true });
  return new FileObjectStorage(resumeDirectory, fs, path);
}

function configuredDatabaseProvider() {
  const configured = process.env.APPLITRAIL_DATABASE_PROVIDER?.trim().toLowerCase();
  if (configured === "postgres" || configured === "sqlite") return configured;
  return process.env.DATABASE_URL?.trim() ? "postgres" : "sqlite";
}

function configuredStorageProvider() {
  const configured = process.env.APPLITRAIL_STORAGE_PROVIDER?.trim().toLowerCase();
  if (configured === "azure" || configured === "filesystem") return configured;
  return process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() ? "azure" : "filesystem";
}

export async function createNodeRuntime(): Promise<ApplicationRuntime> {
  const [, fs, path] = await nodeModules();

  const dataDirectory = path.resolve(
    process.env.APPLITRAIL_DATA_DIR || path.join(process.cwd(), ".data"),
  );
  await fs.mkdir(dataDirectory, { recursive: true });

  const databaseProvider = configuredDatabaseProvider();
  const storageProvider = configuredStorageProvider();
  const database = databaseProvider === "postgres"
    ? await (await import("./runtime-postgres")).createPostgresDatabase()
    : await createNodeSqliteDatabase(dataDirectory);
  const resumeStorage = storageProvider === "azure"
    ? await (await import("./runtime-azure")).createAzureBlobStorage()
    : await createFileObjectStorage(dataDirectory);

  return {
    database,
    resumeStorage,
    provider: "node",
    databaseDialect: databaseProvider,
    storageProvider: storageProvider === "azure" ? "azure-blob" : "filesystem",
    dataLocation: databaseProvider === "postgres" || storageProvider === "azure"
      ? `${databaseProvider} database and ${storageProvider} storage`
      : dataDirectory,
  };
}
