import { Router } from "express";
import { getPool } from "../db/connection.js";
import { listSessions } from "../db/helpers/sessions.js";
import { cleanupCheckpointsForSession } from "../db/helpers/checkpoints.js";

const router = Router();

/**
 * POST /api/maintenance/checkpoints/prune
 * Returns { prunedCount: number }.
 *
 * Runs checkpoint cleanup across the authenticated user's sessions per retention policy.
 */
router.post("/checkpoints/prune", async (req, res) => {
  try {
    const pool = getPool();

    // Check Table Exists
    const tableCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkpoints')`
    );
    if (!tableCheck.rows[0]?.exists) {
      res.json({ prunedCount: 0 });
      return;
    }

    // Count Checkpoints (Before)
    const beforeResult = await pool.query("SELECT COUNT(*) AS count FROM checkpoints");
    const beforeCount = parseInt(beforeResult.rows[0].count, 10);

    // Cleanup Sessions
    const sessions = await listSessions(req.user!.id);
    for (const session of sessions) {
      await cleanupCheckpointsForSession(session.id);
    }

    // Count Checkpoints (After)
    const afterResult = await pool.query("SELECT COUNT(*) AS count FROM checkpoints");
    const afterCount = parseInt(afterResult.rows[0].count, 10);

    // Calculate Pruned Count
    const prunedCount = beforeCount - afterCount;

    res.json({ prunedCount });
  } catch (error) {
    console.error("[maintenance] Checkpoint prune failed:", error);
    res.status(500).json({ error: "Checkpoint prune failed" });
  }
});

export default router;
