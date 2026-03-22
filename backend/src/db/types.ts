// ─── User ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  github_id: number;
  created_at: number;
  updated_at: number;
  github_login: string;
  display_name: string;
  email: string | null;
  github_avatar_url: string | null;
}

export interface CreateUserInput {
  github_id: number;
  github_login: string;
  display_name: string;
  email?: string | null;
  github_avatar_url?: string | null;
}

export interface UpdateUserInput {
  github_login?: string;
  display_name?: string;
  email?: string | null;
  github_avatar_url?: string | null;
}

// ─── Session ────────────────────────────────────────────────────────────────
export interface Session {
  id: string;
  name: string;
  user_id: string;
  created_at: number;
  last_active_at: number;
  github_repo: string | null;
}

export interface CreateSessionInput {
  name: string;
  user_id: string;
  github_repo?: string | null;
}

export interface UpdateSessionInput {
  name?: string;
  github_repo?: string | null;
}

// ─── Message ────────────────────────────────────────────────────────────────
export type MessageRole = "user" | "assistant" | "system";

export type MessageType =
  | "text"
  | "error"
  | "qa_answers"
  | "qa_cancelled"
  | "artifact_ref"
  | "qa_questions"
  | "next_step_nudge"
  | "agent_activity";

export interface Message {
  id: string;
  content: string;
  role: MessageRole;
  type: MessageType;
  created_at: number;
  session_id: string;
}

export interface CreateMessageInput {
  content: string;
  role: MessageRole;
  type: MessageType;
  session_id: string;
}

// ─── Artifact ───────────────────────────────────────────────────────────────
export type ArtifactType = "spec" | "ticket";

export interface Artifact {
  id: string;
  name: string;
  session_id: string;
  type: ArtifactType;
  created_at: number;
  updated_at: number;
}

export interface CreateArtifactInput {
  name: string;
  session_id: string;
  type: ArtifactType;
}

export interface UpdateArtifactInput {
  name?: string;
  type?: ArtifactType;
}

// ─── Artifact Version ───────────────────────────────────────────────────────
export type VersionLabel =
  | "AI generated"
  | "Manual edit"
  | "AI updated"
  | `Restored from v${number}`;

export interface ArtifactVersion {
  id: string;
  label: string;
  content: string;
  created_at: number;
  artifact_id: string;
  version_number: number;
}

export interface CreateArtifactVersionInput {
  content: string;
  artifact_id: string;
  label: VersionLabel;
}

// ─── Artifact with current version (joined query) ───────────────────────────
export interface ArtifactWithCurrentVersion extends Artifact {
  current_version: ArtifactVersion | null;
}

// ─── Settings ───────────────────────────────────────────────────────────────
export type AIProvider = "openai" | "anthropic";

export interface Settings {
  id: string;
  user_id: string;
  iv: string | null;
  updated_at: number;
  auth_tag: string | null;
  github_iv: string | null;
  provider: AIProvider | null;
  github_auth_tag: string | null;
  encrypted_api_key: string | null;
  encrypted_github_token: string | null;
}

export interface UpdateSettingsInput {
  iv?: string | null;
  auth_tag?: string | null;
  github_iv?: string | null;
  provider?: AIProvider | null;
  github_auth_tag?: string | null;
  encrypted_api_key?: string | null;
  encrypted_github_token?: string | null;
}
