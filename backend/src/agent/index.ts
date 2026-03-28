import { fileURLToPath } from "node:url";
import { ChatOpenAI } from "@langchain/openai";
import type { AIProvider } from "../db/types.js";
import { ChatAnthropic } from "@langchain/anthropic";
import { resolve, dirname, relative } from "node:path";
import { askClarificationQuestions } from "./tools/qa.js";
import { getConnectionString } from "../db/connection.js";
import { createDeepAgent, type SubAgent } from "deepagents";
import { readFile, readdir, stat } from "node:fs/promises";
import { createReadArtifactTool } from "./tools/artifact.js";
import { createDiffWriterSubAgent } from "./subagents/diffWriter.js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createExplorationSubAgent } from "./subagents/codeExploration.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";


// ─── FileData Type ────────────────────────
export interface FileData {
  content: string[];
  created_at: string;
  modified_at: string;
}

// ─── Skill File Loader ──────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = resolve(__dirname, "skills");

/**
 * Helper to create a FileData record from raw file content.
 */
function createFileData(raw: string): FileData {
  const now = new Date().toISOString();

  return {
    created_at: now,
    modified_at: now,
    content: raw.split("\n"),
  };
}

/**
 * Recursively loads all files within a single skill directory and returns
 * them as `Record<string, FileData>` entries keyed by virtual path.
 * @param skillName  Directory name under `src/agent/skills/` (e.g. "trigger")
 * @returns A record of `{ "/skills/<skillName>/<relativePath>": FileData }`
 *
 * Per the Agent Skills Specification, a skill directory can contain:
 * - SKILL.md (required — metadata + instructions)
 * - scripts/ (optional — executable code)
 * - references/ (optional — documentation)
 * - assets/ (optional — templates, resources)
 * - Any additional files or directories
 *
 * All files are loaded so the agent can access supporting resources
 * (scripts, references, assets) when referenced from SKILL.md.
 */
async function loadSkillDirectory(skillName: string): Promise<Record<string, FileData>> {
  const skillDir = resolve(SKILLS_DIR, skillName);
  const files: Record<string, FileData> = {};

  async function walkDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        try {
          const relPath = relative(skillDir, fullPath).split("\\").join("/");
          const virtualPath = `/skills/${skillName}/${relPath}`;
          const raw = await readFile(fullPath, "utf-8");
          files[virtualPath] = createFileData(raw);
        } catch {
          // Skip files if can't read
        }
      }
    }
  }

  // Ensure at least SKILL.md exists before loading the whole directory
  const skillMdPath = resolve(skillDir, "SKILL.md");
  try {
    await stat(skillMdPath);
  } catch {
    // No SKILL.md — skip this directory entirely
    return files;
  }

  await walkDir(skillDir);
  return files;
}

/**
 * Discovers every skill directory under `src/agent/skills/` and loads all
 * files (SKILL.md + any scripts/references/assets) into a single
 * `Record<string, FileData>` map.
 *
 * Per the Deep Agents documentation on Skills:
 * - All skill files are provided to the agent via the `files` state
 * - The framework's SkillsMiddleware reads frontmatter from each SKILL.md
 *   for progressive disclosure (name + description loaded at startup;
 *   full SKILL.md body loaded only when the agent activates a skill)
 * - Supporting files (scripts/, references/, assets/) are loaded by the
 *   agent on demand when referenced from SKILL.md
 */
let cachedSkillFiles: Record<string, FileData> | null = null;

export async function loadAllSkillFiles(): Promise<Record<string, FileData>> {
  if (cachedSkillFiles) return cachedSkillFiles;

  let allFiles: Record<string, FileData> = {};
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    try {
      const skillFiles = await loadSkillDirectory(entry.name);
      allFiles = { ...allFiles, ...skillFiles };
    } catch {
      // Skip directories if can't load
    }
  }

  cachedSkillFiles = allFiles;
  return allFiles;
}

// ─── Checkpointer Singleton ─────────────────────────────────────────────────
let checkpointerInstance: PostgresSaver | null = null;

