/**
 * Contrib Prep Inventory Module
 * File scanning, classification, and CONTRIBUTION-REGISTRY.md generation
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { classifyFile, type ClassificationResult } from "./patterns";
import {
  getContribState,
  createContribState,
  updateContribInventory,
  updateContribGate,
} from "./state";

// =============================================================================
// Types
// =============================================================================

export interface InventoryEntry {
  file: string;
  classification: "include" | "exclude" | "review";
  reason: string;
}

export interface InventoryResult {
  entries: InventoryEntry[];
  included: number;
  excluded: number;
  review: number;
  registryPath: string;
}

// =============================================================================
// File Enumeration
// =============================================================================

/**
 * Get all tracked files using git ls-files
 */
export function getTrackedFiles(projectPath: string): string[] {
  try {
    const output = execSync("git ls-files", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 30000,
    });

    return output
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    throw new Error(
      "Failed to list git files. Is this a git repository?"
    );
  }
}

// =============================================================================
// Inventory Generation
// =============================================================================

/**
 * Generate file inventory for a feature
 */
export function generateInventory(
  projectPath: string,
  featureId: string,
  baseBranch: string = "main"
): InventoryResult {
  // Get all tracked files
  const files = getTrackedFiles(projectPath);

  // Classify each file
  const entries: InventoryEntry[] = files.map((file) => {
    const result: ClassificationResult = classifyFile(file);
    return {
      file,
      classification: result.classification,
      reason: result.reason,
    };
  });

  // Count by classification
  const included = entries.filter((e) => e.classification === "include").length;
  const excluded = entries.filter((e) => e.classification === "exclude").length;
  const review = entries.filter((e) => e.classification === "review").length;

  // Ensure contrib directory exists
  const contribDir = join(projectPath, ".specflow", "contrib", featureId);
  if (!existsSync(contribDir)) {
    mkdirSync(contribDir, { recursive: true });
  }

  // Generate CONTRIBUTION-REGISTRY.md
  const registryPath = join(contribDir, "CONTRIBUTION-REGISTRY.md");
  const registryContent = formatRegistry(featureId, entries);
  writeFileSync(registryPath, registryContent, "utf-8");

  // Update state
  let state = getContribState(featureId);
  if (!state) {
    state = createContribState(featureId, baseBranch);
  }
  updateContribInventory(featureId, included, excluded);

  // Advance to gate 1 if not already past it
  if (state.gate < 1) {
    updateContribGate(featureId, 1);
  }

  return {
    entries,
    included,
    excluded,
    review,
    registryPath,
  };
}

// =============================================================================
// Registry Formatting
// =============================================================================

/**
 * Format the CONTRIBUTION-REGISTRY.md content
 */
function formatRegistry(
  featureId: string,
  entries: InventoryEntry[]
): string {
  const now = new Date().toISOString();
  const included = entries.filter((e) => e.classification === "include");
  const excluded = entries.filter((e) => e.classification === "exclude");
  const review = entries.filter((e) => e.classification === "review");

  let content = `# Contribution Registry: ${featureId}\n\n`;
  content += `Generated: ${now}\n\n`;

  // Included files
  content += `## Included Files (${included.length})\n\n`;
  if (included.length > 0) {
    content += `| File | Reason |\n`;
    content += `|------|--------|\n`;
    for (const entry of included) {
      content += `| \`${entry.file}\` | ${entry.reason} |\n`;
    }
  } else {
    content += `No files auto-included.\n`;
  }
  content += `\n`;

  // Excluded files
  content += `## Excluded Files (${excluded.length})\n\n`;
  if (excluded.length > 0) {
    content += `| File | Reason |\n`;
    content += `|------|--------|\n`;
    for (const entry of excluded) {
      content += `| \`${entry.file}\` | ${entry.reason} |\n`;
    }
  } else {
    content += `No files auto-excluded.\n`;
  }
  content += `\n`;

  // Review files
  if (review.length > 0) {
    content += `## Review Required (${review.length})\n\n`;
    content += `These files were not matched by auto-classification rules.\n`;
    content += `Please review and manually classify them.\n\n`;
    content += `| File | Suggestion |\n`;
    content += `|------|------------|\n`;
    for (const entry of review) {
      content += `| \`${entry.file}\` | ${entry.reason} |\n`;
    }
    content += `\n`;
  }

  // Summary
  content += `## Summary\n\n`;
  content += `- **Included:** ${included.length}\n`;
  content += `- **Excluded:** ${excluded.length}\n`;
  content += `- **Review:** ${review.length}\n`;
  content += `- **Total:** ${entries.length}\n`;

  return content;
}
