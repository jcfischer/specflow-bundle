/**
 * Revision Module
 * Handles revision history and artifact revision workflows
 *
 * Council Design Decision (F-093):
 * - Track revision history for audit trail
 * - Support both eval-triggered and user-requested revisions
 * - Preserve core content while improving weak sections
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

// =============================================================================
// Types
// =============================================================================

/**
 * Types of artifacts that can be revised
 */
export type ArtifactType = "spec" | "plan" | "tasks";

/**
 * Reasons for revision
 */
export type RevisionReason = "eval_feedback" | "user_request";

/**
 * A revision history entry
 */
export interface RevisionHistory {
  /** Unique identifier for this revision */
  id: string;
  /** Path to the artifact that was revised */
  artifactPath: string;
  /** Content before revision */
  previousContent: string;
  /** When the revision occurred */
  timestamp: Date;
  /** Why the revision was made */
  reason: RevisionReason;
  /** Optional feedback that triggered the revision */
  feedback?: string;
}

/**
 * Result of a revision operation
 */
export interface RevisionResult {
  /** Whether the revision was successful */
  success: boolean;
  /** Path to the revised artifact */
  artifactPath: string;
  /** Eval score after revision (if re-evaluated) */
  evalScore?: number;
  /** Whether the eval passed after revision */
  evalPassed?: boolean;
  /** ID of the revision history entry */
  revisionId?: string;
  /** Error message if revision failed */
  error?: string;
}

/**
 * Options for creating a revision
 */