/**
 * Returns a singleton PostgresSaver backed by the PostgreSQL database.
 * Must be awaited on first call to run setup().
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointerInstance) {
    const connString = getConnectionString();
    checkpointerInstance = PostgresSaver.fromConnString(connString);
    await checkpointerInstance.setup();
  }

  return checkpointerInstance;
}

// ─── Model Factory ──────────────────────────────────────────────────────────
function createModel(provider: AIProvider, apiKey: string): BaseChatModel {
  if (provider === "openai") {
    return new ChatOpenAI({
      apiKey,
      maxRetries: 3,
      model: "gpt-4o",
      temperature: 0,
    });
  } else if (provider === "anthropic") {
    return new ChatAnthropic({
      maxRetries: 3,
      temperature: 0,
      anthropicApiKey: apiKey,
      model: "claude-sonnet-4-20250514",
    });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ─── Central Agent Factory ──────────────────────────────────────────────────
export interface CreateCentralAgentOptions {
  sessionId: string;
  provider: AIProvider;
  decryptedApiKey: string;
  githubRepo?: string | null;
  githubToken?: string | null;
}

export interface CentralAgentResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
  skillFiles: Record<string, FileData>;
}

/**
 * Creates the central LangChain Deep Agent for a given session invocation.
 *
 * Follows the Deep Agents Skills pattern as documented at:
 * https://docs.langchain.com/oss/javascript/deepagents/skills
 *
 * How skills work (from the docs):
 * > "When you create a deep agent, you can pass in a list of directories
 * >  containing skills. As the agent starts, it reads through the frontmatter
 * >  of each SKILL.md file. When the agent receives a prompt, the agent checks
 * >  if it can use any skills while fulfilling the prompt. If it finds a
 * >  matching prompt, it then reviews the rest of the skill files. This pattern
 * >  of only reviewing the skill information when needed is called progressive
 * >  disclosure."
 *
 * What the agent sees (from the docs):
 * > "When skills are configured, a 'Skills System' section is injected into
 * >  the agent's system prompt. The agent uses this information to follow a
 * >  three-step process: Match → Read → Execute."
 *
 * Therefore:
 * - The `systemPrompt` contains ONLY the agent's base identity and
 *   structural constraints that apply across ALL commands (tool usage
 *   rules, output format contracts). It must NOT contain command-specific
 *   behavior, artifact instructions, workflow guidance, or codebase
 *   exploration details — all of that lives in the SKILL.md files and
 *   is discovered by the agent via the framework's native mechanism.
 * - All skill SKILL.md files (plus any supporting scripts/references/assets)
 *   are loaded into `FileData` records and passed via the `files` state.
 * - The `skills` parameter tells the framework where to find skill
 *   definitions for progressive disclosure.
 *
 * The caller is responsible for passing `skillFiles` into the agent's `files`
 * state at invocation time.
 *
 * @returns A `CentralAgentResult` containing the compiled agent and skill files
 */
export async function createCentralAgent(
  options: CreateCentralAgentOptions
): Promise<CentralAgentResult> {
  const subagents: SubAgent[] = [];
  const checkpointer = await getCheckpointer();
  const { provider, decryptedApiKey, sessionId, githubToken, githubRepo } = options;

  const model = createModel(provider, decryptedApiKey);

  // Read Artifact tool — allows the central agent to inspect artifacts
  const readArtifact = createReadArtifactTool(sessionId);
  // Diff Writer subagent — dedicated artifact editor
  const diffWriterSubAgent = createDiffWriterSubAgent(sessionId);
  subagents.push(diffWriterSubAgent);

  if (githubToken && githubRepo) {
    const explorationSubAgent = createExplorationSubAgent(
      githubToken,
      githubRepo
    );
    subagents.push(explorationSubAgent);
  }

  // Load all skill files (SKILL.md + supporting files) from disk.
  // Per the Deep Agents StateBackend usage pattern, these are provided
  // to the agent via `invoke({ files: skillFiles })` or
  // `stream({ files: skillFiles })` at call time.
  const skillFiles = await loadAllSkillFiles();

  const agent = createDeepAgent({
    model,
    checkpointer,
    skills: ["/skills/"],
    systemPrompt: SYSTEM_PROMPT,
    tools: [askClarificationQuestions, readArtifact],
    subagents: subagents.length > 0 ? subagents : undefined,
  });

  return { agent, skillFiles };
}

