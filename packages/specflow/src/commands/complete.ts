/**
 * Complete Command
 * Mark a feature as complete after implementation
 *
 * ENFORCES SpecFlow workflow:
 * - spec.md must exist (SPECIFY phase completed)
 * - plan.md must exist (PLAN phase completed)
 * - tasks.md must exist (TASKS phase completed)
 * - docs.md must exist (documentation updates recorded)
 *
 * Use --force to bypass validation (not recommended)
 */

import { join } from "path";
import { existsSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeatureStatus,
  updateFeaturePhase,
  getStats,
  getDbPath,
  dbExists,
} from "../lib/database";

export interface CompleteCommandOptions {
  force?: boolean;
}

/**
 * Validation result for a feature
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: {
    specExists: boolean;
    planExists: boolean;
    tasksExists: boolean;
    docsExists: boolean;
  };
}

/**
 * Validate that a feature has completed all required phases
 * Returns validation result with specific errors
 */
export function validateFeatureCompletion(specPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    files: {
      specExists: false,
      planExists: false,
      tasksExists: false,
      docsExists: false,
    },
  };

  const specFile = join(specPath, "spec.md");
  const planFile = join(specPath, "plan.md");
  const tasksFile = join(specPath, "tasks.md");
  const docsFile = join(specPath, "docs.md");

  // Check each required file
  result.files.specExists = existsSync(specFile);
  result.files.planExists = existsSync(planFile);
  result.files.tasksExists = existsSync(tasksFile);
  result.files.docsExists = existsSync(docsFile);

  if (!result.files.specExists) {
    result.valid = false;
    result.errors.push(`Missing spec.md - run 'specflow specify <id>' first`);
  }

  if (!result.files.planExists) {
    result.valid = false;
    result.errors.push(`Missing plan.md - run 'specflow plan <id>' first`);
  }

  if (!result.files.tasksExists) {
    result.valid = false;
    result.errors.push(`Missing tasks.md - run 'specflow tasks <id>' first`);
  }

  if (!result.files.docsExists) {
    result.valid = false;
    result.errors.push(`Missing docs.md - document what was updated (README, CLAUDE.md, etc.)`);
  }

  return result;
}

/**
 * Mark a feature as complete
 * Validates that all SpecFlow phases were completed
 */
export async function completeCommand(
  featureId: string,
  options: CompleteCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    const feature = getFeature(featureId);
    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    if (feature.status === "complete") {
      console.log(`Feature ${featureId} is already complete.`);
      return;
    }

    // Validate spec path exists
    if (!feature.specPath) {
      console.error(`Error: Feature ${featureId} has no spec path configured.`);
      console.error(`Run 'specflow specify ${featureId}' first.`);
      process.exit(1);
    }

    // Validate all required files exist
    const validation = validateFeatureCompletion(feature.specPath);

    if (!validation.valid) {
      if (options.force) {
        console.warn("⚠️  WARNING: Bypassing validation with --force");
        console.warn("   Missing files:");
        for (const error of validation.errors) {
          console.warn(`   - ${error}`);
        }
        console.warn("");
      } else {
        console.error("Error: Cannot mark feature as complete - missing required files:");
        console.error("");
        for (const error of validation.errors) {
          console.error(`  ✗ ${error}`);
        }
        console.error("");
        console.error("The SpecFlow workflow requires:");
        console.error("  1. spec.md  - Feature specification (specflow specify)");
        console.error("  2. plan.md  - Technical plan (specflow plan)");
        console.error("  3. tasks.md - Implementation tasks (specflow tasks)");
        console.error("  4. docs.md  - Documentation updates (README, CLAUDE.md, etc.)");
        console.error("");
        console.error("Use --force to bypass validation (not recommended).");
        process.exit(1);
      }
    } else {
      console.log("✓ Validation passed:");
      console.log(`  ✓ spec.md exists`);
      console.log(`  ✓ plan.md exists`);
      console.log(`  ✓ tasks.md exists`);
      console.log(`  ✓ docs.md exists`);
      console.log("");
    }

    // Mark as complete
    updateFeaturePhase(featureId, "implement");
    updateFeatureStatus(featureId, "complete");

    const stats = getStats();

    console.log(`✓ Marked ${featureId} as complete`);
    console.log(`\nProgress: ${stats.complete}/${stats.total} features (${stats.percentComplete}%)`);

    // Remind to commit changes
    console.log(`\n📝 Don't forget to commit your changes:`);
    console.log(`   git add -A && git commit -m "feat(${featureId}): ${feature.name}"`);

    if (stats.complete < stats.total) {
      console.log(`\nNext: Run 'specflow next' for the next feature.`);
    } else {
      console.log(`\n🎉 All features complete!`);
    }
  } finally {
    closeDatabase();
  }
}
