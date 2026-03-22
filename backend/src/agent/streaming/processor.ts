import type { Response } from "express";
import { sendSSE } from "../../utils/sse.js";
import type { SubagentTracker } from "./tracker.js";
import type { DiffPatch } from "../utils/diff.js";

// Step Event Nodes
const INTERESTING_NODES = new Set(["model_request", "tools"]);

// Stream Event Processor
/**
 * Processes a single event from the LangGraph multi-mode stream.
 *
 * When streamMode is an array (e.g. ["updates", "messages"]), each event
 * is a [namespace, mode, data] triple. When streamMode is a single string,
 * events are [namespace, data] tuples.
 *
 * We handle both formats for robustness, but the primary path is triples.
 *
 * Per the Deep Agents streaming documentation:
 * - Namespace identifies which agent produced the event
 * - Empty namespace = main agent
 * - Namespace containing "tools:<id>" = subagent spawned by that tool call
 * - The pregel task ID in the namespace differs from the tool_call_id
 *
 * SSE events emitted:
 * - "step"                 — { agent: string, node: string }
 * - "token"                — { chunk: string }
 * - "subagent:spawn"       — { id, name, description }       (via tracker)
 * - "subagent:running"     — { id }                           (via tracker)
 * - "subagent:token"       — { id, chunk: string }
 * - "subagent:tool_call"   — { id, tool: string }
 * - "subagent:tool_result" — { id, tool, path, preview }
 * - "subagent:complete"    — { id, result }                   (via tracker)
 * - "subagent:error"       — { id, error }                    (via tracker)
 * - "synthesizing"         — {}                                (via tracker)
 * - "qa"                   — { questions: [...] }              (via onQA callback)
 */
