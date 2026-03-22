import pg from "pg";

// BIGINT type parser
// By default node-pg returns BIGINT (OID 20) as strings. Our application
// stores timestamps and github_id as BIGINT but the TypeScript types expect
// `number`. Since our values fit safely within Number.MAX_SAFE_INTEGER we
// override the parser to return numbers directly.
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));

// Configuration
// Supports both DATABASE_URL (production) & PG_* vars (development)
function getPoolConfig(): pg.PoolConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      max: parseInt(process.env.PG_POOL_MAX || "20", 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    user: process.env.PG_USER || "postgres",
    host: process.env.PG_HOST || "localhost",
    database: process.env.PG_DATABASE || "traycer",
    password: process.env.PG_PASSWORD || "postgres",
    port: parseInt(process.env.PG_PORT || "5432", 10),
    max: parseInt(process.env.PG_POOL_MAX || "20", 10),
  };
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(getPoolConfig());
    pool.on("error", (err) => {
      console.error("[db] Unexpected pool error:", err);
    });
  }

  return pool;
}

/**
 * Returns a connection string for the PostgreSQL checkpointer.
 * Prefers DATABASE_URL if set, otherwise builds from individual vars.
 */
export function getConnectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const port = process.env.PG_PORT || "5432";
  const user = process.env.PG_USER || "postgres";
  const host = process.env.PG_HOST || "localhost";
  const db = process.env.PG_DATABASE || "traycer";
  const pw = process.env.PG_PASSWORD || "postgres";

  return `postgresql://${user}:${pw}@${host}:${port}/${db}`;
}

export async function closeAll(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