export interface RevisionOptions {
  /** Custom feedback to incorporate */
  feedback?: string;
  /** Whether to run eval after revision */
  runEval?: boolean;
  /** Dry run mode - don't actually write changes */
  dryRun?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Map artifact types to file names
 */
export const ARTIFACT_FILES: Record<ArtifactType, string> = {
  spec: "spec.md",
  plan: "plan.md",
  tasks: "tasks.md",
};

/**
 * Descriptions for artifact types (used in prompts)
 */
export const ARTIFACT_DESCRIPTIONS: Record<ArtifactType, string> = {
  spec: "feature specification",
  plan: "technical implementation plan",
  tasks: "implementation task breakdown",
};

// =============================================================================
// In-Memory Storage (for testing without database)
// =============================================================================

// In-memory revision history storage
// In production, this would be backed by the database
const revisionHistoryStore: RevisionHistory[] = [];

/**
 * Clear the in-memory revision history (for testing)
 */
export function clearRevisionHistory(): void {
  revisionHistoryStore.length = 0;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a unique revision ID
 */
export function createRevisionId(): string {
  return randomUUID();
}

/**
 * Get artifact path from spec path and type
 */
export function getArtifactPath(specPath: string, type: ArtifactType): string {
  return `${specPath}/${ARTIFACT_FILES[type]}`;
}

/**
 * Check if an artifact exists
 */
export function artifactExists(specPath: string, type: ArtifactType): boolean {
  const path = getArtifactPath(specPath, type);
  return existsSync(path);
}

/**
 * Read artifact content
 */
export function readArtifact(specPath: string, type: ArtifactType): string | null {
  const path = getArtifactPath(specPath, type);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf-8");
}

/**
 * Write artifact content
 */
export function writeArtifact(specPath: string, type: ArtifactType, content: string): void {
  const path = getArtifactPath(specPath, type);
  writeFileSync(path, content);
}

// =============================================================================
// Revision History Management
// =============================================================================

/**
 * Save a revision history entry
 */
export function saveRevisionHistory(entry: RevisionHistory): void {
  revisionHistoryStore.push(entry);
}

/**
 * Get revision history for an artifact
 */
export function getRevisionHistory(artifactPath: string): RevisionHistory[] {
  return revisionHistoryStore.filter(r => r.artifactPath === artifactPath);
}

/**
 * Get all revision history entries
 */
export function getAllRevisionHistory(): RevisionHistory[] {
  return [...revisionHistoryStore];
}

/**
 * Get a specific revision by ID
 */
export function getRevisionById(id: string): RevisionHistory | undefined {
  return revisionHistoryStore.find(r => r.id === id);
}

// =============================================================================
// Prompt Building
// =============================================================================

/**
 * Build a revision prompt for Claude
 */
export function buildRevisionPrompt(
  content: string,
  feedback: string,
  type: ArtifactType
): string {
  const description = ARTIFACT_DESCRIPTIONS[type];
  const capitalizedDescription = description.charAt(0).toUpperCase() + description.slice(1);

  return `# ${capitalizedDescription} Revision

## Context & Motivation

Revision preserves approved work while addressing specific weaknesses. Rather than rewriting from scratch—which risks losing valuable decisions already made—targeted revision improves only the sections that need it. This maintains continuity while ensuring quality gates are met.

## Current ${capitalizedDescription}

${content}

## Feedback to Address

${feedback}

## Instructions

### Revision Principles

1. **Preserve** the core content and structure that the user has already approved
2. **Improve** the weak sections identified in the feedback
3. **Maintain** consistent formatting and style throughout

### Scope Boundaries

Keep the revision focused on the feedback:
- Address each point raised in the feedback
- Retain sections not mentioned in the feedback unchanged
- Preserve the original intent and scope of the document

### Example Revision Pattern

If feedback says "User scenarios lack edge cases", revise like this:

**Before:**
\`\`\`markdown
## User Scenarios
### Scenario 1: Happy Path
- Given valid input...
\`\`\`

**After:**
\`\`\`markdown
## User Scenarios
### Scenario 1: Happy Path
- Given valid input...

### Scenario 2: Invalid Input (added per feedback)
- Given malformed data...

### Scenario 3: Timeout Handling (added per feedback)
- Given network delay exceeds 30 seconds...
\`\`\`

## Output Format

Output the complete revised ${description} in markdown format.

Provide only the revised document—no commentary, explanations, or change summaries. The document should be ready to replace the original directly.`;
}

/**
 * Build a revision summary for display
 */
export function buildRevisionSummary(
  original: string,
  revised: string,
  type: ArtifactType
): string {
  const originalLines = original.split("\n").length;
  const revisedLines = revised.split("\n").length;
  const lineDiff = revisedLines - originalLines;

  const diffSign = lineDiff >= 0 ? "+" : "";
  const description = ARTIFACT_DESCRIPTIONS[type];

  return `Revised ${description}:
  - Original: ${originalLines} lines
  - Revised: ${revisedLines} lines (${diffSign}${lineDiff})`;
}

// =============================================================================
// Main Revision Function
// =============================================================================

/**
 * Create a revision entry for an artifact
 * This saves the current content before revision for rollback
 */
export function createRevisionEntry(
  specPath: string,
  type: ArtifactType,
  reason: RevisionReason,
  feedback?: string
): RevisionHistory | null {
  const content = readArtifact(specPath, type);
  if (!content) {
    return null;
  }

  const entry: RevisionHistory = {
    id: createRevisionId(),
    artifactPath: getArtifactPath(specPath, type),
    previousContent: content,
    timestamp: new Date(),
    reason,
    feedback,
  };

  saveRevisionHistory(entry);
  return entry;
}

/**
 * Restore an artifact from a revision
 */
export function restoreFromRevision(revisionId: string): boolean {
  const revision = getRevisionById(revisionId);
  if (!revision) {
    return false;
  }

  writeFileSync(revision.artifactPath, revision.previousContent);
  return true;
}

/**
 * Format revision history for display
 */
export function formatRevisionHistory(history: RevisionHistory[]): string {
  if (history.length === 0) {
    return "No revision history found.";
  }

  const lines: string[] = [];
  lines.push("Revision History:");
  lines.push("");

  for (const entry of history) {
    const date = entry.timestamp.toISOString().split("T")[0];
    const time = entry.timestamp.toISOString().split("T")[1].split(".")[0];
    const reason = entry.reason === "eval_feedback" ? "Eval feedback" : "User request";

    lines.push(`  ${entry.id.slice(0, 8)} | ${date} ${time} | ${reason}`);
    if (entry.feedback) {
      lines.push(`           Feedback: ${entry.feedback.slice(0, 50)}...`);
    }
  }

  return lines.join("\n");
}
