import {
  getArtifactById,
  getCurrentVersion,
  createArtifactVersion,
} from "../../db/index.js";

// Types
export interface DiffPatch {
  search: string;
  replace: string;
}

export interface DiffApplicatorInput {
  artifactId: string;
  baseVersion: number;
  patches: DiffPatch[];
}

export type DiffApplicatorResult =
  | { success: false; error: "artifact_not_found" }
  | { success: false; error: "no_versions"; message: string }
  | { success: true; versionId: string; versionNumber: number }
  | { success: false; error: "version_conflict"; currentVersion: number; baseVersion: number }
  | { success: false; error: "patch_failed"; patchIndex: number; search: string; message: string };

// Applicator
/**
 * Applies a set of search/replace diff patches to an artifact's content.
 *
 * Rules:
 * - Fetches the current artifact version from DB
 * - Rejects with `version_conflict` if current version ≠ baseVersion (optimistic concurrency)
 * - Applies patches sequentially to the artifact content
 * - Rejects the entire patch set if any single block fails to match (no partial writes)
 * - On success, saves the result as a new ArtifactVersion with label "AI updated"
 */
export async function applyDiffs(input: DiffApplicatorInput): Promise<DiffApplicatorResult> {
  const { patches, artifactId, baseVersion } = input;

  // Check Artifact Exists
  const artifact = await getArtifactById(artifactId);
  if (!artifact) {
    return { success: false, error: "artifact_not_found" };
  }

  // Get Current Version
  const currentVersion = await getCurrentVersion(artifactId);
  if (!currentVersion) {
    return {
      success: false,
      error: "no_versions",
      message: "Artifact has no versions to patch",
    };
  }

  // Optimistic Concurrency Check
  if (currentVersion.version_number !== baseVersion) {
    return {
      baseVersion,
      success: false,
      error: "version_conflict",
      currentVersion: currentVersion.version_number,
    };
  }

  // Apply Patches Sequentially (Validate All & Commit)
  let content = currentVersion.content;

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];

    // Check Search String Exists
    const searchIndex = content.indexOf(patch.search);
    if (searchIndex === -1) {
      return {
        patchIndex: i,
        success: false,
        error: "patch_failed",
        search: patch.search.length > 100
          ? patch.search.slice(0, 100) + "..."
          : patch.search,
        message: `Patch ${i} failed: search string not found in artifact content`,
      };
    }

    // Apply Replacement (Only First Occurrence)
    content =
      content.slice(0, searchIndex) +
      patch.replace +
      content.slice(searchIndex + patch.search.length);
  }

  // All Patches Applied — Save New Version
  const newVersion = await createArtifactVersion(artifactId, content, "AI updated");

  return {
    success: true,
    versionId: newVersion.id,
    versionNumber: newVersion.version_number,
  };
}

/**
 * Attempts to parse a structured diff payload from the agent's accumulated output.
 * Used by validation/revision commands that produce search-replace diff blocks.
 */
export function tryParseDiffFromContent(
  content: string
): { artifactId: string; patches: DiffPatch[]; baseVersion: number } | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  const textToTry = jsonMatch ? jsonMatch[1].trim() : content.trim();

  try {
    const parsed = JSON.parse(textToTry);
    if (parsed.artifactId && parsed.patches && Array.isArray(parsed.patches) && typeof parsed.baseVersion === "number") {
      return parsed;
    }
  } catch {
    // Not valid JSON
  }

  return null;
}
