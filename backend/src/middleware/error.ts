import type { Request, Response, NextFunction } from "express";

/**
 * Global Express error handler.
 *
 * Must be registered AFTER all route handlers so that `next(err)` calls
 * and synchronous throws inside route handlers are caught here.
 *
 * In development mode the original error message is returned to the client;
 * in production only a generic message is sent to avoid leaking internals.
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[server] Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";

  if (!res.headersSent) {
    res.status(500).json({
      error: isDev ? err.message : "Internal server error",
    });
  }
}
