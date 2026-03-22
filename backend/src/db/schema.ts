import type pg from "pg";

/**
 * Apply full app schema to PostgreSQL.
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to call on every startup.
 */
export async function applySchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                TEXT    PRIMARY KEY,
      github_id         BIGINT  NOT NULL UNIQUE,
      github_login      TEXT    NOT NULL,
      github_avatar_url TEXT,
      display_name      TEXT    NOT NULL,
      email             TEXT,
      created_at        BIGINT  NOT NULL,
      updated_at        BIGINT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT    PRIMARY KEY,
      user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT    NOT NULL,
      github_repo     TEXT,
      created_at      BIGINT  NOT NULL,
      last_active_at  BIGINT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT    PRIMARY KEY,
      session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT    NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      type        TEXT    NOT NULL CHECK (type IN ('text', 'qa_questions', 'qa_answers', 'qa_cancelled', 'artifact_ref', 'next_step_nudge', 'error', 'agent_activity')),
      content     TEXT    NOT NULL,
      created_at  BIGINT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id          TEXT    PRIMARY KEY,
      session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      type        TEXT    NOT NULL CHECK (type IN ('spec', 'ticket')),
      created_at  BIGINT  NOT NULL,
      updated_at  BIGINT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifact_versions (
      id              TEXT    PRIMARY KEY,
      artifact_id     TEXT    NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      version_number  INTEGER NOT NULL,
      content         TEXT    NOT NULL,
      label           TEXT    NOT NULL,
      created_at      BIGINT  NOT NULL,
      UNIQUE (artifact_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id                      TEXT    PRIMARY KEY,
      user_id                 TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      provider                TEXT    CHECK (provider IS NULL OR provider IN ('openai', 'anthropic')),
      encrypted_api_key       TEXT,
      iv                      TEXT,
      auth_tag                TEXT,
      encrypted_github_token  TEXT,
      github_iv               TEXT,
      github_auth_tag         TEXT,
      updated_at              BIGINT  NOT NULL
    );

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(artifact_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id, last_active_at);
    CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
  `);
}