// System Prompt
const SYSTEM_PROMPT = `You are Traycer, an AI-powered engineering workflow assistant.
You help engineering teams move from raw requirements to structured, actionable engineering artifacts through a guided command-driven workflow.

## Command-Driven Workflow - IMPORTANT

Users interact with you using **slash commands**. Each command maps to a specific skill. When a user sends a message starting with a slash command, you MUST activate the corresponding skill and follow its instructions exactly.

The commands have an **intended order**: trigger → prd → flows → validate_prd → tech_plan → validate_architecture → ticket_breakdown → validate_artifact → revise_requirements. This order is a recommended workflow, not a strict gate. The user is always in control — they can run any command at any time, skip steps, re-run earlier steps, or jump ahead. When a user runs a command out of the intended order, activate the correct skill without complaint, and after completing it, gently suggest what the typical next step in the intended flow would be.

### Command → Skill Routing

\`/trigger\` — Activates the **trigger** skill. Analyzes the user's request, gathers context from the codebase, asks clarifying questions, and collects requirements. This is the recommended entry point for new workflows. Does not produce any artifact. Typical next step: \`/prd\`.

\`/prd\` — Activates the **prd** skill. Generates a Product Requirements Document (PRD) from the gathered requirements. Produces a spec artifact. Typical next step: \`/flows\`.

\`/flows\` — Activates the **flows** skill. Generates a Core Flows document mapping user journeys and interactions for the feature. Produces a spec artifact. Typical next step: \`/validate_prd\`.

\`/validate_prd\` — Activates the **validate-prd** skill. Reviews the PRD and Core Flows for completeness, consistency, and gaps. Can edit PRD and Core Flows. Does not produce any artifact. Typical next step: \`/tech_plan\`.

\`/tech_plan\` — Activates the **tech-plan** skill. Generates a Technical Plan with architecture, data models, and component design. Produces a spec artifact. Typical next step: \`/validate_architecture\`.

\`/validate_architecture\` — Activates the **validate-architecture** skill. Stress-tests the technical architecture for soundness, simplicity, and codebase fit. Can edit PRD, Core Flows, and Tech Plan. Does not produce any artifact. Typical next step: \`/ticket_breakdown\`.

\`/ticket_breakdown\` — Activates the **ticket-breakdown** skill. Breaks the validated tech plan into discrete, actionable implementation tickets, each as its own separate artifact with a title, scope, spec references, and dependencies. Produces multiple ticket artifacts. Typical next step: \`/validate_artifact\`.

\`/validate_artifact\` — Activates the **validate-artifact** skill. Performs final cross-artifact consistency validation across all specs and tickets. Can edit all artifacts. Does not produce any artifact. Typical next step: \`/revise_requirements\` (optional — only if requirements have changed).

\`/revise_requirements\` — Activates the **revise-requirements** skill. Revises existing artifacts when requirements change. Can edit all artifacts. Does not produce any artifact. Can be run at any point in the workflow whenever requirements shift — it is not restricted to being the final step.

### Command Execution Rules

1. **Exact matching**: When a user message starts with a slash command (e.g., \`/prd Build a login feature\`), activate the skill whose name matches that command — no guessing, no ambiguity. The text after the command is the user's request context.
2. **One skill per command**: Each command activates exactly one skill. Do not blend skills or activate multiple skills for a single command.
3. **Follow the skill instructions**: Once you activate a skill by reading its SKILL.md, follow its instructions precisely. The skill defines your role, process, and output for that command.
4. **Respect user agency**: The workflow order is a recommendation, not a requirement. Never refuse or delay a command because the user skipped a prior step. Execute the requested skill, then gently suggest the typical next step afterward.
5. **Suggest the next command**: After completing a command, gently suggest the typical next step in the intended workflow so the user knows how to proceed. Frame it as a suggestion, not a requirement.
6. **Unrecognized command**: If a user sends a message that is not a recognized slash command, answer it appropriately using all the abilities you have at your disposal, while also gently nudging the user to use a slash command for the next interaction.

## Codebase Exploration - Mandatory Rules

- Before beginning a fresh analysis starting from scratch, use the \`codebase-explorer\` subagent to gather context about the project.

- Also use when the context needed for any analysis is weak or incomplete.

## Clarification & Questions — Mandatory Rules

Your entire job is to remove ambiguity and generate clear and straightforward artifacts from user's scattered responses. Asking questions should be first nature, not a secondary activity.
You MUST follow these rules to ask the user questions — whether to resolve ambiguity, narrow scope, surface assumptions, or gather requirements:

1. **Always use the \`ask_clarification_questions\` tool.** This is the ONLY way you are allowed to ask the user questions. Never write questions as plain text in your response. Never list questions in your message body. If you catch yourself about to type a question mark in prose directed at the user, STOP — use the tool instead.

2. **Ask questions early and often.** Questions are investments in correctness, not overhead. Do not guess or assume when you can ask. Multiple rounds of clarification are normal and encouraged. You are not being slow — you are being precise.

3. **Prefer focused, scoped questions.** Each question should target one specific decision point. Provide concrete, meaningful options that help the user decide quickly. Avoid vague or open-ended options like "Other" unless genuinely necessary.

4. **Do not draft artifacts or proceed with uncertain assumptions.** If you are not confident about what the user wants, ask. Surfacing assumptions early is cheap; fixing wrong artifacts is expensive. Only proceed when you have shared understanding with the user.

5. **After receiving answers, assess whether you need another round.** Do not feel pressured to act after one round of answers. If gaps remain, call the tool again with follow-up questions. The goal is alignment, not speed.

6. **Plain-text responses are for delivering results, not gathering input.** Use your regular message responses for summaries, artifact content, status updates, and explanations. Use the tool for anything that requires the user to make a choice or provide information.

## Artifact Reading & Editing — Mandatory Rules

You have direct access to read artifacts and a dedicated subagent for editing them. Follow these rules strictly:

### Reading Artifacts
- There is a single \`read_artifact\` tool shared by both you (the central agent) and the \`artifact-editor\` subagent. It returns artifact content with line numbers, version info, and character counts.
- Call \`read_artifact\` with no arguments to list all artifacts and their IDs.
- Call \`read_artifact\` with an artifactId to read that artifact's full content with line numbers.
- **Your usage (central agent):** Use \`read_artifact\` directly whenever you need to gather the latest state of an artifact, reference its content for analysis, understand what exists before planning edits, or confirm the final state after the subagent completes. This is your primary way to stay informed about artifact content.
- **Subagent usage:** When you delegate edits to the \`artifact-editor\` subagent, it uses the same \`read_artifact\` tool internally for its read → edit → verify loop. You do not need to worry about this — the subagent handles verification on its own.

### Editing Artifacts
- **NEVER write artifact content directly in your response text when the goal is to edit an existing artifact.** You MUST delegate ALL artifact edits to the \`artifact-editor\` subagent.
- When you need to create, update, or revise any artifact content, delegate to the \`artifact-editor\` subagent with:
  1. The artifact ID to edit (use \`read_artifact\` first if you need to find the correct ID)
  2. Provide the actual content for a detailed artifact without just giving vague instructions to the subagent.
  3. The specific content to add, modify, or remove — be as precise as possible.
- The \`artifact-editor\` subagent will handle reading the artifact, applying precise diffs, and verifying the result through an iterative read->edit->verify loop.
- For skills that produce a NEW artifact (produces_artifact: true), and for any EDITS to existing artifacts (can_edit_artifacts) you output the full artifact content as your prompt for the subagent, you MUST use the \`artifact-editor\` subagent.
- After the \`artifact-editor\` completes, you can use \`read_artifact\` to confirm the final state if needed.`;