export function processStreamEvent(
  event: unknown,
  res: Response,
  isDisconnected: () => boolean,
  tracker: SubagentTracker,
  onToken: (chunk: string) => void,
  onQA: (questions: unknown | null) => void,
  onDiff: (diff: { artifactId: string; patches: DiffPatch[]; baseVersion: number }) => void
): void {
  if (isDisconnected() || res.writableEnded) return;

  // ── Parse the event format ──────────────────────────────────────────
  // Multi-mode: [namespace, mode, data]
  // Single-mode: [namespace, data]
  // Raw object: data (no tuple)
  let data: unknown = event;
  let namespace: string[] = [];
  let mode: string | null = null;

  if (Array.isArray(event)) {
    if (event.length === 3 && Array.isArray(event[0]) && typeof event[1] === "string") {
      // [namespace, mode, data] triple
      data = event[2];
      mode = event[1] as string;
      namespace = event[0] as string[];
    } else if (event.length === 2 && Array.isArray(event[0])) {
      // [namespace, data] tuple (fallback for single-mode)
      data = event[1];
      namespace = event[0] as string[];

      // Infer mode from data shape
      if (Array.isArray(data) && data.length >= 1) {
        mode = "messages";
      } else if (data && typeof data === "object" && !Array.isArray(data)) {
        mode = "updates";
      }
    }
  }

  // Determine if this event came from a subagent namespace.
  // Per docs: namespace containing "tools:<id>" identifies a subagent.
  const isSubagent = namespace.some(
    (s: string) => typeof s === "string" && s.startsWith("tools:")
  );

  // Extract the pregel task ID from the namespace segment.
  // e.g., "tools:abc123" → pregelId = "abc123"
  const subagentNsSegment = namespace.find(
    (s: string) => typeof s === "string" && s.startsWith("tools:")
  );
  const pregelId = subagentNsSegment ? subagentNsSegment.split(":")[1] : undefined;

  // If we're receiving events from a subagent namespace, ensure the tracker
  // has associated this pregel ID with a tracked subagent and marked it running.
  // The resolved toolCallId is used as the canonical `id` in all SSE events
  // so the frontend can correlate tokens/tool_calls/results back to the
  // correct subagent card.
  let resolvedSubagentId: string | undefined;
  if (isSubagent && pregelId) {
    resolvedSubagentId = tracker.markRunning(pregelId);
  }

  // ── Handle "updates" mode ───────────────────────────────────────────
  // Per docs: yields { [nodeName]: { messages: [...] } } objects.
  // Used for step progress and subagent lifecycle detection.

  if (mode === "updates" && data && typeof data === "object" && !Array.isArray(data)) {
    const chunkObj = data as Record<string, unknown>;

    // Check for __interrupt__ in updates
    if (chunkObj.__interrupt__) {
      handleInterrupt(chunkObj.__interrupt__, onQA);
      return;
    }

    for (const [nodeName, nodeData] of Object.entries(chunkObj)) {
      // Emit step events for interesting nodes
      if (INTERESTING_NODES.has(nodeName)) {
        const agent = isSubagent ? (resolvedSubagentId || subagentNsSegment || "subagent") : "main";
        sendSSE(res, "step", { agent, node: nodeName });
      }

      // ─── Phase 1: Detect subagent spawning ────────────────────────
      // When the main agent's model_request contains task tool_calls,
      // a subagent has been spawned.
      if (!isSubagent && nodeName === "model_request" && nodeData && typeof nodeData === "object") {
        const messages = (nodeData as { messages?: unknown[] }).messages;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            const toolCalls = (msg as { tool_calls?: Array<{ id: string; name: string; args?: Record<string, unknown> }> }).tool_calls;
            if (Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                if (tc.name === "task" && tc.id) {
                  const subagentType = (tc.args?.subagent_type as string) || "general-purpose";
                  const description = (tc.args?.description as string) || "";
                  tracker.spawn(tc.id, subagentType, description);
                }
              }
            }
          }
        }
      }

      // ─── Phase 3: Detect subagent completing ──────────────────────
      // When the main agent's tools node returns a ToolMessage for the task tool,
      // the subagent has completed and returned its result.
      if (!isSubagent && nodeName === "tools" && nodeData && typeof nodeData === "object") {
        const messages = (nodeData as { messages?: unknown[] }).messages;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            const msgObj = msg as { type?: string; name?: string; content?: string; tool_call_id?: string };
            if (msgObj.type === "tool" && msgObj.tool_call_id) {
              const content = typeof msgObj.content === "string" ? msgObj.content : "";

              // Check if the tool result indicates an error
              if (isErrorContent(content)) {
                tracker.error(msgObj.tool_call_id, content.slice(0, 500));
              } else {
                tracker.complete(msgObj.tool_call_id, content);
              }
            }
          }
        }

        // After processing tool results, check if all subagents have completed.
        // This is the correct transition point to emit the synthesizing indicator —
        // when the last subagent completes and the main agent is about to synthesize.
        tracker.emitSynthesizingIfReady();
      }

      // ─── Detect main agent model_request after subagents complete ─
      // If the main agent starts a new model_request and all subagents are done,
      // that's the synthesis phase.
      if (!isSubagent && nodeName === "model_request" && tracker.hasSubagents() && tracker.allComplete()) {
        tracker.emitSynthesizingIfReady();
      }
    }

    return;
  }

  // ── Handle "messages" mode ──────────────────────────────────────────
  // Per docs: yields [message, metadata] tuples.
  // Used for token streaming, tool call chunks, and tool results.
  if (mode === "messages" && Array.isArray(data) && data.length >= 1) {
    const [message, metadata] = data;

    // AIMessageChunk — streaming tokens and tool call chunks
    if (message && typeof message === "object" && "content" in message) {
      const content = (message as { content: string | Array<unknown>; tool_call_chunks?: Array<unknown> }).content;
      const toolCallChunks = (message as { tool_call_chunks?: Array<{ name?: string; args?: string }> }).tool_call_chunks;

      // Handle tool call chunks
      if (toolCallChunks && toolCallChunks.length > 0) {
        for (const tc of toolCallChunks) {
          if (tc.name) {
            if (isSubagent && resolvedSubagentId) {
              // Subagent is calling one of its tools (get_file_tree, read_file, etc.)
              sendSSE(res, "subagent:tool_call", {
                id: resolvedSubagentId,
                tool: tc.name,
              });
            }
          }
        }
        return;
      }

      // Extract text content
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block === "string") {
            text += block;
          } else if (block && typeof block === "object" && "text" in block) {
            text += (block as { text: string }).text;
          }
        }
      }

      if (text) {
        if (isSubagent) {
          // Subagent tokens — stream to frontend as subagent:token
          // Per docs: "stream tokens from the main agent and each subagent"
          // Use the resolved tool_call_id so the frontend can correlate
          // this token to the correct subagent card.
          sendSSE(res, "subagent:token", {
            id: resolvedSubagentId || subagentNsSegment,
            chunk: text,
          });
        } else {
          // Main agent tokens — forward to client and accumulate
          onToken(text);
          sendSSE(res, "token", { chunk: text });
        }
      }
    }

    // ToolMessage — tool execution results
    if (message && typeof message === "object" && "type" in message) {
      const msgType = (message as { type: string }).type;
      if (msgType === "tool") {
        const toolMsg = message as {
          name?: string;
          content?: string;
          tool_call_id?: string;
        };

        if (isSubagent && toolMsg.name) {
          // Subagent tool completed — emit subagent:tool_result
          const contentStr = typeof toolMsg.content === "string" ? toolMsg.content : "";
          sendSSE(res, "subagent:tool_result", {
            id: resolvedSubagentId || subagentNsSegment,
            tool: toolMsg.name,
            path: extractPathFromToolResult(contentStr),
            preview: contentStr.slice(0, 200),
          });
        }
      }
    }

    return;
  }

  // ── Handle raw object events (fallback) ─────────────────────────────
  // This handles cases where the event doesn't match the expected triple/tuple
  // format, such as raw interrupt objects or unexpected shapes.

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const chunkObj = data as Record<string, unknown>;

    // Check for __interrupt__
    if (chunkObj.__interrupt__) {
      handleInterrupt(chunkObj.__interrupt__, onQA);
    }

    // Check for messages in updates (backward compatibility)
    if (chunkObj.messages && Array.isArray(chunkObj.messages)) {
      for (const msg of chunkObj.messages) {
        if (msg && typeof msg === "object") {
          const msgContent = (msg as { content?: string }).content;
          if (typeof msgContent === "string" && msgContent.length > 0) {
            onToken(msgContent);
            sendSSE(res, "token", { chunk: msgContent });
          }
        }
      }
    }
  }
}

