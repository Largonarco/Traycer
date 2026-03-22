import { randomUUID } from "node:crypto";
import { getPool } from "../connection.js";
import type { Session, CreateSessionInput, UpdateSessionInput } from "../types.js";

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const pool = getPool();
  const now = Date.now();
  const id = randomUUID();
  const githubRepo = input.github_repo ?? null;

  await pool.query(
    `INSERT INTO sessions (id, user_id, name, github_repo, created_at, last_active_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.user_id, input.name, githubRepo, now, now]
  );

  return {
    id,
    user_id: input.user_id,
    created_at: now,
    name: input.name,
    last_active_at: now,
    github_repo: githubRepo,
  };
}

export async function getSessionById(id: string): Promise<Session | undefined> {
  const pool = getPool();

  const result = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);

  return result.rows[0] as Session | undefined;
}

export async function listSessions(userId: string): Promise<Session[]> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT * FROM sessions WHERE user_id = $1 ORDER BY last_active_at DESC`,
    [userId]
  );

  return result.rows as Session[];
}

export async function updateSession(
  id: string,
  input: UpdateSessionInput
): Promise<Session | undefined> {
  const pool = getPool();

  const existing = await getSessionById(id);
  if (!existing) return undefined;

  const now = Date.now();
  const name = input.name ?? existing.name;
  const githubRepo =
    input.github_repo !== undefined ? input.github_repo : existing.github_repo;

  await pool.query(
    `UPDATE sessions SET name = $1, github_repo = $2, last_active_at = $3 WHERE id = $4`,
    [name, githubRepo, now, id]
  );

  return {
    ...existing,
    name,
    last_active_at: now,
    github_repo: githubRepo,
  };
}

export async function touchSession(id: string): Promise<void> {
  const pool = getPool();

  const now = Date.now();
  await pool.query(`UPDATE sessions SET last_active_at = $1 WHERE id = $2`, [
    now,
    id,
  ]);
}

export async function deleteSession(id: string): Promise<boolean> {
  const pool = getPool();

  // Foreign key cascades handle messages, artifacts, and artifact_versions
  const result = await pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);

  return (result.rowCount ?? 0) > 0;
}
