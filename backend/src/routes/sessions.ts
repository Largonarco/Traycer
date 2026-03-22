import { Router } from "express";
import {
  listSessions,
  createSession,
  deleteSession,
  getSessionById,
  deleteAllCheckpointsForSession,
} from "../db/index.js";

const router = Router();

/**
 * GET /api/sessions
 *
 * List sessions for the authenticated user ordered by last_active_at DESC.
 */
router.get("/", async (req, res) => {
  try {
    const sessions = await listSessions(req.user!.id);

    res.json(sessions);
  } catch (err) {
    console.error("[sessions] Failed to list sessions:", err);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

/**
 * POST /api/sessions
 * Body: { name: string, github_repo?: string }
 *
 * Create a new session.
 * github_repo should be in "owner/repo" format.
 */
router.post("/", async (req, res) => {
  try {
    const { name, github_repo } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "name is required and must be a non-empty string" });
      return;
    }
    if (github_repo !== undefined && github_repo !== null) {
      if (typeof github_repo !== "string") {
        res.status(400).json({ error: "github_repo must be a string in owner/repo format" });
        return;
      }
      // Validate owner/repo Format
      const repoPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
      if (!repoPattern.test(github_repo)) {
        res.status(400).json({ error: "github_repo must be in owner/repo format" });
        return;
      }
    }

    // Create Session
    const session = await createSession({
      name: name.trim(),
      user_id: req.user!.id,
      github_repo: github_repo ?? null,
    });

    res.status(201).json(session);
  } catch (err) {
    console.error("[sessions] Failed to create session:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/**
 * DELETE /api/sessions/:id
 *
 * Delete a session and all its messages/artifacts/versions.
 * Also triggers checkpoint cleanup for the session's thread.
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await getSessionById(id);
    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (existing.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Cleanup Session's Checkpoint
    try {
      await deleteAllCheckpointsForSession(id);
    } catch (err) {
      console.warn("[sessions] Checkpoint cleanup failed (non-fatal):", err);
    }

    // Delete Session
    await deleteSession(id);

    res.status(204).send();
  } catch (err) {
    console.error("[sessions] Failed to delete session:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

export default router;
