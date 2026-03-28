import type { Response } from "express";
import type { FileData } from "../index.js";
import type { StreamConfig } from "./types.js";
import { SubagentTracker } from "./tracker.js";
import { Command } from "@langchain/langgraph";
import type { Artifact } from "../../db/index.js";
import { getCommand } from "../utils/commands.js";
import { processStreamEvent } from "./processor.js";
import { getInterruptPayload } from "../utils/qa.js";
import { getNextCommand } from "../utils/commands.js";
import type { createCentralAgent } from "../index.js";
import { HumanMessage } from "@langchain/core/messages";
import { tryParseDiffFromContent, applyDiffs, DiffPatch } from "../utils/diff.js";
import {
  sendSSE,
  sendSSEError,
} from "../../utils/sse.js";
import {
  getSessionById,
  createArtifact,
  getCurrentVersion,
  createArtifactVersion,
  listArtifactsBySession,
} from "../../db/index.js";


// Shared Types
type CommandDescriptor = NonNullable<ReturnType<typeof getCommand>>;
type SessionRecord = NonNullable<Awaited<ReturnType<typeof getSessionById>>>;
type AgentInstance = Awaited<ReturnType<typeof createCentralAgent>>["agent"];

// Default Recursion Limit - Higher Limits
const DEFAULT_RECURSION_LIMIT = 10_000;

/**
 * Builds the full LangGraph stream config from our StreamConfig type,
 * injecting recursionLimit if not already set.
 */
function buildStreamConfig(config: StreamConfig): Record<string, unknown> {
  return {
    ...config,
    recursionLimit: config.recursionLimit ?? DEFAULT_RECURSION_LIMIT,
  };
}

// ─── Stream Agent Fresh Execution ───────────────────────────────────────────
/**
 * For artifact-producing commands, eagerly find-or-create the artifact
 * before streaming begins so we can emit an `artifact:start` SSE event
 * that tells the frontend to enter streaming mode on the correct artifact.
 *
 * Returns the pre-created artifact (or null for non-artifact commands).
 */
async function ensureArtifactForCommand(
  command: CommandDescriptor,
  sessionId: string,
  res: Response
): Promise<Artifact | null> {
  if (!command.producesArtifact || !command.artifactType) return null;

  const artifactName = getArtifactNameForCommand(command.name);
  const existingArtifacts = await listArtifactsBySession(sessionId);

  let artifact = existingArtifacts.find(
    (a) => a.name === artifactName && a.type === command.artifactType
  ) ?? existingArtifacts.find(
    (a) => a.type === command.artifactType
  );

  const isNew = !artifact;
  if (!artifact) {
    artifact = await createArtifact(sessionId, artifactName, command.artifactType);
  }

  // Notify FE - Artifact Streaming Starts
  sendSSE(res, "artifact:start", {
    artifactId: artifact.id,
    artifactName: artifact.name,
    artifactType: artifact.type,
    isNew,
  });

  return artifact;
}

export async function streamAgentFresh(
  agent: AgentInstance,
  skillFiles: Record<string, FileData>,
  userMessage: string,
  config: StreamConfig,
  command: CommandDescriptor,
  sessionId: string,
  session: SessionRecord,
  res: Response,
  isDisconnected: () => boolean
): Promise<void> {
  let tokenBuffer = "";
  let interruptDetected = false;
  let questionsPayload: unknown = null;
  const tracker = new SubagentTracker(res);
  let diffPayload: { artifactId: string; patches: DiffPatch[]; baseVersion: number } | null = null;

  // Eagerly Create Artifact (If Command Supports)
  const preCreatedArtifact = await ensureArtifactForCommand(command, sessionId, res);

  try {
    const stream = await agent.stream(
      { messages: [new HumanMessage({ content: userMessage })], files: skillFiles },
      buildStreamConfig(config)
    );

    for await (const event of stream) {
      if (isDisconnected()) {
        // Client Disconnected (Discard Partial Content)
        break;
      }

      processStreamEvent(
        event,
        res,
        isDisconnected,
        tracker,
        (chunk) => {
          tokenBuffer += chunk;
        },
        (questions) => {
          // When interrupt() is called inside the ask_clarification_questions
          // tool, the graph pauses. The onQA callback is triggered either by
          // __interrupt__ appearing in the stream output, or null if the
          // interrupt shape was unexpected. Either way, we mark it detected
          // and fall back to checkpoint read if questions is null.
          interruptDetected = true;
          if (questions) {
            questionsPayload = questions;
          }
        },
        (diff) => {
          diffPayload = diff;
        }
      );
    }
  } catch (err) {
    // Check If interrupt
    const errStr = err instanceof Error ? err.message : String(err);
    if (errStr.includes("interrupt") || errStr.includes("Interrupt") || errStr.includes("GraphInterrupt")) {
      interruptDetected = true;
    } else {
      // Mark Running Subagents as Errored
      // Proper Event Streaming
      markRunningSubagentsAsErrored(tracker, errStr);
      throw err;
    }
  }

  if (isDisconnected()) {
    // Client Disconnected (Discard Partial Content)
    if (!res.writableEnded) res.end();
    return;
  }

  // If interrupt was detected (via stream event or exception) but the onQA
  // callback wasn't triggered during streaming, read the interrupt payload
  // from the checkpoint state. When interrupt() is called
  // inside a tool, the payload is persisted in the __interrupt__ channel's
  // pending writes and can be retrieved from the checkpointer.
  if (interruptDetected && !questionsPayload) {
    const payload = await getInterruptPayload(sessionId);
    if (payload && typeof payload === "object" && "questions" in (payload as Record<string, unknown>)) {
      questionsPayload = payload;
    }
  }

  // Check Agent Output for Structured Data
  if (!interruptDetected && tokenBuffer.length > 0 && !command.producesArtifact) {
    const parsedDiff = tryParseDiffFromContent(tokenBuffer);
    if (parsedDiff) {
      diffPayload = parsedDiff;
    }
  }

  // Finalize stream results
  await finalizeStreamResult(tokenBuffer, interruptDetected, questionsPayload, diffPayload, command, sessionId, res, preCreatedArtifact);
}

