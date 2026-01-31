/**
 * Contrib Prep Extraction Module
 * Tag-before-contrib pattern: create annotated tag, then cherry-pick files to clean branch
 *
 * Sequence:
 * 1. Pre-check: gate >= 2, clean working tree, no existing tag/branch
 * 2. Create annotated tag on current HEAD
 * 3. Create contrib branch from base branch
 * 4. Checkout included files from tag (not branch)
 * 5. Commit with structured message
 * 6. Return to original branch
 * 7. Update state: tag_name, tag_hash, contrib_branch, gate=4
 */

import { execSync } from "child_process";
import {
  getContribState,
  createContribState,
  updateContribTag,
  updateContribBranch,
  updateContribGate,
} from "./state";

// =============================================================================
// Types
// =============================================================================

export interface ExtractionOptions {
  baseBranch?: string;
  tagName?: string;
  dryRun?: boolean;
}

export interface ExtractionResult {
  tagName: string;
  tagHash: string;
  contribBranch: string;
  filesExtracted: number;
  originalBranch: string;
  timestamp: string;
}

// =============================================================================
// Git Helpers
// =============================================================================

/**
 * Check if working tree is clean
 */
export function isWorkingTreeClean(projectPath: string): boolean {
  try {
    const output = execSync("git status --porcelain", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return output.length === 0;
  } catch {
    return false;
  }
}

/**
 * Check if a git tag exists
 */
export function tagExists(projectPath: string, tagName: string): boolean {
  try {
    const output = execSync(`git tag -l "${tagName}"`, {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a git branch exists
 */
export function branchExists(projectPath: string, branchName: string): boolean {
  try {
    const output = execSync(`git branch --list "${branchName}"`, {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(projectPath: string): string {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

/**
 * Get the hash of a tag or ref
 */
export function getRefHash(projectPath: string, ref: string): string {
  return execSync(`git rev-parse "${ref}"`, {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

// =============================================================================
// Extraction
// =============================================================================

/**
 * Run the tag-before-contrib extraction
 *
 * Creates an annotated tag on the current HEAD, then creates a clean contrib
 * branch from the base branch with only the included files checked out from
 * the tag.
 */
export function runExtraction(
  projectPath: string,
  featureId: string,
  includedFiles: string[],
  options: ExtractionOptions = {}
): ExtractionResult {
  const baseBranch = options.baseBranch ?? "main";
  const contribBranch = `contrib/${featureId}`;
  const defaultTagName = `contrib-prep/${featureId}`;
  const tagName = options.tagName ?? defaultTagName;

  // ── Pre-checks ──────────────────────────────────────────────────────────

  // Check working tree is clean
  if (!isWorkingTreeClean(projectPath)) {
    throw new Error(
      "Working tree is not clean. Commit or stash changes before extraction."
    );
  }

  // Check tag doesn't already exist
  if (tagExists(projectPath, tagName)) {
    throw new Error(
      `Tag '${tagName}' already exists. Use a different --tag name or delete the existing tag.`
    );
  }

  // Check contrib branch doesn't already exist
  if (branchExists(projectPath, contribBranch)) {
    throw new Error(
      `Branch '${contribBranch}' already exists. Delete it first or use a different feature ID.`
    );
  }

  // Check we have files to extract
  if (includedFiles.length === 0) {
    throw new Error("No files to extract. Run --inventory first.");
  }

  // ── Dry-run mode ────────────────────────────────────────────────────────

  if (options.dryRun) {
    return {
      tagName,
      tagHash: "(dry-run)",
      contribBranch,
      filesExtracted: includedFiles.length,
      originalBranch: getCurrentBranch(projectPath),
      timestamp: new Date().toISOString(),
    };
  }

  // ── Execute extraction ──────────────────────────────────────────────────

  const originalBranch = getCurrentBranch(projectPath);

  // 1. Create annotated tag on current HEAD
  const tagMessage = [
    `Contrib prep for ${featureId}`,
    "",
    `Files: ${includedFiles.length} included`,
    `Base branch: ${baseBranch}`,
    `Contrib branch: ${contribBranch}`,
  ].join("\n");

  execSync(`git tag -a "${tagName}" -m "${tagMessage}"`, {
    cwd: projectPath,
    stdio: "pipe",
  });

  const tagHash = getRefHash(projectPath, tagName);

  try {
    // 2. Create contrib branch from base
    execSync(`git checkout -b "${contribBranch}" "${baseBranch}"`, {
      cwd: projectPath,
      stdio: "pipe",
    });

    // 3. Checkout included files from tag (the key pattern: from tag, not branch)
    let filesExtracted = 0;
    for (const file of includedFiles) {
      try {
        execSync(`git checkout "${tagName}" -- "${file}"`, {
          cwd: projectPath,
          stdio: "pipe",
        });
        filesExtracted++;
      } catch {
        // File might not exist at the tag (new untracked file) — skip
        console.warn(`Warning: Could not checkout '${file}' from tag '${tagName}'`);
      }
    }

    // 4. Stage all changes
    execSync("git add -A", {
      cwd: projectPath,
      stdio: "pipe",
    });

    // 5. Commit with structured message (only if there are staged changes)
    const hasStagedChanges = (() => {
      try {
        execSync("git diff --cached --quiet", {
          cwd: projectPath,
          stdio: "pipe",
        });
        return false; // exit 0 = no changes
      } catch {
        return true; // exit 1 = has changes
      }
    })();

    if (hasStagedChanges) {
      const commitMessage = [
        `contrib: ${featureId}`,
        "",
        `Extracted from tag ${tagName}`,
        `Files: ${filesExtracted}`,
        `Base: ${baseBranch}`,
      ].join("\n");

      execSync(`git commit --no-verify -m "${commitMessage}"`, {
        cwd: projectPath,
        stdio: "pipe",
      });
    }

    // 6. Return to original branch
    execSync(`git checkout "${originalBranch}"`, {
      cwd: projectPath,
      stdio: "pipe",
    });

    // 7. Update state
    let state = getContribState(featureId);
    if (!state) {
      state = createContribState(featureId, baseBranch);
    }
    updateContribTag(featureId, tagName, tagHash);
    updateContribBranch(featureId, contribBranch);
    if (state.gate < 4) {
      updateContribGate(featureId, 4);
    }

    return {
      tagName,
      tagHash,
      contribBranch,
      filesExtracted,
      originalBranch,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    // On error, try to return to original branch
    try {
      execSync(`git checkout "${originalBranch}"`, {
        cwd: projectPath,
        stdio: "pipe",
      });
    } catch {
      // Best effort
    }
    throw error;
  }
}
