/**
 * Tracks active SSE streams to enforce concurrency limits.
 * Prevents resource exhaustion from too many concurrent agent executions.
 */

 const MAX_STREAMS_GLOBAL = 50;
 const MAX_STREAMS_PER_USER = 3;

// Active Streams: Map<sessionId, userId>
const activeStreams = new Map<string, string>();

// Per-User Stream Counts
function getUserStreamCount(userId: string): number {
  let count = 0;
  for (const uid of activeStreams.values()) {
    if (uid === userId) count++;
  }

  return count;
}

export function getActiveStreamCount(): number {
  return activeStreams.size;
}

export function unregisterStream(sessionId: string): void {
  activeStreams.delete(sessionId);
}

export function registerStream(sessionId: string, userId: string): void {
  activeStreams.set(sessionId, userId);
}

export function canStartStream(sessionId: string, userId: string): { allowed: boolean; reason?: string } {
  // No Duplicate Streams
  if (activeStreams.has(sessionId)) {
    return { allowed: false, reason: "A stream is already active for this session. Please wait for it to complete or cancel it." };
  }

  // Per-User limit
  if (getUserStreamCount(userId) >= MAX_STREAMS_PER_USER) {
    return { allowed: false, reason: `Maximum concurrent streams (${MAX_STREAMS_PER_USER}) reached. Please wait for an active stream to complete.` };
  }

  // Global limit
  if (activeStreams.size >= MAX_STREAMS_GLOBAL) {
    return { allowed: false, reason: "Server is at capacity. Please try again shortly." };
  }

  return { allowed: true };
}
