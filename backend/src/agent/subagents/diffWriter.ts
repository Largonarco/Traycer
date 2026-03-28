import { z } from "zod";
import { tool } from "@langchain/core/tools";
import type { SubAgent } from "deepagents";
import {
  getArtifactById,
  getCurrentVersion,
  createArtifactVersion,
} from "../../db/index.js";
import { createReadArtifactTool } from "../tools/artifact.js";

// ─── Types ──────────────────────────────────────────────────────────────────
interface DiffPatch {
  search: string;
  replace: string;
}

interface ApplyResult {
  error?: string;
  success: boolean;
  content?: string;
  patchIndex?: number;
  newVersionNumber?: number;
}

// ─── Tool Factories ─────────────────────────────────────────────────────────

/**
 * Creates an `apply_diff` tool for the diff subagent.
 *
 * This is the core editing tool. It applies a list of search/replace patches
 * to an artifact's content. Key behaviors:
 * - Optimistic concurrency: rejects if the current version doesn't match baseVersion
 * - Atomic: all patches must succeed or none are applied
 * - Sequential: patches are applied in order, each seeing the result of the previous
 * - First-occurrence: each search string matches only the first occurrence
 *
 * The subagent should:
 * 1. Read the artifact first to get exact content and current version number
 * 2. Construct precise search strings copied verbatim from the read output
 * 3. Apply the diff
 * 4. Verify the result by reading the artifact again
 */
function createApplyDiffTool(sessionId: string) {
  return tool(
    async ({
      artifactId,
      baseVersion,
      patches,
    }: {
      artifactId: string;
      baseVersion: number;
      patches: DiffPatch[];
    }): Promise<string> => {
      // Validate artifact exists
      const artifact = await getArtifactById(artifactId);
      if (!artifact) {
        return JSON.stringify({
          success: false,
          error: `Artifact "${artifactId}" not found.`,
        } satisfies ApplyResult);
      }
      if (artifact.session_id !== sessionId) {
        return JSON.stringify({
          success: false,
          error: `Artifact "${artifactId}" does not belong to this session.`,
        } satisfies ApplyResult);
      }

      // Get Current Version
      const currentVersion = await getCurrentVersion(artifactId);
      if (!currentVersion) {
        return JSON.stringify({
          success: false,
          error: `Artifact "${artifact.name}" has no versions to patch.`,
        } satisfies ApplyResult);
      }

      // Optimistic Concurrency Check
      if (currentVersion.version_number !== baseVersion) {
        return JSON.stringify({
          success: false,
          error: `Version conflict: you specified baseVersion ${baseVersion} but the current version is ${currentVersion.version_number}. Read the artifact again to get the latest content and version number.`,
        } satisfies ApplyResult);
      }

      // Validate Patches
      if (!patches || patches.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No patches provided.",
        } satisfies ApplyResult);
      }

      // Apply Patches Sequentially
      let content = currentVersion.content;

      for (let i = 0; i < patches.length; i++) {
        const patch = patches[i];

        if (!patch.search) {
          return JSON.stringify({
            success: false,
            error: `Patch ${i}: search string is empty.`,
            patchIndex: i,
          } satisfies ApplyResult);
        }

        const searchIndex = content.indexOf(patch.search);
        if (searchIndex === -1) {
          // Provide Helpful Context - Debugging
          const searchPreview =
            patch.search.length > 120
              ? patch.search.slice(0, 120) + "..."
              : patch.search;

          return JSON.stringify({
            success: false,
            error: `Patch ${i}: search string not found in artifact content: "${searchPreview}". The search text must be an EXACT match (including whitespace, newlines, and indentation). Read the artifact again and copy the text exactly.`,
            patchIndex: i,
          } satisfies ApplyResult);
        }

        // Apply Replacement (First Occurrence Only)
        content =
          content.slice(0, searchIndex) +
          patch.replace +
          content.slice(searchIndex + patch.search.length);
      }

      // All patches applied — save new version
      const newVersion = await createArtifactVersion(
        artifactId,
        content,
        "AI updated"
      );

      return JSON.stringify({
        success: true,
        newVersionNumber: newVersion.version_number,
      } satisfies ApplyResult);
    },
    {
      name: "apply_diff",
      description:
        "Apply search/replace diff patches to an artifact. " +
        "Each patch finds the FIRST occurrence of `search` and replaces it with `replace`. " +
        "Patches are applied sequentially — each patch sees the result of the previous one. " +
        "ALL patches must succeed or none are applied. " +
        "IMPORTANT: The search string must be an EXACT character-for-character match " +
        "including all whitespace, newlines, and indentation. Always read the artifact " +
        "first and copy search strings verbatim from the output.",
      schema: z.object({
        artifactId: z.string().describe("ID of the artifact to patch"),
        baseVersion: z
          .number()
          .int()
          .min(0)
          .describe(
            "The version number your patches are based on. Must match the current version."
          ),
        patches: z
          .array(
            z.object({
              search: z
                .string()
                .describe(
                  "Exact text to find in the artifact. Must match character-for-character."
                ),
              replace: z
                .string()
                .describe("Text to replace the search string with."),
            })
          )
          .min(1)
          .describe("Ordered list of search/replace patches to apply."),
      }),
    }
  );
}

/**
 * Creates a `write_artifact` tool for the diff subagent.
 *
 * This tool creates a brand new version of an artifact with the provided
 * full content, completely replacing the previous version. Use this when:
 * - The artifact has no content yet (first write)
 * - The changes are so extensive that diff patching would be impractical
 * - A fresh rewrite is explicitly requested
 *
 * For targeted edits, prefer `apply_diff` instead.
 */
