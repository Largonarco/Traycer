import { Router } from "express";
import type { Request, Response } from "express";
import type { MessageType } from "../db/types.js";
import { decryptSettings } from "../utils/decrypt.js";
import { createCentralAgent } from "../agent/index.js";
import { AnswersPayloadSchema } from "../agent/schemas.js";
import { hasPendingInterrupt } from "../agent/utils/qa.js";
import type { StreamConfig } from "../agent/streaming/index.js";
import { getCommand, extractCommandName } from "../agent/utils/commands.js";
import { canStartStream, registerStream, unregisterStream } from "../middleware/stream.js";
import {
  streamAgentFresh,
  streamAgentResume,
} from "../agent/streaming/index.js";
import {
  sendSSE,
  sendSSEError,
  sseHeaders,
  startHeartbeat,
} from "../utils/sse.js";
import {
  touchSession,
  syncMessages,
  getSessionById,
  updateMessageType,
  listMessagesBySession,
} from "../db/index.js";
import type { SyncMessageInput } from "../db/index.js";

const VALID_ROLES: ReadonlySet<string> = new Set([
  "user",
  "system",
  "assistant",
]);

const VALID_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "text",
  "error",
  "qa_answers",
  "qa_cancelled",
  "artifact_ref",
  "qa_questions",
  "next_step_nudge",
  "agent_activity",
]);

const router = Router();

// POST /api/sessions/:id/chat
//
// Chat with an agent session — SSE stream only, no DB persistence.
// The frontend is the source of truth for messages during a session;
// persistence happens via the separate /messages/sync endpoint.
router.post("/:id/chat", async (req: Request, res: Response) => {
  const sessionId = req.params.id as string;
  const { message, answers, activeCommand: clientActiveCommand } = req.body as {
    message?: string;
    answers?: Array<{ questionId: string; selectedOptions: string[] }>;
    activeCommand?: string | null;
  };

  // Pre-SSE validation
  let session: Awaited<ReturnType<typeof getSessionById>>;
  let provider: "openai" | "anthropic", apiKey: string, githubToken: string | null;
  try {
    session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!message && !answers) {
      res.status(400).json({ error: "Either 'message' or 'answers' is required" });
      return;
    }

    // Get Settings
    const settingsResult = await decryptSettings(req.user!.id);
    if ("error" in settingsResult) {
      res.status(400).json({ error: settingsResult.error });
      return;
    }
    ({ provider, apiKey, githubToken } = settingsResult);

    if (answers) {
      // Validate Answers Shape
      try {
        AnswersPayloadSchema.parse({ answers });
      } catch {
        res.status(400).json({ error: "Invalid answers format" });
        return;
      }
    }
  } catch (err) {
    console.error("[chat] Pre-stream error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to initialize chat" });
    }
    return;
  }

  // Check Stream Concurrency Limits
  const streamCheck = canStartStream(sessionId, req.user!.id);
  if (!streamCheck.allowed) {
    res.status(429).json({ error: streamCheck.reason });
    return;
  }

  sseHeaders(res);

  // Register Stream & Start Heartbeat
  registerStream(sessionId, req.user!.id);
  const stopHeartbeat = startHeartbeat(res);

  // Track Client Disconnect
  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
  });

  try {
    // Touch Session's last_active_at
    await touchSession(sessionId);

    // Detect Interrupt State
    const pendingInterrupt = await hasPendingInterrupt(sessionId);

    // Determine Command
    const commandName = message ? extractCommandName(message) : null;
    const command = commandName ? getCommand(commandName) : null;

    // Build Agent
    const { agent, skillFiles } = await createCentralAgent({
      provider,
      sessionId,
      githubToken,
      decryptedApiKey: apiKey,
      githubRepo: session.github_repo,
    });
    // Build Config
    const config: StreamConfig = {
      subgraphs: true,
      streamMode: ["updates", "messages"],
      configurable: { thread_id: sessionId },
    };

    // Branch logic
    if (pendingInterrupt && answers) {
      // Resume Q&A Interrupt
      // activeCommand Preference (FE > DB)
      let activeCommand = clientActiveCommand
        ? getCommand(clientActiveCommand)
        : null;
      if (!activeCommand) {
        // Fallback: Read from DB
        const allMessages = await listMessagesBySession(sessionId);
        const lastCommand = findLastCommandFromHistory(allMessages.map((m) => m.content));
        activeCommand = lastCommand ? getCommand(lastCommand) : getCommand("/trigger");
      }
      if (!activeCommand) {
        sendSSEError(res, "stream_failed", "Could not determine active command for resume");
        res.end();
        return;
      }

      await streamAgentResume(agent, skillFiles, answers, config, activeCommand, sessionId, session, res, () => clientDisconnected);
    } else if (pendingInterrupt && commandName && command) {
      // New Command on Pending Interrupt — Cancel Q&A
      // Update DB Record
      const allMessages = await listMessagesBySession(sessionId);
      const pendingQa = [...allMessages]
        .reverse()
        .find((m) => m.type === "qa_questions");
      if (pendingQa) {
        await updateMessageType(pendingQa.id, "qa_cancelled");

        // Notify FE
        sendSSE(res, "qa_cancelled", { messageId: pendingQa.id });
      }

      await streamAgentFresh(agent, skillFiles, message!, config, command, sessionId, session, res, () => clientDisconnected);
    } else {
      // Normal execution
      // If Unexpected Pending Interrupt — Cancel
      if (pendingInterrupt) {
        const allMessages = await listMessagesBySession(sessionId);
        const pendingQa = [...allMessages]
          .reverse()
          .find((m) => m.type === "qa_questions");
        if (pendingQa) {
          await updateMessageType(pendingQa.id, "qa_cancelled");

          // Notify FE
          sendSSE(res, "qa_cancelled", { messageId: pendingQa.id });
        }
      }

      const activeCommand = command || getCommand("/trigger")!;

      await streamAgentFresh(agent, skillFiles, message!, config, activeCommand, sessionId, session, res, () => clientDisconnected);
    }
  } catch (err) {
    console.error("[chat] Unhandled error in chat handler:", err);

    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";

    // Determine Error Code
    let code = "stream_failed";
    if (errorMessage.includes("401") || errorMessage.includes("auth") || errorMessage.includes("Unauthorized")) {
      code = "credential_failure";
    } else if (errorMessage.includes("checkpoint")) {
      code = "checkpoint_failure";
    }

    sendSSEError(res, code, errorMessage);

    if (!res.writableEnded) {
      res.end();
    }
  } finally {
    stopHeartbeat();
    unregisterStream(sessionId);
  }
});

