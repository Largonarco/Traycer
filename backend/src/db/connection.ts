import pg from "pg";

// BIGINT Type Parser — Application Pool Scope Only
function parseBigInt(val: string): number {
  const num = Number(val);
  if (!Number.isSafeInteger(num)) {
    console.warn(
      `[db] BIGINT value ${val} exceeds Number.MAX_SAFE_INTEGER — precision may be lost`
    );
  }

  return num;
}

// Build per-pool TypeOverrides Instance
function buildPoolTypes(): pg.CustomTypesConfig {
  const types = new pg.TypeOverrides();

  types.setTypeParser(20, parseBigInt);

  return types;
}

// Configuration
// Supports both DATABASE_URL (production) & PG_* vars (development)
function getPoolConfig(): pg.PoolConfig {
  const types = buildPoolTypes();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return {
      types,
      connectionString: databaseUrl,
      max: parseInt(process.env.PG_POOL_MAX || "20", 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    types,
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