// ─── Interrupt Handler ──────────────────────────────────────────────────────

/**
 * Extracts interrupt payload from __interrupt__ data and invokes the callback.
 * Per the LangGraph "Interrupts within tool calls" documentation,
 * when interrupt() is called inside the ask_clarification_questions tool,
 * the interrupt value is exactly what was passed to interrupt().
 */
function handleInterrupt(
  interruptData: unknown,
  onQA: (questions: unknown | null) => void
): void {
  if (Array.isArray(interruptData) && interruptData.length > 0) {
    const interruptValue = interruptData[0]?.value;
    if (interruptValue) {
      if (interruptValue.questions && Array.isArray(interruptValue.questions)) {
        onQA(interruptValue);
      } else {
        console.warn("[chat] Received interrupt with unexpected shape:", JSON.stringify(interruptValue).slice(0, 200));
        onQA(null);
      }
    }
  }
}

// ─── Error Detection ────────────────────────────────────────────────────────

/**
 * Heuristically detects whether a tool result content string indicates an error.
 * This is used to determine whether to mark a subagent as "complete" or "error"
 * when its ToolMessage arrives back at the main agent's tools node.
 */
function isErrorContent(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.startsWith("error:") ||
    lower.startsWith("error -") ||
    lower.includes("traceback") ||
    lower.includes("exception:") ||
    lower.includes("failed to execute") ||
    /^(internal server error|timeout|rate limit)/i.test(content)
  );
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Extracts a file path from a tool result string.
 * Used to populate the `path` field of subagent:tool_result SSE events.
 */
export function extractPathFromToolResult(content: string): string {
  // Try to find "File: path" or "Contents of repo/path" patterns
  const fileMatch = content.match(/^File:\s*(.+?)(?:\s*\(|$)/m);
  if (fileMatch) return fileMatch[1].trim();

  const contentsMatch = content.match(/^Contents of\s+(?:\S+\/)?(.+?):/m);
  if (contentsMatch) return contentsMatch[1].trim();

  return "";
}