// POST /api/sessions/:id/messages/sync
//
// Persist messages from the frontend client to the database.
// The frontend maintains the authoritative messages array during a session;
// this endpoint receives the pending (new) messages and upserts them.
// This decouples persistence from the SSE stream, eliminating race conditions.
router.post("/:id/messages/sync", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id as string;

    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { messages } = req.body as {
      messages?: Array<{
        id: string;
        role: string;
        type: string;
        content: string;
        created_at: number;
      }>;
    };
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "'messages' array is required" });
      return;
    }

    // Validate Messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (!msg.id || typeof msg.id !== "string") {
        res.status(400).json({ error: `messages[${i}].id is required and must be a string` });
        return;
      }
      if (!msg.role || !VALID_ROLES.has(msg.role)) {
        res.status(400).json({ error: `messages[${i}].role must be one of: ${[...VALID_ROLES].join(", ")}` });
        return;
      }
      if (!msg.type || !VALID_MESSAGE_TYPES.has(msg.type)) {
        res.status(400).json({ error: `messages[${i}].type must be one of: ${[...VALID_MESSAGE_TYPES].join(", ")}` });
        return;
      }
      if (typeof msg.content !== "string") {
        res.status(400).json({ error: `messages[${i}].content must be a string` });
        return;
      }
      if (typeof msg.created_at !== "number") {
        res.status(400).json({ error: `messages[${i}].created_at must be a number` });
        return;
      }
    }

    // Upsert Messages
    const syncInput: SyncMessageInput[] = messages.map((msg) => ({
      id: msg.id,
      content: msg.content,
      created_at: msg.created_at,
      type: msg.type as MessageType,
      role: msg.role as "user" | "assistant" | "system",
    }));
    const result = await syncMessages(sessionId, syncInput);

    // Touch Session's last_active_at
    await touchSession(sessionId);

    res.json({ synced: result.synced });
  } catch (err) {
    console.error("[chat] Failed to sync messages:", err);
    res.status(500).json({ error: "Failed to sync messages" });
  }
});

// GET /api/sessions/:id/messages
//
// List all messages for a session (used for initial session hydration).
router.get("/:id/messages", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id as string;

    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Get All Messages (Filter qa_cancelled)
    const allMessages = await listMessagesBySession(sessionId);
    const filteredMessages = allMessages.filter(
      (msg) => msg.type !== "qa_cancelled"
    );

    res.json(filteredMessages);
  } catch (err) {
    console.error("[chat] Failed to list messages:", err);
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// ─── Utility Functions ──────────────────────────────────────────────────────
/**
 * Finds the last slash command from a list of message contents.
 */
function findLastCommandFromHistory(contents: string[]): string | null {
  for (let i = contents.length - 1; i >= 0; i--) {
    const cmd = extractCommandName(contents[i]);
    if (cmd) return cmd;
  }

  return null;
}

export default router;
