import { z } from "zod";
import type { SubAgent } from "deepagents";
import { tool } from "@langchain/core/tools";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// ─── GitHub API Helpers ─────────────────────────────────────────────────────
interface GitHubRequestOptions {
  url: string;
  token: string;
  method?: string;
}

/**
 * Makes a GitHub API request with retry logic for transient failures.
 * - Retries network/5xx errors up to 3 times with exponential backoff
 * - Does NOT retry auth/permission/repo-not-found (4xx) failures
 * - Returns rate limit info for degraded mode handling
 */
async function githubRequest(
  options: GitHubRequestOptions
): Promise<{ ok: boolean; status: number; data: unknown; rateLimitRemaining: number }> {
  const { token, url, method = "GET" } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      const rateLimitRemaining = parseInt(
        response.headers.get("x-ratelimit-remaining") || "999",
        10
      );

      // Don't Retry Client Errors
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        return {
          ok: false,
          data: errorText,
          rateLimitRemaining,
          status: response.status,
        };
      }

      // Retry Server Errors
      if (response.status >= 500) {
        lastError = new Error(`GitHub API returned ${response.status}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        return {
          ok: false,
          rateLimitRemaining,
          status: response.status,
          data: `Server error: ${response.status}`,
        };
      }

      const data = await response.json();
      return { ok: true, status: response.status, data, rateLimitRemaining };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
    }
  }

  return {
    ok: false,
    status: 0,
    rateLimitRemaining: 999,
    data: `Network error after ${MAX_RETRIES} retries: ${lastError?.message}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── GitHub API Tool Factories ──────────────────────────────────────────────
/**
 * Creates a `get_file_tree` tool bound to a specific repo and token.
 * Calls GitHub Contents API to list directory contents; always uses default branch.
 */
function createGetFileTreeTool(token: string, repo: string) {
  return tool(
    async ({ path }: { path: string }) => {
      const safePath = path.replace(/^\/+/, "");
      const url = `https://api.github.com/repos/${repo}/contents/${safePath}`;

      const result = await githubRequest({ token, url });
      if (!result.ok) {
        return `Error fetching file tree for "${safePath}": ${result.status} — ${result.data}`;
      }

      const entries = result.data as Array<{
        name: string;
        path: string;
        type: string;
        size: number;
      }>;

      if (!Array.isArray(entries)) {
        // If Single File (Not Dir)
        const file = result.data as { name: string; path: string; type: string; size: number };
        return `"${safePath}" is a file (${file.size} bytes), not a directory. Use read_file to read it.`;
      }

      const lines = entries.map((entry) => {
        const icon = entry.type === "dir" ? "📁" : "📄";
        const size = entry.type === "file" ? ` (${entry.size}b)` : "";
        return `${icon} ${entry.path}${size}`;
      });

      return `Contents of ${safePath || "/"}:\n${lines.join("\n")}`;
    },
    {
      name: "get_file_tree",
      description: `List directory contents in the GitHub repository ${repo}. Pass a directory path (e.g. "src" or "src/auth") to see its contents. Pass "" for the root directory.`,
      schema: z.object({
        path: z
          .string()
          .describe(
            'Directory path to list (e.g. "src", "src/auth", or "" for root)'
          ),
      }),
    }
  );
}

/**
 * Creates a `read_file` tool bound to a specific repo and token.
 * Fetches file content via GitHub Contents API; decodes base64 response.
 */
function createReadFileTool(token: string, repo: string) {
  return tool(
    async ({ path }: { path: string }) => {
      const safePath = path.replace(/^\/+/, "");
      const url = `https://api.github.com/repos/${repo}/contents/${safePath}`;

      const result = await githubRequest({ token, url });
      if (!result.ok) {
        return `Error reading file "${safePath}": ${result.status} — ${result.data}`;
      }

      const file = result.data as {
        type: string;
        size: number;
        name: string;
        content?: string;
        encoding?: string;
      };

      if (file.type === "dir") {
        return `"${safePath}" is a directory. Use get_file_tree to list its contents.`;
      }
      if (!file.content) {
        return `File "${safePath}" exists but has no content (size: ${file.size} bytes). It may be too large for the Contents API.`;
      }

      // Decode Base64 Content
      const content = Buffer.from(file.content, "base64").toString("utf-8");

      // Truncate Very Large Files
      const MAX_CHARS = 50000;
      if (content.length > MAX_CHARS) {
        return `File: ${safePath} (${file.size} bytes, truncated)\n\n${content.slice(0, MAX_CHARS)}\n\n... [TRUNCATED — file is ${content.length} chars, showing first ${MAX_CHARS}]`;
      }

      return `File: ${safePath} (${file.size} bytes)\n\n${content}`;
    },
    {
      name: "read_file",
      description: `Read a file's content from the GitHub repository ${repo}. Pass the file path (e.g. "src/index.ts", "README.md").`,
      schema: z.object({
        path: z
          .string()
          .describe('File path to read (e.g. "src/index.ts", "package.json")'),
      }),
    }
  );
}

/**
 * Creates a `search_code` tool bound to a specific repo and token.
 * Uses GitHub Code Search API to find relevant files by keyword/pattern.
 */
function createSearchCodeTool(token: string, repo: string) {
  return tool(
    async ({ query }: { query: string }) => {
      // GitHub Code Search API
      const encodedQuery = encodeURIComponent(`${query} repo:${repo}`);
      const url = `https://api.github.com/search/code?q=${encodedQuery}&per_page=20`;

      const result = await githubRequest({ token, url });
      if (result.rateLimitRemaining < 5 || result.status === 403) {
        return `Code search is temporarily unavailable due to GitHub API rate limiting. Try using get_file_tree and read_file to explore the codebase manually.`;
      }
      if (!result.ok) {
        return `Error searching code for "${query}": ${result.status} — ${result.data}`;
      }

      const searchResult = result.data as {
        total_count: number;
        items: Array<{
          name: string;
          path: string;
          html_url: string;
          repository: { full_name: string };
        }>;
      };
      if (searchResult.total_count === 0) {
        return `No code matches found for "${query}" in ${repo}.`;
      }

      const lines = searchResult.items.map(
        (item, i) => `${i + 1}. ${item.path}`
      );

      return `Found ${searchResult.total_count} matches for "${query}" in ${repo}:\n${lines.join("\n")}\n\nUse read_file to examine specific files.`;
    },
    {
      name: "search_code",
      description: `Search for code in the GitHub repository ${repo} using keywords or patterns. Returns matching file paths. Use this to find relevant files before reading them.`,
      schema: z.object({
        query: z
          .string()
          .describe(
            "Search query — keywords, function names, class names, or patterns"
          ),
      }),
    }
  );
}

// ─── Exploration Sub-Agent Factory ──────────────────────────────────────────
/**
 * Creates an exploration sub-agent definition for the central agent.
 *
 * The sub-agent is equipped with three GitHub API tools:
 * - get_file_tree(path) — list directory contents
 * - read_file(path) — fetch file content
 * - search_code(query) — search code by keyword
 *
 * All tools execute server-side using the provided GitHub OAuth token.
 * The sub-agent runs to completion and returns aggregated codebase context.
 */
export function createExplorationSubAgent(
  githubToken: string,
  githubRepo: string
): SubAgent {
  const getFileTree = createGetFileTreeTool(githubToken, githubRepo);
  const readFile = createReadFileTool(githubToken, githubRepo);
  const searchCode = createSearchCodeTool(githubToken, githubRepo);

  return {
    name: "codebase-explorer",
    description:
      `Explores the GitHub repository ${githubRepo} to gather codebase context. ` +
      `Use this subagent when starting a fresh analysis from scratch or when the context needed for any analysis is weak or incomplete. ` +
      `Explore the file tree, read source files, or search for specific code patterns. ` +
      `The subagent will return a summary of relevant codebase context.`,
    systemPrompt: `You are a codebase exploration agent for the GitHub repository "${githubRepo}".

Your job is to explore the repository and gather relevant context for the task described in the request.

## Available Tools

### get_file_tree
Lists contents of a directory. Start with the root ("") to understand the project structure, then drill into relevant directories.

### read_file
Reads the full content of a specific file. Use this to understand implementation details.

### search_code
Searches for code by keyword across the repository. Use this to find files related to specific concepts, function names, or patterns.

## Strategy

1. Start by examining the root directory structure to understand the project layout.
2. Read key files like README.md, package.json, or similar to understand the tech stack.
3. Drill into directories relevant to the task.
4. Search for specific keywords or patterns when looking for particular functionality.
5. Read the most relevant source files to understand implementation details.

## Output

Return a clear, structured summary of the relevant codebase context you found:
- Project structure overview (brief)
- Relevant files and their purposes
- Key implementation details
- Any patterns or conventions observed

Keep your response focused and concise — include only information relevant to the task at hand.`,
    tools: [getFileTree, readFile, searchCode],
  };
}
