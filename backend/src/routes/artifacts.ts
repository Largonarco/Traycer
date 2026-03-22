import { Router } from "express";
import type { ArtifactType } from "../db/index.js";
import {
  getSessionById,
  createArtifact,
  getArtifactById,
  getCurrentVersion,
  createArtifactVersion,
  listVersionsByArtifact,
  listArtifactsBySession,
} from "../db/index.js";

const router = Router();

/**
 * GET /api/artifacts?sessionId=
 *
 * List all artifacts for a session.
 */
router.get("/", async (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId query parameter is required" });
    return;
  }

  try {
    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const artifacts = await listArtifactsBySession(sessionId);

    res.json(artifacts);
  } catch (err) {
    console.error("[artifacts] Failed to list artifacts:", err);
    res.status(500).json({ error: "Failed to list artifacts" });
  }
});

/**
 * POST /api/artifacts
 * Body: { name, type, sessionId }
 *
 * Create a new artifact.
 */
router.post("/", async (req, res) => {
  const { name, type, sessionId } = req.body as {
    name?: string;
    type?: string;
    sessionId?: string;
  };

  if (!name || !type || !sessionId) {
    res
      .status(400)
      .json({ error: "name, type, and sessionId are required" });
    return;
  }
  if (type !== "spec" && type !== "ticket") {
    res.status(400).json({ error: 'type must be "spec" or "ticket"' });
    return;
  }

  try {
    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const artifact = await createArtifact(sessionId, name, type as ArtifactType);

    res.status(201).json(artifact);
  } catch (err) {
    console.error("[artifacts] Failed to create artifact:", err);
    res.status(500).json({ error: "Failed to create artifact" });
  }
});

/**
 * GET /api/artifacts/:id/versions
 *
 * List all versions for an artifact in reverse chronological order.
 */
router.get("/:id/versions", async (req, res) => {
  const { id } = req.params;

  try {
    const artifact = await getArtifactById(id);
    if (!artifact) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }

    const session = await getSessionById(artifact.session_id);
    if (!session || session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const versions = await listVersionsByArtifact(id);

    // Return Reverse Order
    versions.reverse();
    res.json(versions);
  } catch (err) {
    console.error("[artifacts] Failed to list versions:", err);
    res.status(500).json({ error: "Failed to list versions" });
  }
});

/**
 * POST /api/artifacts/:id/versions
 * Body: { content, baseVersion }
 *
 * Manual save — create a new version.
 * Applies optimistic concurrency: rejects with 409 if current version ≠ baseVersion.
 */
router.post("/:id/versions", async (req, res) => {
  const { id } = req.params;
  const { content, baseVersion, label } = req.body as {
    content?: string;
    baseVersion?: number;
    label?: string;
  };

  if (content === undefined || content === null) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (baseVersion === undefined || baseVersion === null) {
    res.status(400).json({ error: "baseVersion is required" });
    return;
  }

  // Validate optional label against the schema CHECK constraint
  const ALLOWED_LABELS = ["Manual edit", "AI generated", "AI updated"];
  const resolvedLabel = label ?? "Manual edit";
  const isRestoredLabel = /^Restored from v\d+$/.test(resolvedLabel);
  if (!ALLOWED_LABELS.includes(resolvedLabel) && !isRestoredLabel) {
    res.status(400).json({ error: `Invalid label. Must be one of: ${ALLOWED_LABELS.join(", ")}, or "Restored from v{N}"` });
    return;
  }

  try {
    const artifact = await getArtifactById(id);
    if (!artifact) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }

    const session = await getSessionById(artifact.session_id);
    if (!session || session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Optimistic Concurrency Check
    const current = await getCurrentVersion(id);
    const currentVersionNumber = current ? current.version_number : 0;
    if (currentVersionNumber !== baseVersion) {
      res.status(409).json({
        baseVersion,
        error: "Version conflict",
        currentVersion: currentVersionNumber,
      });

      return;
    }

    const version = await createArtifactVersion(id, content, resolvedLabel);
    res.status(201).json(version);
  } catch (err) {
    console.error("[artifacts] Failed to create version:", err);
    res.status(500).json({ error: "Failed to create version" });
  }
});

/**
 * GET /api/artifacts/:id/versions/current
 *
 * Returns the latest version content for an artifact.
 */
router.get("/:id/versions/current", async (req, res) => {
  const { id } = req.params;

  try {
    const artifact = await getArtifactById(id);
    if (!artifact) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }

    const session = await getSessionById(artifact.session_id);
    if (!session || session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const current = await getCurrentVersion(id);
    if (!current) {
      res.status(404).json({ error: "No versions found for this artifact" });
      return;
    }

    res.json(current);
  } catch (err) {
    console.error("[artifacts] Failed to get current version:", err);
    res.status(500).json({ error: "Failed to get current version" });
  }
});

export default router;
