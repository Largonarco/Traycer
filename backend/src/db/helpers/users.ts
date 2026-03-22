import { randomUUID } from "node:crypto";
import { getPool } from "../connection.js";
import type { User, CreateUserInput, UpdateUserInput } from "../types.js";

export async function upsertUser(input: CreateUserInput): Promise<User> {
  const pool = getPool();
  const now = Date.now();
  const id = randomUUID();
  const email = input.email ?? null;
  const githubAvatarUrl = input.github_avatar_url ?? null;

  await pool.query(
    `INSERT INTO users (id, github_id, github_login, github_avatar_url, display_name, email, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(github_id) DO UPDATE SET
       github_login = EXCLUDED.github_login,
       github_avatar_url = EXCLUDED.github_avatar_url,
       display_name = EXCLUDED.display_name,
       email = EXCLUDED.email,
       updated_at = EXCLUDED.updated_at`,
    [id, input.github_id, input.github_login, githubAvatarUrl, input.display_name, email, now, now]
  );

  return (await getUserByGitHubId(input.github_id))!;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const pool = getPool();

  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);

  return result.rows[0] as User | undefined;
}

export async function getUserByGitHubId(githubId: number): Promise<User | undefined> {
  const pool = getPool();

  const result = await pool.query(`SELECT * FROM users WHERE github_id = $1`, [githubId]);

  return result.rows[0] as User | undefined;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput
): Promise<User | undefined> {
  const pool = getPool();

  const existing = await getUserById(id);
  if (!existing) return undefined;

  const now = Date.now();
  const email = input.email !== undefined ? input.email : existing.email;
  const githubLogin = input.github_login ?? existing.github_login;
  const displayName = input.display_name ?? existing.display_name;
  const githubAvatarUrl =
    input.github_avatar_url !== undefined
      ? input.github_avatar_url
      : existing.github_avatar_url;

  await pool.query(
    `UPDATE users SET github_login = $1, github_avatar_url = $2, display_name = $3, email = $4, updated_at = $5 WHERE id = $6`,
    [githubLogin, githubAvatarUrl, displayName, email, now, id]
  );

  return {
    ...existing,
    github_login: githubLogin,
    github_avatar_url: githubAvatarUrl,
    display_name: displayName,
    email,
    updated_at: now,
  };
}

export async function deleteUser(id: string): Promise<boolean> {
  const pool = getPool();

  // Foreign key cascades handle sessions/settings cleanup
  const result = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

  return (result.rowCount ?? 0) > 0;
}
