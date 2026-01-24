/**
 * Skip Command
 * Move a feature to the end of the queue with validation
 *
 * IMPORTANT: Skip decisions require explicit reason and justification
 * to prevent incorrect duplicate detection (see RCA SMS-452).
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  skipFeatureWithValidation,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { SkipReason } from "../types";

/**
 * Options for the skip command
 */
export interface SkipOptions {
  /** Reason for skipping (required) */
  reason?: SkipReason;
  /** Detailed justification (required) */
  justification?: string;
  /** If duplicate, which feature it duplicates */
  duplicateOf?: string;
  /** Skip validation (dangerous - for migration only) */
  force?: boolean;
}

/**
 * Valid skip reasons
 */
const VALID_REASONS: SkipReason[] = [
  "duplicate",
  "deferred",
  "blocked",
  "out_of_scope",
  "superseded",
];

/**
 * Execute the skip command
 */
export async function skipCommand(
  featureId: string,
  options: SkipOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  // Check if database exists
  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // Check if feature exists
    const feature = getFeature(featureId);
    if (!feature) {
      console.error(`Error: Feature '${featureId}' not found.`);
      process.exit(1);
    }

    // Validate required options (unless --force)
    if (!options.force) {
      if (!options.reason) {
        console.error("Error: Skip reason is required.");
        console.error("");
        console.error("Usage: specflow skip <feature-id> --reason <reason> --justification <text>");
        console.error("");
        console.error("Valid reasons:");
        VALID_REASONS.forEach((r) => console.error(`  - ${r}`));
        console.error("");
        console.error("Example:");
        console.error('  specflow skip F-12 --reason duplicate --duplicate-of F-11 \\');
        console.error('    --justification "F-11 already implements Vector configuration"');
        process.exit(1);
      }

      if (!VALID_REASONS.includes(options.reason)) {
        console.error(`Error: Invalid reason '${options.reason}'.`);
        console.error("Valid reasons:", VALID_REASONS.join(", "));
        process.exit(1);
      }

      if (!options.justification) {
        console.error("Error: Justification is required.");
        console.error("");
        console.error("Provide a detailed explanation for why this feature is being skipped.");
        console.error("This helps prevent incorrect skip decisions (see RCA SMS-452).");
        console.error("");
        console.error("Example:");
        console.error('  specflow skip F-12 --reason deferred \\');
        console.error('    --justification "Deferring to v2.0 milestone per stakeholder decision"');
        process.exit(1);
      }

      // Validate the skip with audit trail
      const result = skipFeatureWithValidation(featureId, {
        reason: options.reason,
        justification: options.justification,
        duplicateOf: options.duplicateOf,
      });

      if (!result.success) {
        console.error(`Error: ${result.error}`);
        console.error("");
        console.error("Skip validation failed. If you believe this is incorrect,");
        console.error("verify the duplicate feature and its status, or use a different reason.");
        process.exit(1);
      }

      console.log(`✓ Skipped feature ${featureId}: ${feature.name}`);
      console.log(`  Reason: ${options.reason}`);
      if (options.duplicateOf) {
        console.log(`  Duplicate of: ${options.duplicateOf}`);
      }
      console.log(`  Justification: ${options.justification}`);
      console.log("");
      console.log("  Feature moved to end of queue with status 'skipped'.");
      console.log("  Skip decision recorded in audit trail.");
    } else {
      // Force mode - bypass validation (dangerous)
      console.warn("⚠️  WARNING: Using --force bypasses skip validation.");
      console.warn("   This should only be used for migration purposes.");

      const { skipFeature } = await import("../lib/database");
      skipFeature(featureId);

      console.log(`✓ Skipped feature ${featureId}: ${feature.name} (forced)`);
      console.log("  Feature moved to end of queue with status 'skipped'.");
      console.log("  ⚠️  No audit trail recorded.");
    }
  } finally {
    closeDatabase();
  }
}
