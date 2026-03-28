/**
 * Tracks active SSE streams to enforce concurrency limits.
 * Prevents resource exhaustion from too many concurrent agent executions.
 */

const MAX_STREAMS_GLOBAL = 50;
const MAX_STREAMS_PER_USER = 3;

// Active Streams: Map<sessionId, userId>
const activeStreams = new Map<string, string>();
const userStreamCounts = new Map<string, number>();

function getUserStreamCount(userId: string): number {
  return userStreamCounts.get(userId) ?? 0;
}

export function getActiveStreamCount(): number {
  return activeStreams.size;
}

export function unregisterStream(sessionId: string): void {
  const userId = activeStreams.get(sessionId);
  if (userId !== undefined) {
    const current = userStreamCounts.get(userId) ?? 0;
    if (current <= 1) {
      userStreamCounts.delete(userId);
    } else {
      userStreamCounts.set(userId, current - 1);
    }
  }
  activeStreams.delete(sessionId);
}

export function registerStream(sessionId: string, userId: string): void {
  // If this session already has an active stream, clean up the old entry
  // first so the counter stays accurate. This handles both the edge case
  // of a re-register under a different user and a same-user re-register.
  const previousUser = activeStreams.get(sessionId);
  if (previousUser !== undefined) {
    const prev = userStreamCounts.get(previousUser) ?? 0;
    if (prev <= 1) {
      userStreamCounts.delete(previousUser);
    } else {
      userStreamCounts.set(previousUser, prev - 1);
    }
  }

  activeStreams.set(sessionId, userId);
  userStreamCounts.set(userId, (userStreamCounts.get(userId) ?? 0) + 1);
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
