import cors from "cors";
import helmet from "helmet";
import type { RequestHandler } from "express";

/**
 * Creates a CORS middleware configured for the application.
 *
 * Reads allowed origins from CORS_ORIGIN env var (comma-separated),
 * defaulting to http://localhost:5173 for local development.
 */
export function createCorsMiddleware(): RequestHandler {
  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : ["http://localhost:5173"];

  return cors({
    origin: origins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
}

/**
 * Creates a Helmet middleware configured for the application.
 *
 * CSP is disabled for SSE (Server-Sent Events) compatibility.
 * Cross-Origin-Embedder-Policy is disabled to allow cross-origin resource loading.
 */
export function createHelmetMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: false, // Disable CSP for SSE Compatibility
    crossOriginEmbedderPolicy: false,
  }) as RequestHandler;
}