// ─── Stream Agent Resume (from interrupt) ───────────────────────────────────
export async function streamAgentResume(
  agent: AgentInstance,
  skillFiles: Record<string, FileData>,
  answers: Array<{ questionId: string; selectedOptions: string[] }>,
  config: StreamConfig,
  command: CommandDescriptor,
  sessionId: string,
  session: SessionRecord,
  res: Response,
  isDisconnected: () => boolean
): Promise<void> {
  let tokenBuffer = "";
  let interruptDetected = false;
  let questionsPayload: unknown = null;
  const tracker = new SubagentTracker(res);
  let diffPayload: { artifactId: string; patches: DiffPatch[]; baseVersion: number } | null = null;

  // Eagerly Create Artifact (If Command Supports)
  const preCreatedArtifact = await ensureArtifactForCommand(command, sessionId, res);

  try {
    // Resume from interrupt using Command.
    // Per LangGraph "Interrupts within tool calls" docs:
    // When resuming, pass Command({ resume: <value> }) with the same
    // thread_id config. The resume value is returned by interrupt() inside
    // the tool, so it becomes the tool's return value to the agent.
    const resumeCommand = new Command({ resume: { answers } });
    const stream = await agent.stream(
      resumeCommand,
      buildStreamConfig(config)
    );

    for await (const event of stream) {
      if (isDisconnected()) break;

      processStreamEvent(
        event,
        res,
        isDisconnected,
        tracker,
        (chunk) => {
          tokenBuffer += chunk;
        },
        (questions) => {
          interruptDetected = true;
          if (questions) {
            questionsPayload = questions;
          }
        },
        (diff) => {
          diffPayload = diff;
        }
      );
    }
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    if (errStr.includes("interrupt") || errStr.includes("Interrupt") || errStr.includes("GraphInterrupt")) {
      interruptDetected = true;
    } else {
      // Mark any running subagents as errored before re-throwing.
      markRunningSubagentsAsErrored(tracker, errStr);
      throw err;
    }
  }

  if (isDisconnected()) {
    if (!res.writableEnded) res.end();
    return;
  }

  // Same interrupt payload extraction as streamAgentFresh — use the shared
  // utility that reads from the checkpointer's __interrupt__ channel.
  if (interruptDetected && !questionsPayload) {
    const payload = await getInterruptPayload(sessionId);
    if (payload && typeof payload === "object" && "questions" in (payload as Record<string, unknown>)) {
      questionsPayload = payload;
    }
  }

  // Parse Structured Content from Buffer
  if (!interruptDetected && tokenBuffer.length > 0 && !command.producesArtifact) {
    const parsedDiff = tryParseDiffFromContent(tokenBuffer);
    if (parsedDiff) {
      diffPayload = parsedDiff;
    }
  }

  // Finalize Stream Results
  await finalizeStreamResult(tokenBuffer, interruptDetected, questionsPayload, diffPayload, command, sessionId, res, preCreatedArtifact);
}

// ─── Shared Post-Stream Result Handler ──────────────────────────────────────

