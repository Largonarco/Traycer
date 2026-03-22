import { applySchema } from "./schema.js";
import { getPool } from "./connection.js";

/**
 * Initializes the PostgreSQL database:
 * - Connects to the pool and applies the full schema
 * - Checkpoint tables are managed by LangGraph's PostgresSaver
 *
 * Per-user settings rows are created lazily during authentication.
 */
export async function initializeDatabases(): Promise<void> {
  const pool = getPool();

  await applySchema(pool);
  console.log("[db] Database initialized successfully");
}
