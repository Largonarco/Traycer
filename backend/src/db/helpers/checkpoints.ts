import { getPool } from "../connection.js";

/**
 * Cleanup Session Checkpoint Rows.
 *
 * Retention Policy:
 * - Keep active/pending interrupt checkpoints
 * - Keep the most recent completed checkpoint
 * - Delete everything else
 *
 * Note: LangGraph's PostgresSaver creates tables named `checkpoints` and `checkpoint_writes`.
 * The checkpoint table has columns: thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
 * type, checkpoint, metadata.
 * The metadata JSON may contain a "status" field indicating checkpoint state.
 */
export async function cleanupCheckpointsForSession(threadId: string): Promise<void> {
  const pool = getPool();

  // Check if checkpoints table exists (PostgresSaver creates it)
  const tableCheck = await pool.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkpoints' AND table_schema = current_schema())`
  );
  if (!tableCheck.rows[0]?.exists) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: Find all checkpoints for this thread
    const allCheckpoints = await client.query(
      `SELECT checkpoint_id, checkpoint_ns, metadata
       FROM checkpoints WHERE thread_id = $1
       ORDER BY checkpoint_id DESC`,
      [threadId]
    );
    if (allCheckpoints.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    // Step 2: Categorize checkpoints
    const toKeep = new Set<string>();
    let foundLatestCompleted = false;
    for (const cp of allCheckpoints.rows) {
      let status: string | undefined;

      try {
        const meta = typeof cp.metadata === 'string'
          ? JSON.parse(cp.metadata || '{}')
          : (cp.metadata ?? {});
        status = meta.status;
      } catch {
        // If metadata is not valid, treat as completed
        status = "completed";
      }

      // Keep active/pending interrupt checkpoints
      if (status === "pending" || status === "interrupted") {
        toKeep.add(cp.checkpoint_id);
        continue;
      }
      // Keep the most recent completed checkpoint (first one we encounter since ordered DESC)
      if (!foundLatestCompleted) {
        toKeep.add(cp.checkpoint_id);
        foundLatestCompleted = true;
      }
    }

    // Step 3: Delete checkpoints not in the keep set
    const toDelete = allCheckpoints.rows
      .filter((cp) => !toKeep.has(cp.checkpoint_id))
      .map((cp) => cp.checkpoint_id);

    if (toDelete.length > 0) {
      // Delete from checkpoint_writes first
      const writesCheck = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkpoint_writes' AND table_schema = current_schema())`
      );
      if (writesCheck.rows[0]?.exists) {
        await client.query(
          `DELETE FROM checkpoint_writes WHERE thread_id = $1 AND checkpoint_id = ANY($2)`,
          [threadId, toDelete]
        );
      }

      // Delete from checkpoints
      await client.query(
        `DELETE FROM checkpoints WHERE thread_id = $1 AND checkpoint_id = ANY($2)`,
        [threadId, toDelete]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete Session's ALL checkpoint data.
 * Used when a session is deleted.
 */
export async function deleteAllCheckpointsForSession(threadId: string): Promise<void> {
  const pool = getPool();

  const tableCheck = await pool.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkpoints' AND table_schema = current_schema())`
  );
  if (!tableCheck.rows[0]?.exists) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete from checkpoint_writes first
    const writesCheck = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkpoint_writes' AND table_schema = current_schema())`
    );
    if (writesCheck.rows[0]?.exists) {
      await client.query(`DELETE FROM checkpoint_writes WHERE thread_id = $1`, [threadId]);
    }

    // Delete from checkpoints
    await client.query(`DELETE FROM checkpoints WHERE thread_id = $1`, [threadId]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
