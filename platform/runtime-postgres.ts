import type {
  SqlDatabase,
  SqlPreparedStatement,
  SqlResult,
} from "./contracts";

type PgModule = typeof import("pg");
type Pool = InstanceType<PgModule["Pool"]>;
type PoolClient = import("pg").PoolClient;

type QueryExecutor = Pick<Pool | PoolClient, "query">;

function replaceQuestionParameters(query: string) {
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let output = "";
  for (let cursor = 0; cursor < query.length; cursor += 1) {
    const character = query[cursor];
    const previous = query[cursor - 1];
    if (character === "'" && !doubleQuoted && previous !== "\\") singleQuoted = !singleQuoted;
    if (character === '"' && !singleQuoted && previous !== "\\") doubleQuoted = !doubleQuoted;
    if (character === "?" && !singleQuoted && !doubleQuoted) {
      index += 1;
      output += `$${index}`;
    } else {
      output += character;
    }
  }
  return output;
}

const POSTGRES_NOW = "TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";

export function postgresQuery(sql: string) {
  const trimmed = sql.trim().replace(/;$/, "");
  const tableInfo = trimmed.match(/^PRAGMA\s+table_info\(([^)]+)\)$/i);
  if (tableInfo) {
    const table = tableInfo[1].replace(/[^a-zA-Z0-9_]/g, "");
    return `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`;
  }
  if (/^PRAGMA\s+optimize$/i.test(trimmed)) return "SELECT 1 WHERE FALSE";

  const insertOrIgnore = /^INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(trimmed);
  let translated = trimmed
    .replace(/^INSERT\s+OR\s+IGNORE\s+INTO\s+/i, "INSERT INTO ")
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\s+NOT\s+NULL/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/CURRENT_TIMESTAMP/gi, POSTGRES_NOW)
    .replace(/datetime\(\s*'now'\s*,\s*'-5 minutes'\s*\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '5 minutes')")
    .replace(/datetime\(\s*\?\s*\)/gi, "(?::timestamptz)")
    .replace(/datetime\(\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\)/gi, "($1::timestamptz)")
    .replace(/\bcreated_at\s*(>=|<)\s*\(CURRENT_TIMESTAMP\s*-\s*INTERVAL/gi, "(created_at::timestamptz) $1 (CURRENT_TIMESTAMP - INTERVAL");

  if (insertOrIgnore && !/\bON\s+CONFLICT\b/i.test(translated)) {
    translated += " ON CONFLICT DO NOTHING";
  }
  if (/^INSERT\s+INTO\s+ai_usage\b/i.test(translated) && !/\bRETURNING\b/i.test(translated)) {
    translated += " RETURNING id";
  }
  return replaceQuestionParameters(translated);
}

class PostgresPreparedStatement implements SqlPreparedStatement {
  constructor(
    private readonly pool: Pool,
    readonly query: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqlPreparedStatement {
    return new PostgresPreparedStatement(this.pool, this.query, values);
  }

  async execute<T>(executor: QueryExecutor): Promise<SqlResult<T>> {
    const result = await executor.query(postgresQuery(this.query), this.values);
    const first = result.rows[0] as { id?: string | number } | undefined;
    return {
      results: result.rows as T[],
      meta: {
        changes: result.rowCount ?? 0,
        last_row_id: first?.id,
      },
    };
  }

  async run<T = unknown>(): Promise<SqlResult<T>> {
    return this.execute<T>(this.pool);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.execute<T>(this.pool);
    return result.results[0] ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.execute<T>(this.pool);
  }
}

class PostgresDatabase implements SqlDatabase {
  constructor(private readonly pool: Pool) {}

  prepare(query: string): SqlPreparedStatement {
    return new PostgresPreparedStatement(this.pool, query);
  }

  async batch<T = unknown>(statements: SqlPreparedStatement[]): Promise<SqlResult<T>[]> {
    const prepared = statements.map((statement) => {
      if (!(statement instanceof PostgresPreparedStatement)) {
        throw new TypeError("A SQL batch cannot mix persistence providers.");
      }
      return statement;
    });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: SqlResult<T>[] = [];
      for (const statement of prepared) results.push(await statement.execute<T>(client));
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function createPostgresDatabase(): Promise<SqlDatabase> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required when PostgreSQL is selected.");
  const moduleName = "pg";
  const { Pool } = await import(/* @vite-ignore */ moduleName) as PgModule;
  const pool = new Pool({
    connectionString,
    max: Math.max(1, Math.min(Number(process.env.APPLITRAIL_DATABASE_POOL_SIZE ?? 10) || 10, 30)),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ssl: process.env.APPLITRAIL_DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined,
  });
  await pool.query("SELECT 1");
  return new PostgresDatabase(pool);
}
