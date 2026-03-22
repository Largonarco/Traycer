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
 * This tool allows the central agent to read the current content of any
 * artifact in the session. It supports two modes:
 * - List all artifacts (when no artifactId is provided)
 * - Read a specific artifact's current version content
 *
 * The central agent uses this to inspect artifact state before deciding
 * whether edits are needed, and to provide context to the diff subagent.
 */
export function createReadArtifactTool(sessionId: string) {
  return tool(
    async ({ artifactId }: { artifactId?: string }) => {
      // List Mode: List All Artifacts
      if (!artifactId) {
        const artifacts = await listArtifactsBySession(sessionId);
        if (artifacts.length === 0) {
          return "No artifacts found in this session.";
        }

        const lines = artifacts.map((a) => {
          return `- **${a.name}** (id: \`${a.id}\`, type: ${a.type})`;
        });

        return `Artifacts in this session:\n${lines.join("\n")}\n\nUse this tool again with a specific artifactId to read its content.`;
      }

      // Read Mode: Read Specific Artifact
      const artifact = await getArtifactById(artifactId);
      if (!artifact) {
        return `Error: Artifact with id "${artifactId}" not found.`;
      }

      const currentVersion = await getCurrentVersion(artifactId);
      if (!currentVersion) {
        return `Artifact "${artifact.name}" (id: ${artifact.id}) exists but has no versions yet (empty artifact).`;
      }

      const content = currentVersion.content;

      return [
        `ID: ${artifact.id}`,
        `Type: ${artifact.type}`,
        `Artifact: ${artifact.name}`,
        `Label: ${currentVersion.label}`,
        `Version: ${currentVersion.version_number}`,
        `---`,
        content,
      ].join("\n");
    },
    {
      name: "read_artifact",
      description:
        "Read the current content of an artifact in this session. " +
        "Call with no arguments to list all artifacts and their IDs. " +
        "Call with an artifactId to read that artifact's latest version content. " +
        "Use this to inspect artifact state before deciding on edits.",
      schema: z.object({
        artifactId: z
          .string()
          .optional()
          .describe(
            "ID of the artifact to read. Omit to list all artifacts in the session."
          ),
      }),
    }
  );
}
