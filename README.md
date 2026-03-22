# Traycer Epic Mode

A chat-driven, AI-assisted engineering workflow tool that takes a plain-language request and guides it through a structured command sequence — from requirements gathering to ticket breakdown. The system connects to a GitHub repository for codebase context, asks structured clarifying questions at each stage, and produces versioned, editable Markdown artifacts. Built with a LangChain Deep Agents backend, React frontend, and PostgreSQL persistence layer.

---

## Setup & Running

### Prerequisites

- **Node.js** ≥ 18 and **npm** ≥ 9
- **PostgreSQL** ≥ 14 — via [Docker](https://www.docker.com/) or [Homebrew](https://formulae.brew.sh/formula/postgresql@17) (or any remote instance)
- A **GitHub OAuth App** — [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App
  - **Authorization callback URL** → `http://localhost:3000/auth/github/callback`
- An **OpenAI** or **Anthropic** API key (configured in-app after first login)

### 1. Start PostgreSQL

**Docker** (recommended — creates the `traycer` database automatically):
```sh
docker run -d --name traycer-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=traycer \
  -p 5432:5432 \
  postgres:16
```

**Homebrew** (macOS):
```sh
brew install postgresql@16
brew services start postgresql@17
createdb traycer
```

The app auto-applies its schema on startup (`CREATE TABLE IF NOT EXISTS`) — no migrations to run manually.

### 2. Configure Environment

Create a `.env` file in the project root:

```sh
# Required — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET=<64-char hex string>

# Required — from your GitHub OAuth App
GITHUB_CLIENT_ID=<your client id>
GITHUB_CLIENT_SECRET=<your client secret>
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback

# PostgreSQL (defaults match the Docker command above)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traycer

# Optional — defaults shown
PORT=3000
FRONTEND_URL=http://localhost:5173
```

### 3. Install & Run

```sh
npm install
npm run dev
```

This starts both Vite (port 5173) and Express (port 3000) concurrently. Vite proxies `/api` and `/auth` requests to Express. Open [http://localhost:5173](http://localhost:5173).

**Production build:**
```sh
npm run build
npm start
```

### 4. First Run

1. Open the app → click **Sign in with GitHub**.
2. Avatar → **Settings** → select your AI provider (OpenAI / Anthropic) and enter your API key.
3. Create a session, link a GitHub repo, and start with `/trigger`.

---

## Architectural Overview

### Monorepo Structure

```
traycer/
├── frontend/               React 19 + Vite + Tailwind CSS v4
│   └── src/
│       ├── components/     UI components (chat/, ui/)
│       ├── hooks/          useSSEStream, useQueries (TanStack Query)
│       ├── stores/         Zustand stores (auth, session, message, streaming, subagent, ui)
│       └── lib/            API client, slash command definitions, utilities
├── backend/                Node.js + Express + TypeScript
│   └── src/
│       ├── agent/          LangChain Deep Agent, skills, sub-agents, streaming
│       │   ├── skills/     9 SKILL.md files (one per slash command)
│       │   ├── subagents/  Exploration (GitHub API) + Diff-Writer (artifact editing)
│       │   ├── streaming/  SSE event processor, subagent lifecycle tracker
│       │   ├── tools/      ask_clarification_questions, read_artifact
│       │   └── utils/      Command registry, diff applicator, interrupt detection
│       ├── db/             PostgreSQL schema, connection pool, typed helpers
│       ├── routes/         Express routers (chat, sessions, artifacts, settings, github, maintenance)
│       ├── middleware/     Auth, security (CORS, Helmet), stream limiter
│       └── utils/          Encryption, SSE helpers, env loading
├── architecture/           Design documents (Epic Brief, Core Flows, Tech Plan)
└── package.json            Workspace root with dev/build/start scripts
```

### Two-Panel UI Layout

The authenticated workspace is a resizable two-panel layout:

- **Left panel (65%)** — Artifact viewer with type-filtered dropdowns (Specs / Tickets), a rich Markdown editor (`@mdxeditor/editor`), and a version history popover.
- **Right panel (35%)** — Chat pane with message list, Q&A carousels, subagent progress cards, next-step nudges, and a slash command input.

### Single `/chat` Endpoint

All AI interaction flows through one endpoint: `POST /api/sessions/:id/chat`. Slash commands, Q&A answers, and free-text messages all go here. The backend inspects pending interrupt state and branches accordingly — either starting a fresh agent execution or resuming from a frozen checkpoint. This eliminates endpoint proliferation and keeps the frontend's streaming logic in a single `useSSEStream` hook.

### LangChain Deep Agents + LangGraph HITL Interrupts

The central agent is built with `createDeepAgent` from the `deepagents` package, using LangGraph's state graph and checkpointer under the hood.

**How Q&A pause/resume works:**
1. The agent calls `interrupt({ questions })` inside the `ask_clarification_questions` tool.
2. LangGraph freezes graph state at that exact point via `PostgresSaver`.
3. The backend emits a `qa` SSE event and closes the stream.
4. When the user submits answers, the backend calls `agent.stream(new Command({ resume: { answers } }))` with the same `thread_id`.
5. LangGraph resumes from the frozen checkpoint — no history reconstruction needed.

### Skills System

Each slash command maps to a skill directory (`backend/src/agent/skills/<name>/SKILL.md`). The Deep Agents framework uses progressive disclosure: it loads only skill name + description at startup, then reads the full SKILL.md body only when the agent activates that skill. The system prompt contains a routing table mapping commands to skill names — the agent never guesses which skill to use.

### Central Agent + Sub-Agents

The central agent delegates two concerns:

- **Exploration sub-agent** (`codebase-explorer`) — spawned on-demand when codebase context is needed. Equipped with `get_file_tree`, `read_file`, and `search_code` tools that call the GitHub API server-side using the stored OAuth token. Always reads from the default branch. No browser bridge — the sub-agent runs to completion on the server.
- **Diff-writer sub-agent** (`artifact-editor`) — handles all artifact edits via a read → diff → verify loop with `read_artifact`, `apply_diff`, and `write_artifact` tools. The central agent never writes artifact content directly.

Sub-agent lifecycle events (spawn, running, tool calls, completion, error) are streamed to the frontend via typed SSE events and rendered as expandable progress cards in chat.

### GitHub OAuth Flow

GitHub OAuth serves dual purpose — **user authentication** and **repository access**:

1. Frontend redirects to `GET /auth/github` → GitHub authorization page (scopes: `repo read:org user:email`). A random `state` parameter is stored in a short-lived HttpOnly cookie for CSRF protection.
2. GitHub redirects to `GET /auth/github/callback` with a code. The backend validates `state` via constant-time comparison.
3. Backend exchanges the code for a GitHub access token, fetches the user's GitHub profile, upserts the user in the DB, and encrypts the GitHub token for storage.
4. Backend issues two HttpOnly cookies — a short-lived access token (`traycer_session`, 15 min) and a long-lived refresh token (`traycer_refresh`, 90 days) — then redirects to the frontend. No tokens appear in the URL.
5. All subsequent API calls authenticate via the session cookie (with Bearer header as fallback). The frontend silently refreshes expired access tokens via `POST /auth/refresh`. The GitHub token is decrypted only when the exploration sub-agent needs it.

### PostgreSQL Database

A single PostgreSQL instance stores both application data and LangGraph checkpoint state. Application tables (users, sessions, messages, artifacts, versions, settings) are managed by a `pg.Pool` connection pool with typed query helpers. Checkpoint tables are managed by LangGraph's `PostgresSaver`. Supports local Postgres for development and remote/hosted instances via `DATABASE_URL` for production — the same schema works in both environments.

### SSE Streaming

SSE instead of WebSockets because: unidirectional server→client is all we need, works natively with `fetch` (no library required), no handshake overhead, and automatic reconnection semantics. The stream carries typed events: `token`, `qa`, `done`, `error`, `artifact:start`, `subagent:spawn`, `subagent:running`, `subagent:token`, `subagent:tool_call`, `subagent:tool_result`, `subagent:complete`, `subagent:error`, `synthesizing`, `qa_cancelled`, `step`, `diff`.

### Encryption

A single `ENCRYPTION_SECRET` environment variable seeds three isolated derived keys via HMAC-SHA256 — one for **session token signing**, one for **LLM API key encryption**, and one for **GitHub token encryption**. Both stored secrets use AES-256-GCM (with per-row IV and auth tag). `TOKEN_SECRET` can optionally be set as a separate env var to fully decouple token signing from the encryption master key. Decryption happens only at call time — secrets never reach the client or logs.

---

## Production Readiness

The backend is built for multi-user, multi-session deployment — not just local single-player use.

**PostgreSQL** is the sole data store — connection-pooled (`pg.Pool`, configurable up to 20 connections), supporting both local dev and remote hosted instances via `DATABASE_URL`. This is the key scalability choice: every user's sessions, messages, artifacts, and agent checkpoints persist in a shared, transactional database that scales horizontally behind any managed Postgres provider.

**Security hardening** is baked into the middleware stack:
- **Helmet** — sets strict HTTP headers (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.)
- **CORS** — configurable allowed origins via `CORS_ORIGIN` env var, credentials-enabled, locked to explicit methods and headers
- **CSRF protection** — OAuth state parameter stored in a short-lived HttpOnly cookie, validated with constant-time `timingSafeEqual`
- **HttpOnly session cookies** — short-lived access tokens (15 min) + long-lived refresh tokens (90 days), `Secure` in production, `SameSite=Lax`
- **SSE heartbeat** — periodic keep-alive comments (every 15s) prevent proxy/browser timeouts during long agent runs
- **Stream concurrency limiter** — per-user and global caps on concurrent SSE streams prevent resource exhaustion
- **AES-256-GCM encryption at rest** — API keys and OAuth tokens are never stored in plaintext; three isolated purpose-specific keys derived from a single master secret (token signing, API key encryption, GitHub token encryption)

---

## Workflow Commands

| # | Command | Purpose | Produces Artifact |
|---|---------|---------|:-:|
| 1 | `/trigger` | Analyze the user's request, explore codebase, gather requirements | No |
| 2 | `/prd` | Generate a Product Requirements Document | Yes (spec) |
| 3 | `/flows` | Generate a Core Flows document | Yes (spec) |
| 4 | `/validate_prd` | Review PRD + Flows for completeness and gaps | No (edits existing) |
| 5 | `/tech_plan` | Generate a Technical Plan with architecture and data models | Yes (spec) |
| 6 | `/validate_architecture` | Stress-test technical architecture for soundness | No (edits existing) |
| 7 | `/ticket_breakdown` | Break the tech plan into implementation tickets | Yes (ticket) |
| 8 | `/validate_artifact` | Final cross-artifact consistency validation | No (edits existing) |
| 9 | `/revise_requirements` | Revise artifacts when requirements change | No (edits existing) |

The system nudges the intended sequence but does not enforce it — users can execute any command at any time.

---

## Trade-offs & Assumptions

### Key management
`ENCRYPTION_SECRET` is the master secret from which three purpose-specific keys are derived via HMAC-SHA256: `token_signing`, `api_key_encryption`, and `github_token_encryption`. Token signing can be fully decoupled by setting `TOKEN_SECRET` as a separate env var. No key rotation mechanism exists. If the master secret changes, all stored API keys and GitHub tokens become undecryptable — the user re-enters them via the Settings modal.

### Frontend-owned message state
The frontend maintains the authoritative messages array during a session and syncs to the backend via `POST /api/sessions/:id/messages/sync` with a retry queue (5 attempts, 1s delay). This decouples message persistence from the SSE stream, eliminating race conditions between streaming and DB writes. The trade-off is that messages could theoretically be lost if the browser closes before sync completes — mitigated by aggressive sync triggers (after every stream completion and Q&A submission).

### Checkpoint retention
LangGraph's `PostgresSaver` accumulates checkpoints over time. Cleanup runs only on session deletion and via an explicit `POST /api/maintenance/checkpoints/prune` action — not periodically, not per-request. For long-running sessions with many Q&A rounds, checkpoint rows can grow. The manual prune endpoint is the escape valve.

### LangChain Deep Agents JS
Chosen specifically for: sub-agent spawning (the `task` tool pattern), LangGraph HITL interrupt support (`interrupt()` + `Command({ resume })`), `PostgresSaver` for durable checkpoints, and the Skills system for progressive disclosure. The trade-off is framework coupling — the agent layer is tightly bound to LangChain/LangGraph APIs and the `deepagents` package.

### GitHub API rate limits
Authenticated requests: 5,000/hr. Code search: 30 req/min. When rate limit pressure is detected (< 5 remaining or 403), the exploration sub-agent skips `search_code` and continues with lighter `get_file_tree` + `read_file` exploration, tagging the context as partial. Heavy exploration sessions on large repos can still hit limits during rapid iteration.

### Always reads from default branch
No branch selection — the exploration sub-agent always uses the repository's default branch. This keeps the session model simple (one `github_repo` string per session) but means the agent can't explore feature branches or compare across branches.

### No automated tests
Verification is manual via the seed script (`npm run seed -w backend`) which exercises all DB helpers, and via end-to-end usage through the UI. The seed script validates schema, CRUD operations, cascade deletes, and settings storage flows.

---

## Known Limitations

- **No local filesystem access** — codebase exploration is GitHub API only; local repos must be pushed to GitHub first.
- **No mobile layout** — the resizable two-panel design targets desktop viewports.
- **No real-time collaboration** — sessions are single-owner; no shared editing or multi-user presence within a session.
- **No branch selection** — always reads the default branch; cannot explore feature branches.
- **GitHub code search rate limit** — 30 req/min can throttle heavy exploration; the sub-agent degrades gracefully but context may be incomplete.
- **Large file truncation** — files over 50,000 characters are truncated when read via the GitHub API to avoid context bloat.
- **No key rotation** — changing `ENCRYPTION_SECRET` invalidates all stored secrets.
- **JWT is stateless** — signing out clears the token client-side but doesn't invalidate it server-side; tokens expire after 15 minutes (access) / 90 days (refresh).
