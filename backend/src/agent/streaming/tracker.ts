import type { Response } from "express";
import { sendSSE } from "../../utils/sse.js";
import type { TrackedSubagent } from "./types.js";

// Subagent Lifecycle Tracker
//
// Manages the three-phase lifecycle of subagents spawned by the main agent:
//
// - Phase 1: Detect subagent starting — main agent's model_request has task tool_calls.
//   We create a TrackedSubagent with status "pending" keyed by tool_call_id.
// - Phase 2: Detect subagent running — events arrive from tools:<pregelId> namespace.
//   The pregel task ID in the namespace differs from the tool_call_id. On the first
//   event from a new pregel namespace, we associate it with the next pending subagent
//   and record the mapping so subsequent events from the same namespace route correctly.
// - Phase 3: Detect subagent completing — main agent's tools node returns a ToolMessage
//   with tool_call_id, which we match back to our tracked subagent.
//
// This tracker ensures correct correlation even when multiple subagents run in parallel.
export class SubagentTracker {
  private res: Response;
  private synthesizingEmitted = false;
  private pregelToToolCallId = new Map<string, string>();
  private subagents = new Map<string, TrackedSubagent>();

  constructor(res: Response) {
    this.res = res;
  }

  /**
   * Phase 1: A task tool_call was detected in the main agent's model_request.
   * Mark the subagent as "pending" and emit subagent:spawn.
   */
  spawn(toolCallId: string, name: string, description: string): void {
    const sub: TrackedSubagent = {
      id: toolCallId,
      name,
      description,
      status: "pending",
      startedAt: undefined,
      completedAt: undefined,
      pregelTaskId: undefined,
      errorMessage: undefined,
    };

    this.subagents.set(toolCallId, sub);

    sendSSE(this.res, "subagent:spawn", {
      id: toolCallId,
      name,
      description,
    });
  }

  /**
   * Phase 2: An event arrived from a subagent namespace (tools:<pregelId>).
   *
   * The pregel task ID in the namespace is NOT the same as the tool_call_id
   * used in Phase 1 and Phase 3. We maintain a mapping between the two so
   * that subagent tokens, tool calls, and tool results can be routed to the
   * correct TrackedSubagent.
   *
   * When multiple subagents run in parallel, each gets its own unique pregel
   * task ID. The first time we see a new pregel ID, we associate it with the
   * next pending subagent (in spawn order). Subsequent events from the same
   * pregel ID reuse the established mapping.
   *
   * @param pregelId - The pregel task ID extracted from the namespace segment
   *                   (e.g., "abc123" from "tools:abc123")
   * @returns The tool_call_id of the associated subagent, or undefined if
   *          no mapping could be established.
   */
  markRunning(pregelId: string): string | undefined {
    // If we've already seen this pregel ID, return the existing mapping
    const existingToolCallId = this.pregelToToolCallId.get(pregelId);
    if (existingToolCallId) {
      return existingToolCallId;
    }

    // First time seeing this pregel ID — find the next pending subagent
    // (in insertion order, which matches spawn order)
    for (const [toolCallId, sub] of this.subagents) {
      if (sub.status === "pending") {
        sub.status = "running";
        sub.startedAt = Date.now();
        sub.pregelTaskId = pregelId;

        // Establish the bidirectional mapping
        this.pregelToToolCallId.set(pregelId, toolCallId);

        sendSSE(this.res, "subagent:running", { id: toolCallId });
        return toolCallId;
      }
    }

    // No pending subagent to associate — this can happen if the spawn event
    // was missed or if extra namespace events arrive after completion.
    return undefined;
  }

  /**
   * Resolves a pregel task ID (from a stream namespace) to its associated
   * tool_call_id. Returns undefined if no mapping exists.
   *
   * This is used by the processor to determine which subagent a stream event
   * belongs to, so the correct `id` field is sent in SSE events like
   * subagent:token, subagent:tool_call, and subagent:tool_result.
   */
  resolvePregelId(pregelId: string): string | undefined {
    return this.pregelToToolCallId.get(pregelId);
  }

  /**
   * Phase 3: A ToolMessage with the task tool returned to the main agent.
   * Mark the subagent as "complete" and emit subagent:complete.
   */
  complete(toolCallId: string, result: string): void {
    const sub = this.subagents.get(toolCallId);
    if (sub) {
      sub.status = "complete";
      sub.completedAt = Date.now();

      sendSSE(this.res, "subagent:complete", {
        id: toolCallId,
        result: result.slice(0, 500),
      });
    }
  }

  /**
   * Mark a subagent as errored. This can happen when a subagent's execution
   * fails (e.g., tool errors, model errors, timeouts).
   *
   * @param toolCallId - The tool_call_id of the subagent that errored
   * @param errorMessage - A description of what went wrong
   */
  error(toolCallId: string, errorMessage: string): void {
    const sub = this.subagents.get(toolCallId);
    if (sub && sub.status !== "complete") {
      sub.status = "error";
      sub.completedAt = Date.now();
      sub.errorMessage = errorMessage;
      sendSSE(this.res, "subagent:error", {
        id: toolCallId,
        error: errorMessage,
      });
    }
  }

  /**
   * Mark a subagent as errored by its pregel task ID (from namespace).
   * Resolves the pregel ID to a tool_call_id first.
   */
  errorByPregelId(pregelId: string, errorMessage: string): void {
    const toolCallId = this.pregelToToolCallId.get(pregelId);
    if (toolCallId) {
      this.error(toolCallId, errorMessage);
    }
  }

  /**
   * Check if any subagent has been tracked (for synthesis detection).
   */
  hasSubagents(): boolean {
    return this.subagents.size > 0;
  }

  /**
   * Check if all tracked subagents have completed (or errored).
   */
  allComplete(): boolean {
    if (this.subagents.size === 0) return false;
    for (const sub of this.subagents.values()) {
      if (sub.status !== "complete" && sub.status !== "error") return false;
    }
    return true;
  }

  /**
   * Emit a synthesizing event if all subagents are complete/errored and the
   * main agent is now generating its final response. Only emits once.
   *
   * This should be called at the transition point (e.g., when the last
   * subagent completes and the main agent starts its next model_request),
   * not on every token.
   */
  emitSynthesizingIfReady(): void {
    if (this.synthesizingEmitted) return;
    if (this.allComplete()) {
      this.synthesizingEmitted = true;
      sendSSE(this.res, "synthesizing", {});
    }
  }

  /**
   * Returns a snapshot of all tracked subagents. Useful for debugging
   * and for final status reporting.
   */
  getAll(): TrackedSubagent[] {
    return [...this.subagents.values()];
  }
}
