import "./utils/env.js";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import { closeAll } from "./db/index.js";
import chatRouter from "./routes/chat.js";
import { getPool } from "./db/connection.js";
import sessionRouter from "./routes/sessions.js";
import settingsRouter from "./routes/settings.js";
import artifactRouter from "./routes/artifacts.js";
import { initializeDatabases } from "./db/init.js";
import { requireAuth } from "./middleware/auth.js";
import maintenanceRouter from "./routes/maintenance.js";
import { globalErrorHandler } from "./middleware/error.js";
import { githubAuthRouter, githubApiRouter } from "./routes/github.js";
import { createCorsMiddleware, createHelmetMiddleware } from "./middleware/security.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Startup Checks ────────────────────────────────────────────────────────
if (!process.env.ENCRYPTION_SECRET) {
  console.error(
    "\n❌  ENCRYPTION_SECRET environment variable is required but not set.\n" +
      '   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      "   Then add it to your .env file.\n"
  );
  process.exit(1);
}

// ─── Initialize Databases ───────────────────────────────────────────────────
await initializeDatabases();

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware - Security ────────────────────────────────────────────────────
app.use(createCorsMiddleware());
app.use(createHelmetMiddleware());

app.use(express.json());
app.use(cookieParser());

// ─── Public Routes ─────────────────────────────
app.get("/api/health", async (_req, res) => {
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // Check PostgreSQL
  try {
    const start = Date.now();
    const pool = getPool();
    await pool.query("SELECT 1");
    checks.database = { status: "ok", latency_ms: Date.now() - start };
  } catch (err) {
    checks.database = { status: "error", error: err instanceof Error ? err.message : "Unknown error" };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "ok");

  res.status(allHealthy ? 200 : 503).json({
    checks,
    timestamp: new Date().toISOString(),
    status: allHealthy ? "healthy" : "degraded",
  });
});
app.use("/auth", githubAuthRouter);

// ─── Protected Routes ───────────────────────────────────────────────────────
app.use("/api", requireAuth);

app.use("/api/sessions", chatRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/github", githubApiRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/artifacts", artifactRouter);
app.use("/api/maintenance", maintenanceRouter);
app.get("/api/auth/me", (req, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    github_login: user.github_login,
    github_avatar_url: user.github_avatar_url,
    display_name: user.display_name,
  });
});

// ─── Middleware - Error Handler ───────────────────────────────────────────────────
app.use(globalErrorHandler);

// ─── Server Startup ───────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
async function shutdown() {
  console.log("\nShutting down gracefully...");

  // Stop Accepting New Connections
  server.close(async () => {
    console.log("HTTP server closed.");
    // Close DB Pool
    await closeAll();
    console.log("Database pool closed.");
    process.exit(0);
  });

  // Force Exit After Timeout
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
