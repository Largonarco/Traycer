/**
 * Seed script — exercises all DB helpers for manual verification.
 *
 * Run with:  npx tsx src/db/seed.ts
 */

import { initializeDatabases } from "./init.js";
import {
  upsertUser,
  getUserById,
  getUserByGitHubId,
  updateUser,
  deleteUser,
} from "./helpers/users.js";
import {
  createSession,
  getSessionById,
  listSessions,
  updateSession,
  touchSession,
  deleteSession,
} from "./helpers/sessions.js";
import {
  insertMessage,
  listMessagesBySession,
  updateMessageType,
} from "./helpers/messages.js";
import {
  createArtifact,
  getArtifactById,
  listArtifactsBySession,
  updateArtifact,
  deleteArtifact,
  createArtifactVersion,
  getCurrentVersion,
  getVersionByNumber,
  listVersionsByArtifact,
  getArtifactWithCurrentVersion,
  listArtifactsWithCurrentVersionBySession,
} from "./helpers/artifacts.js";
import {
  ensureSettingsRow,
  getSettings,
  updateSettings,
  updateLLMKey,
  updateGitHubToken,
  clearLLMKey,
  clearGitHubToken,
} from "./helpers/settings.js";
import {
  cleanupCheckpointsForSession,
  deleteAllCheckpointsForSession,
} from "./helpers/checkpoints.js";
import { closeAll } from "./connection.js";

