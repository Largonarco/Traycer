import type { Response } from "express";

export function sseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

/**
 * Starts a periodic SSE heartbeat (comment line) to prevent proxy/browser timeouts.
 * Returns a cleanup function to stop the heartbeat.
 */
export function startHeartbeat(res: Response, intervalMs = 15000): () => void {
  const timer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(timer);
      return;
    }

    // SSE Comment (Ignored; Connection Still Alive)
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(timer);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

export function sendSSE(res: Response, event: string, data: unknown): boolean {
  if (res.writableEnded) return false;

  try {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return res.write(payload);
  } catch {
    return false;
  }
}

export function sendSSEError(res: Response, code: string, message: string): boolean {
  return sendSSE(res, "error", { code, message });
}
