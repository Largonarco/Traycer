import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  getArtifactById,
  getCurrentVersion,
  listArtifactsBySession,
} from "../../db/index.js";

/**
 * Creates a `read_artifact` tool bound to a specific session.
 *
 * This is the single, canonical read_artifact tool used by both the central
 * agent and the artifact-editor subagent. It supports two modes:
 * - List all artifacts (when no artifactId is provided)
 * - Read a specific artifact's current version content with line numbers
 *
 * The central agent uses this to inspect artifact state, gather context,
 * and determine what edits are needed before delegating to the subagent.
 * The artifact-editor subagent uses this for verification and state checks
 * during its read → edit → verify loop.
 */
export function createReadArtifactTool(sessionId: string) {
  return tool(
    async ({ artifactId }: { artifactId?: string }) => {
      // List Mode
      if (!artifactId) {
        const artifacts = await listArtifactsBySession(sessionId);
        if (artifacts.length === 0) {
          return "No artifacts found in this session.";
        }

        const lines: string[] = [];
        for (const a of artifacts) {
          const version = await getCurrentVersion(a.id);
          const versionInfo = version
            ? `v${version.version_number}, ${version.content.length} chars`
            : "no versions";
          lines.push(`- **${a.name}** (id: \`${a.id}\`, type: ${a.type}, ${versionInfo})`);
        }

        return `Artifacts in this session:\n${lines.join("\n")}\n\nUse read_artifact with a specific artifactId to read its content.`;
      }

      // Read Mode
      const artifact = await getArtifactById(artifactId);
      if (!artifact) {
        return `Error: Artifact "${artifactId}" not found.`;
      }

      const currentVersion = await getCurrentVersion(artifactId);
      if (!currentVersion) {
        return `Artifact "${artifact.name}" exists but has no content yet.`;
      }

      // Return Line Numbers - Precise Editing
      const lines = currentVersion.content.split("\n");
      const numberedLines = lines.map(
        (line, i) => `${String(i + 1).padStart(5, " ")} | ${line}`
      );

      return [
        `ID: ${artifact.id}`,
        `Type: ${artifact.type}`,
        `Artifact: ${artifact.name}`,
        `Total lines: ${lines.length}`,
        `Version: ${currentVersion.version_number}`,
        `Total chars: ${currentVersion.content.length}`,
        `${"─".repeat(60)}`,
        ...numberedLines,
      ].join("\n");
    },
    {
      name: "read_artifact",
      description:
        "Read the current content of an artifact. " +
        "Call with no arguments to list all artifacts and their IDs. " +
        "Call with an artifactId to read the full content with line numbers. " +
        "Use this to inspect artifact state, gather context, and verify edits.",
      schema: z.object({
        artifactId: z
          .string()
          .optional()
          .describe(
            "ID of the artifact to read. Omit to list all artifacts."
          ),
      }),
    }
  );
}