function section(title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

function log(label: string, data: unknown) {
  console.log(`\n  ▸ ${label}:`);
  const str = data === undefined ? "undefined" : JSON.stringify(data, null, 2);
  console.log(`    ${str.replace(/\n/g, "\n    ")}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Initializing databases...");
  await initializeDatabases();

  // ─── Users ──────────────────────────────────────────────────────────────────
  section("Users");

  const user1 = await upsertUser({
    github_id: 12345,
    github_login: "octocat",
    display_name: "The Octocat",
    email: "octocat@github.com",
    github_avatar_url: "https://avatars.githubusercontent.com/u/12345",
  });
  log("upsertUser #1 (new)", user1);

  const user2 = await upsertUser({
    github_id: 67890,
    github_login: "devuser",
    display_name: "Dev User",
  });
  log("upsertUser #2 (no email/avatar)", user2);

  // Test upsert (update existing)
  const user1Updated = await upsertUser({
    github_id: 12345,
    github_login: "octocat",
    display_name: "The Octocat (Updated)",
    email: "new-email@github.com",
    github_avatar_url: "https://avatars.githubusercontent.com/u/12345?v=2",
  });
  log("upsertUser #1 (upsert update)", user1Updated);

  log("getUserById", await getUserById(user1.id));
  log("getUserByGitHubId(12345)", await getUserByGitHubId(12345));

  const userUpdated = await updateUser(user1.id, { display_name: "Octocat Prime" });
  log("updateUser", userUpdated);

  // ─── Sessions ───────────────────────────────────────────────────────────────
  section("Sessions");

  const session1 = await createSession({ name: "Auth System Epic", github_repo: "acme/backend-api", user_id: user1.id });
  log("createSession #1", session1);

  const session2 = await createSession({ name: "Dashboard Redesign", user_id: user1.id });
  log("createSession #2 (no repo)", session2);

  log("getSessionById", await getSessionById(session1.id));
  log("listSessions", await listSessions(user1.id));

  const updated = await updateSession(session1.id, { name: "Auth System Epic (updated)" });
  log("updateSession", updated);

  await touchSession(session2.id);
  const sessionsAfterTouch = await listSessions(user1.id);
  log("touchSession (session2 now most recent)", sessionsAfterTouch.map((s) => ({ id: s.id, name: s.name, last_active_at: s.last_active_at })));

  // ─── Messages ───────────────────────────────────────────────────────────────
  section("Messages");

  const msg1 = await insertMessage({
    session_id: session1.id,
    role: "user",
    type: "text",
    content: "Build a JWT-based auth system with refresh tokens",
  });
  log("insertMessage (user text)", msg1);

  const msg2 = await insertMessage({
    session_id: session1.id,
    role: "assistant",
    type: "qa_questions",
    content: JSON.stringify({
      questions: [
        { id: "q1", text: "Which OAuth providers?", options: ["Google", "GitHub", "Both"] },
        { id: "q2", text: "Token expiry preference?", options: ["15min", "1hr", "24hr"] },
      ],
    }),
  });
  log("insertMessage (qa_questions)", msg2);

  const msg3 = await insertMessage({
    session_id: session1.id,
    role: "user",
    type: "qa_answers",
    content: JSON.stringify({ answers: { q1: "Both", q2: "15min" } }),
  });
  log("insertMessage (qa_answers)", msg3);

  log("listMessagesBySession", await listMessagesBySession(session1.id));

  await updateMessageType(msg2.id, "qa_cancelled");
  const messagesAfterUpdate = await listMessagesBySession(session1.id);
  log("updateMessageType → qa_cancelled", messagesAfterUpdate.find((m) => m.id === msg2.id));

  // ─── Artifacts ──────────────────────────────────────────────────────────────
  section("Artifacts");

  const artifact1 = await createArtifact(session1.id, "PRD — Auth System", "spec");
  log("createArtifact (spec)", artifact1);

  const artifact2 = await createArtifact(session1.id, "Ticket: JWT Implementation", "ticket");
  log("createArtifact (ticket)", artifact2);

  log("getArtifactById", await getArtifactById(artifact1.id));
  log("listArtifactsBySession", await listArtifactsBySession(session1.id));

  const updatedArtifact = await updateArtifact(artifact1.id, { name: "PRD — Auth System v2" });
  log("updateArtifact", updatedArtifact);

  // ─── Artifact Versions ──────────────────────────────────────────────────────
  section("Artifact Versions");

  const v1 = await createArtifactVersion(artifact1.id, "# PRD — Auth System\n\nInitial draft...", "AI generated");
  log("createArtifactVersion v1", v1);

  const v2 = await createArtifactVersion(artifact1.id, "# PRD — Auth System\n\nRevised with OAuth details...", "Manual edit");
  log("createArtifactVersion v2", v2);

  const v3 = await createArtifactVersion(artifact1.id, "# PRD — Auth System\n\nFinal after AI validation...", "AI updated");
  log("createArtifactVersion v3", v3);

  log("getCurrentVersion", await getCurrentVersion(artifact1.id));
  log("getVersionByNumber(1)", await getVersionByNumber(artifact1.id, 1));
  log("listVersionsByArtifact", await listVersionsByArtifact(artifact1.id));

  // Restored version
  const v4 = await createArtifactVersion(artifact1.id, "# PRD — Auth System\n\nInitial draft...", "Restored from v1");
  log("createArtifactVersion v4 (restored from v1)", v4);

  // ─── Artifact with Current Version (joined) ─────────────────────────────────
  section("Artifact with Current Version");

  log("getArtifactWithCurrentVersion", await getArtifactWithCurrentVersion(artifact1.id));
  log("listArtifactsWithCurrentVersionBySession", await listArtifactsWithCurrentVersionBySession(session1.id));

  // ─── Settings (per-user) ────────────────────────────────────────────────────
  section("Settings");

  await ensureSettingsRow(user1.id);
  log("getSettings (initial)", await getSettings(user1.id));

  await updateLLMKey(user1.id, {
    provider: "openai",
    encrypted_api_key: "enc_key_abc123",
    iv: "iv_abc123",
    auth_tag: "tag_abc123",
  });
  log("updateLLMKey (openai)", await getSettings(user1.id));

  await updateGitHubToken(user1.id, {
    encrypted_github_token: "enc_gh_token_xyz",
    github_iv: "gh_iv_xyz",
    github_auth_tag: "gh_tag_xyz",
  });
  log("updateGitHubToken", await getSettings(user1.id));

  await updateSettings(user1.id, { provider: "anthropic" });
  log("updateSettings (switch to anthropic)", await getSettings(user1.id));

  await clearLLMKey(user1.id);
  log("clearLLMKey", await getSettings(user1.id));

  await clearGitHubToken(user1.id);
  log("clearGitHubToken", await getSettings(user1.id));

  // ─── Checkpoint Cleanup (no-op since LangGraph tables don't exist yet) ──────
  section("Checkpoint Cleanup (graceful no-op)");

  console.log("\n  ▸ cleanupCheckpointsForSession (no tables yet — should not throw)");
  await cleanupCheckpointsForSession(session1.id);
  console.log("    ✓ OK");

  console.log("\n  ▸ deleteAllCheckpointsForSession (no tables yet — should not throw)");
  await deleteAllCheckpointsForSession(session1.id);
  console.log("    ✓ OK");

  // ─── Cascade Delete ─────────────────────────────────────────────────────────
  section("Cascade Delete");

  log("Before delete — session1 messages count", (await listMessagesBySession(session1.id)).length);
  log("Before delete — session1 artifacts count", (await listArtifactsBySession(session1.id)).length);

  const deleted = await deleteSession(session1.id);
  log("deleteSession result", deleted);

  log("After delete — session1 messages count", (await listMessagesBySession(session1.id)).length);
  log("After delete — session1 artifacts count", (await listArtifactsBySession(session1.id)).length);
  log("After delete — getSessionById", await getSessionById(session1.id));

  // Clean up session2
  await deleteSession(session2.id);

  // Also demonstrate user cascade
  const tempUser = await upsertUser({ github_id: 99999, github_login: "tempuser", display_name: "Temp" });
  const tempSession = await createSession({ name: "Temp Session", user_id: tempUser.id });
  log("Before user delete — temp session exists", await getSessionById(tempSession.id));
  await deleteUser(tempUser.id);
  log("After user delete — temp session gone", await getSessionById(tempSession.id));

  // ─── Final state ────────────────────────────────────────────────────────────
  section("Final State");
  log("All sessions (user1)", await listSessions(user1.id));
  log("Settings (user1)", await getSettings(user1.id));

  // Clean up user2
  await deleteUser(user2.id);
  log("After deleting user2 — getUserById", await getUserById(user2.id));

  // ─── Done ───────────────────────────────────────────────────────────────────
  await closeAll();
  console.log("\n✅ Seed script completed successfully!\n");
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  closeAll().finally(() => process.exit(1));
});
