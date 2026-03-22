export { applySchema } from "./schema.js";
export { initializeDatabases } from "./init.js";
export { getPool, getConnectionString, closeAll } from "./connection.js";

// Checkpoint Helpers
export {
  cleanupCheckpointsForSession,
  deleteAllCheckpointsForSession,
} from "./helpers/checkpoints.js";

// User Helpers
export {
  upsertUser,
  getUserById,
  getUserByGitHubId,
  updateUser,
  deleteUser,
} from "./helpers/users.js";

// Session Helpers
export {
  listSessions,
  touchSession,
  deleteSession,
  updateSession,
  createSession,
  getSessionById,
} from "./helpers/sessions.js";

// Message Helpers
export {
  insertMessage,
  syncMessages,
  updateMessageType,
  listMessagesBySession,
  deleteMessagesBySession,
} from "./helpers/messages.js";

// Artifact Helpers
export {
  createArtifact,
  updateArtifact,
  deleteArtifact,
  getArtifactById,
  getCurrentVersion,
  getVersionByNumber,
  createArtifactVersion,
  listArtifactsBySession,
  listVersionsByArtifact,
  getArtifactWithCurrentVersion,
  listArtifactsWithCurrentVersionBySession,
} from "./helpers/artifacts.js";

// Settings Helpers
export {
  getSettings,
  clearLLMKey,
  updateLLMKey,
  updateSettings,
  clearGitHubToken,
  updateGitHubToken,
  ensureSettingsRow,
} from "./helpers/settings.js";

// Sync Types
export type { SyncMessageInput } from "./helpers/messages.js";

// Types
export type {
  User,
  Session,
  Message,
  Artifact,
  Settings,
  AIProvider,
  MessageRole,
  MessageType,
  ArtifactType,
  VersionLabel,
  ArtifactVersion,
  CreateUserInput,
  UpdateUserInput,
  CreateSessionInput,
  UpdateSessionInput,
  CreateMessageInput,
  CreateArtifactInput,
  UpdateArtifactInput,
  UpdateSettingsInput,
  CreateArtifactVersionInput,
  ArtifactWithCurrentVersion,
} from "./types.js";
