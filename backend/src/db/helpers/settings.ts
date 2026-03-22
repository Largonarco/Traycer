import { randomUUID } from "node:crypto";
import { getPool } from "../connection.js";
import type { Settings, UpdateSettingsInput } from "../types.js";

export async function ensureSettingsRow(userId: string): Promise<void> {
  const pool = getPool();

  await pool.query(
    `INSERT INTO settings (id, user_id, provider, encrypted_api_key, iv, auth_tag,
                           encrypted_github_token, github_iv, github_auth_tag, updated_at)
     VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [randomUUID(), userId, Date.now()]
  );
}

export async function getSettings(userId: string): Promise<Settings> {
  const pool = getPool();

  const result = await pool.query("SELECT * FROM settings WHERE user_id = $1", [userId]);
  if (result.rows[0]) {
    return result.rows[0] as Settings;
  }

  await ensureSettingsRow(userId);
  const retry = await pool.query("SELECT * FROM settings WHERE user_id = $1", [userId]);

  return retry.rows[0] as Settings;
}

export async function updateSettings(userId: string, updates: UpdateSettingsInput): Promise<Settings> {
  await ensureSettingsRow(userId);

  const pool = getPool();
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.provider !== undefined) {
    fields.push(`provider = $${paramIndex++}`);
    values.push(updates.provider);
  }
  if (updates.encrypted_api_key !== undefined) {
    fields.push(`encrypted_api_key = $${paramIndex++}`);
    values.push(updates.encrypted_api_key);
  }
  if (updates.iv !== undefined) {
    fields.push(`iv = $${paramIndex++}`);
    values.push(updates.iv);
  }
  if (updates.auth_tag !== undefined) {
    fields.push(`auth_tag = $${paramIndex++}`);
    values.push(updates.auth_tag);
  }
  if (updates.encrypted_github_token !== undefined) {
    fields.push(`encrypted_github_token = $${paramIndex++}`);
    values.push(updates.encrypted_github_token);
  }
  if (updates.github_iv !== undefined) {
    fields.push(`github_iv = $${paramIndex++}`);
    values.push(updates.github_iv);
  }
  if (updates.github_auth_tag !== undefined) {
    fields.push(`github_auth_tag = $${paramIndex++}`);
    values.push(updates.github_auth_tag);
  }

  if (fields.length === 0) {
    return await getSettings(userId);
  }

  fields.push(`updated_at = $${paramIndex++}`);
  values.push(Date.now());
  values.push(userId);

  await pool.query(
    `UPDATE settings SET ${fields.join(", ")} WHERE user_id = $${paramIndex}`,
    values
  );

  return await getSettings(userId);
}

export async function updateLLMKey(
  userId: string,
  data: {
    provider: string;
    encrypted_api_key: string;
    iv: string;
    auth_tag: string;
  }
): Promise<Settings> {
  return updateSettings(userId, {
    iv: data.iv,
    auth_tag: data.auth_tag,
    encrypted_api_key: data.encrypted_api_key,
    provider: data.provider as Settings["provider"],
  });
}

export async function updateGitHubToken(
  userId: string,
  data: {
    encrypted_github_token: string;
    github_iv: string;
    github_auth_tag: string;
  }
): Promise<Settings> {
  return updateSettings(userId, {
    github_iv: data.github_iv,
    github_auth_tag: data.github_auth_tag,
    encrypted_github_token: data.encrypted_github_token,
  });
}

export async function clearLLMKey(userId: string): Promise<Settings> {
  return updateSettings(userId, {
    iv: null,
    auth_tag: null,
    encrypted_api_key: null,
  });
}

export async function clearGitHubToken(userId: string): Promise<Settings> {
  return updateSettings(userId, {
    github_iv: null,
    github_auth_tag: null,
    encrypted_github_token: null,
  });
}