/**
 * Handles all post-stream result scenarios: interrupts, diffs, artifacts, and text.
 * Shared between streamAgentFresh and streamAgentResume to eliminate duplication.
 *
 * NOTE: This function no longer persists messages to the DB. The frontend
 * maintains the authoritative messages array and syncs to the backend via
 * the separate /messages/sync endpoint. The `done` SSE event carries all
 * the information the frontend needs to build the correct local messages.
 */
async function finalizeStreamResult(
  tokenBuffer: string,
  interruptDetected: boolean,
  questionsPayload: unknown,
  diffPayload: { artifactId: string; patches: DiffPatch[]; baseVersion: number } | null,
  command: CommandDescriptor,
  sessionId: string,
  res: Response,
  preCreatedArtifact: Artifact | null = null
): Promise<void> {
  // Handle interrupt (Q&A Questions)
  if (interruptDetected && questionsPayload) {
    // Send the Q&A payload to the FE
    sendSSE(res, "qa", questionsPayload);
    if (!res.writableEnded) res.end();
    return;
  }

  // Handle Diff Results
  if (diffPayload && !command.producesArtifact) {
    const diffResult = await applyDiffs({
      patches: diffPayload.patches,
      artifactId: diffPayload.artifactId,
      baseVersion: diffPayload.baseVersion,
    });

    if (diffResult.success) {
      sendSSE(res, "diff", {
        artifactId: diffPayload.artifactId,
        patches: diffPayload.patches,
        baseVersion: diffPayload.baseVersion,
        newVersion: diffResult.versionNumber,
      });

      const nextCmd = getNextCommand(command.name);

      sendSSE(res, "done", {
        artifactId: diffPayload.artifactId,
        versionNumber: diffResult.versionNumber,
        nextCommand: nextCmd,
      });
    } else {
      sendSSEError(res, "patch_failed", JSON.stringify(diffResult));
    }

    if (!res.writableEnded) res.end();
    return;
  }

  // Handle Artifact Generation
  // The artifact was eagerly created by ensureArtifactForCommand() before
  // streaming began (so the frontend could enter streaming mode). Here we
  // just create the version with the streamed content.
  if (command.producesArtifact && tokenBuffer.length > 0) {
    const artifact = preCreatedArtifact ?? await (async () => {
      // Fallback: if ensureArtifactForCommand wasn't called (shouldn't happen),
      // create the artifact now.
      const artifactName = getArtifactNameForCommand(command.name);
      const existingArtifacts = await listArtifactsBySession(sessionId);
      const existing = existingArtifacts.find(
        (a) => a.name === artifactName && a.type === command.artifactType
      );
      return existing ?? await createArtifact(sessionId, artifactName, command.artifactType!);
    })();

    // Determine label: if the artifact had no versions before this stream,
    // it's "AI generated"; otherwise it's "AI updated".
    const existingVersion = await getCurrentVersion(artifact.id);
    const label = existingVersion ? "AI updated" : "AI generated";
    const version = await createArtifactVersion(artifact.id, tokenBuffer, label);

    const nextCmd = getNextCommand(command.name);

    sendSSE(res, "done", {
      nextCommand: nextCmd,
      artifactId: artifact.id,
      versionNumber: version.version_number,
    });

    if (!res.writableEnded) res.end();
    return;
  }

  // Handle non-artifact commands (analysis, validation summary) or empty responses.
  // Always send a `done` event so the frontend knows the stream completed cleanly
  // and doesn't trigger the "Stream ended unexpectedly" fallback path.
  const nextCmd = getNextCommand(command.name);

  sendSSE(res, "done", {
    artifactId: null,
    versionNumber: null,
    nextCommand: nextCmd,
  });

  if (!res.writableEnded) res.end();
}

// ─── Utility ────────────────────────────────────────────────────────────────
/**
 * Maps command name to a human-readable artifact name.
 */
function getArtifactNameForCommand(commandName: string): string {
  const nameMap: Record<string, string> = {
    "/prd": "PRD",
    "/flows": "Core Flows",
    "/tech_plan": "Tech Plan",
    "/ticket_breakdown": "Ticket Breakdown",
  };

  return nameMap[commandName] || commandName.replace("/", "").replace(/_/g, " ");
}

/**
 * Marks all currently-running subagents as errored. Called when the stream
 * encounters an unrecoverable error (not an interrupt) so that the frontend
 * receives a subagent:error event for each subagent that was still active.
 * This prevents subagent cards from being stuck in "running" state forever.
 */
function markRunningSubagentsAsErrored(tracker: SubagentTracker, errorMessage: string): void {
  const allSubagents = tracker.getAll();

  for (const sub of allSubagents) {
    if (sub.status === "running" || sub.status === "pending") {
      tracker.error(sub.id, `Stream failed: ${errorMessage.slice(0, 300)}`);
    }
  }
}
