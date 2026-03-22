import { randomUUID } from "node:crypto";
import { getPool } from "../connection.js";
import type {
  Artifact,
  ArtifactType,
  ArtifactVersion,
  ArtifactWithCurrentVersion,
} from "../types.js";

// Artifact CRUD
export async function createArtifact(
  sessionId: string,
  name: string,
  type: ArtifactType
): Promise<Artifact> {
  const pool = getPool();
  const now = Date.now();
  const id = randomUUID();

  await pool.query(
    `INSERT INTO artifacts (id, session_id, name, type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, sessionId, name, type, now, now]
  );

  return { id, session_id: sessionId, name, type, created_at: now, updated_at: now };
}

export async function getArtifactById(id: string): Promise<Artifact | undefined> {
  const pool = getPool();

  const result = await pool.query(`SELECT * FROM artifacts WHERE id = $1`, [id]);

  return result.rows[0] as Artifact | undefined;
}

export async function listArtifactsBySession(sessionId: string): Promise<Artifact[]> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT * FROM artifacts WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );

  return result.rows as Artifact[];
}

export async function updateArtifact(
  id: string,
  updates: Partial<Pick<Artifact, "name" | "type">>
): Promise<Artifact | undefined> {
  const pool = getPool();

  const existing = await getArtifactById(id);
  if (!existing) return undefined;

  const now = Date.now();
  const name = updates.name ?? existing.name;
  const type = updates.type ?? existing.type;

  await pool.query(
    `UPDATE artifacts SET name = $1, type = $2, updated_at = $3 WHERE id = $4`,
    [name, type, now, id]
  );

  return { ...existing, name, type, updated_at: now };
}

export async function deleteArtifact(id: string): Promise<boolean> {
  const pool = getPool();

  // Versions are deleted via ON DELETE CASCADE
  const result = await pool.query(`DELETE FROM artifacts WHERE id = $1`, [id]);

  return (result.rowCount ?? 0) > 0;
}

// Artifact Versions
export async function createArtifactVersion(
  artifactId: string,
  content: string,
  label: string
): Promise<ArtifactVersion> {
  const pool = getPool();
  const id = randomUUID();
  const now = Date.now();

  // Get the next version number
  const row = await pool.query(
    `SELECT COALESCE(MAX(version_number), 0) AS max_version
     FROM artifact_versions
     WHERE artifact_id = $1`,
    [artifactId]
  );
  const versionNumber = (row.rows[0].max_version as number) + 1;

  await pool.query(
    `INSERT INTO artifact_versions (id, artifact_id, version_number, content, label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, artifactId, versionNumber, content, label, now]
  );

  // Update the parent artifact's updated_at timestamp
  await pool.query(`UPDATE artifacts SET updated_at = $1 WHERE id = $2`, [now, artifactId]);

  return {
    id,
    label,
    content,
    created_at: now,
    artifact_id: artifactId,
    version_number: versionNumber,
  };
}

export async function getCurrentVersion(artifactId: string): Promise<ArtifactVersion | undefined> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT * FROM artifact_versions
     WHERE artifact_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [artifactId]
  );

  return result.rows[0] as ArtifactVersion | undefined;
}

export async function getVersionByNumber(
  artifactId: string,
  versionNumber: number
): Promise<ArtifactVersion | undefined> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT * FROM artifact_versions
     WHERE artifact_id = $1 AND version_number = $2`,
    [artifactId, versionNumber]
  );

  return result.rows[0] as ArtifactVersion | undefined;
}

export async function listVersionsByArtifact(artifactId: string): Promise<ArtifactVersion[]> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT * FROM artifact_versions
     WHERE artifact_id = $1
     ORDER BY version_number ASC`,
    [artifactId]
  );

  return result.rows as ArtifactVersion[];
}

// Joint Queries
export async function getArtifactWithCurrentVersion(
  id: string
): Promise<ArtifactWithCurrentVersion | undefined> {
  const artifact = await getArtifactById(id);
  if (!artifact) return undefined;

  const currentVersion = (await getCurrentVersion(id)) ?? null;

  return { ...artifact, current_version: currentVersion };
}

export async function listArtifactsWithCurrentVersionBySession(
  sessionId: string
): Promise<ArtifactWithCurrentVersion[]> {
  const artifacts = await listArtifactsBySession(sessionId);

  const results: ArtifactWithCurrentVersion[] = [];
  for (const artifact of artifacts) {
    const currentVersion = (await getCurrentVersion(artifact.id)) ?? null;
    results.push({ ...artifact, current_version: currentVersion });
  }

  return results;
}
