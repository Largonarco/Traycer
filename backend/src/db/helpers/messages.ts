import { randomUUID } from "node:crypto";
import { getPool } from "../connection.js";
import type { Message, CreateMessageInput, MessageType } from "../types.js";

export async function insertMessage(input: CreateMessageInput): Promise<Message> {
  const pool = getPool();
  const id = randomUUID();
  const now = Date.now();

  await pool.query(
    `INSERT INTO messages (id, session_id, role, type, content, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.session_id, input.role, input.type, input.content, now]
  );

  return {
    id,
    created_at: now,
    role: input.role,
    type: input.type,
    content: input.content,
    session_id: input.session_id,
  };
}

export async function listMessagesBySession(sessionId: string): Promise<Message[]> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT id, session_id, role, type, content, created_at
     FROM messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  return result.rows as Message[];
}

export async function updateMessageType(
  messageId: string,
  newType: MessageType
): Promise<void> {
  const pool = getPool();

  await pool.query(`UPDATE messages SET type = $1 WHERE id = $2`, [
    newType,
    messageId,
  ]);
}

/**
 * Delete all messages for a session. Used by the sync flow to do a
 * full replace when the client sends its authoritative message list.
 */
export async function deleteMessagesBySession(sessionId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query(
    `DELETE FROM messages WHERE session_id = $1`,
    [sessionId]
  );

  return result.rowCount ?? 0;
}

/**
 * Shape of a single message in the sync payload from the frontend.
 * The client sends its full local messages array; the backend replaces
 * the DB state for that session with exactly these messages.
 */
export interface SyncMessageInput {
  id: string;
  content: string;
  type: MessageType;
  created_at: number;
  role: "user" | "assistant" | "system";
}

/**
 * Sync messages from the frontend client to the database.
 *
 * Strategy: upsert each message individually using INSERT ... ON CONFLICT.
 * This handles both new messages (pending on client) and messages that
 * already exist in the DB (previously synced). The client sends only
 * the new pending messages, so we just insert them.
 *
 * Runs inside a transaction for atomicity.
 */
export async function syncMessages(
  sessionId: string,
  messages: SyncMessageInput[]
): Promise<{ synced: number }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let count = 0;
    for (const msg of messages) {
      await client.query(
        `INSERT INTO messages (id, session_id, role, type, content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           role = EXCLUDED.role,
           type = EXCLUDED.type,
           content = EXCLUDED.content,
           created_at = EXCLUDED.created_at`,
        [msg.id, sessionId, msg.role, msg.type, msg.content, msg.created_at]
      );
      count++;
    }
    await client.query("COMMIT");

    return { synced: count };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