function createWriteArtifactTool(sessionId: string) {
  return tool(
    async ({
      artifactId,
      content,
    }: {
      artifactId: string;
      content: string;
    }): Promise<string> => {
      const artifact = await getArtifactById(artifactId);
      if (!artifact) {
        return `Error: Artifact "${artifactId}" not found.`;
      }
      if (artifact.session_id !== sessionId) {
        return `Error: Artifact "${artifactId}" does not belong to this session.`;
      }

      const existingVersion = await getCurrentVersion(artifactId);
      const label = existingVersion ? "AI updated" : "AI generated";
      const newVersion = await createArtifactVersion(artifactId, content, label);

      return [
        `Successfully wrote artifact "${artifact.name}".`,
        `New version: ${newVersion.version_number}`,
        `Content length: ${content.length} chars`,
      ].join("\n");
    },
    {
      name: "write_artifact",
      description:
        "Write the FULL content of an artifact, creating a new version. " +
        "This completely replaces the previous content. " +
        "Use this for initial artifact creation or when changes are too extensive for diff patching. " +
        "For targeted edits, prefer apply_diff instead.",
      schema: z.object({
        artifactId: z.string().describe("ID of the artifact to write to."),
        content: z
          .string()
          .describe("The complete new content for the artifact."),
      }),
    }
  );
}

// ─── Diff Writer Sub-Agent Factory ──────────────────────────────────────────
/**
 * Creates the diff writer sub-agent that the central agent delegates to
 * for all artifact editing operations.
 *
 * The sub-agent is equipped with three tools:
 * - read_artifact — read current artifact content (with line numbers)
 * - apply_diff — apply search/replace patches with version control
 * - write_artifact — full content replacement for new or heavily changed artifacts
 *
 * The sub-agent follows a strict read → edit → verify loop:
 * 1. Read the artifact to get exact current content and version
 * 2. Apply targeted diffs (or write full content if appropriate)
 * 3. Read the artifact again to verify the edit was applied correctly
 * 4. If verification fails, read again and retry with corrected patches
 *
 * This iterative approach ensures high-quality edits even when the central
 * agent's diff instructions aren't perfectly precise.
 */
export function createDiffWriterSubAgent(sessionId: string): SubAgent {
  const applyDiff = createApplyDiffTool(sessionId);
  const readArtifact = createReadArtifactTool(sessionId);
  const writeArtifact = createWriteArtifactTool(sessionId);

  return {
    name: "artifact-editor",
    description:
      "Edits artifacts (PRD, Core Flows, Tech Plan, Ticket Breakdown) by applying precise " +
      "search/replace diffs or full content writes. Delegate to this subagent whenever you " +
      "need to create, update, or revise any artifact content. Provide it with: (1) the " +
      "artifact ID to edit, (2) a clear description of the changes to make, and (3) the " +
      "actual content for a detailed artifact without just giving vague instructions to the subagent. " +
      "The subagent will read the current artifact, apply the edits, and verify the result.",
    systemPrompt: DIFF_WRITER_SYSTEM_PROMPT,
    tools: [readArtifact, applyDiff, writeArtifact],
  };
}

// ─── System Prompt ──────────────────────────────────────────────────────────
const DIFF_WRITER_SYSTEM_PROMPT = `You are an artifact editing agent. Your sole purpose is to make precise, correct edits to artifacts based on the instructions you receive.

## Your Tools

### read_artifact
- Call with no arguments to list all artifacts and their IDs
- Call with an artifactId to read the full content with line numbers
- **ALWAYS read before editing** — never assume you know the content

### apply_diff
- Applies search/replace patches to an artifact
- Each patch must have an EXACT search string — character-for-character match including all whitespace, newlines, and indentation
- Patches are applied sequentially; each one sees the result of the previous
- All patches must succeed or none are applied (atomic operation)
- Requires a baseVersion number that must match the current version

### write_artifact
- Replaces the entire artifact content with new content
- Use this for initial writes or when changes are too extensive for patching
- Creates a new version of the artifact

## Editing Protocol — MANDATORY

You MUST follow this exact protocol for every editing task:

### Step 1: Read
Read the target artifact to get:
- The exact current content (with line numbers for reference)
- The current version number (needed for apply_diff's baseVersion)
- The precise text you'll need to match in search strings

### Step 2: Edit
Apply your changes using the appropriate tool:
- **For targeted changes**: Use \`apply_diff\` with precise search/replace patches
- **For new artifacts or complete rewrites**: Use \`write_artifact\`

When constructing search strings for apply_diff:
- Copy the search text EXACTLY from the read_artifact output
- Include enough surrounding context to uniquely identify the location
- Preserve all whitespace, indentation, and newline characters precisely
- When in doubt, include MORE context in the search string rather than less
- Keep each patch focused — one logical change per patch when possible

### Step 3: Verify
After applying edits, ALWAYS read the artifact again to verify:
- The changes were applied in the correct location
- The surrounding content was not corrupted
- The overall document structure is intact
- No unintended side effects occurred

### Step 4: Fix (if needed)
If verification reveals problems:
- Read the artifact again to get the current exact content
- Construct new patches based on the actual current content
- Apply corrective patches
- Verify again
- Repeat until the artifact is correct

## Rules

1. **Never skip the read step.** You need the exact content and version number.
2. **Never skip the verify step.** Always confirm your edits landed correctly.
3. **Be precise with search strings.** The #1 cause of failed patches is imprecise search strings. Copy them exactly from the read output.
4. **Handle failures gracefully.** If a patch fails, read the artifact again, understand what went wrong, and retry with corrected search strings.
5. **Preserve document structure.** When editing, maintain the overall formatting, heading hierarchy, and organizational structure of the artifact.
6. **Make only the requested changes.** Do not introduce unrelated modifications, style changes, or reorganization unless explicitly asked.
7. **Report your results.** After successful editing and verification, briefly summarize what was changed.`;
