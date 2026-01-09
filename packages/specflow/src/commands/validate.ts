/**
 * Validate Command
 * Check that a feature has completed all required SpecFlow phases
 *
 * Use this to verify file existence before implementation or completion.
 * This is the gatekeeper that prevents skipping workflow phases.
 */

import { join } from "path";
import { existsSync, statSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature, SpecPhase } from "../types";

export interface ValidateCommandOptions {
  json?: boolean;
  all?: boolean;
}

/**
 * Detailed validation result for a single feature
 */
export interface FeatureValidation {
  featureId: string;
  name: string;
  phase: SpecPhase;
  status: string;
  specPath: string | null;
  valid: boolean;
  readyForImplementation: boolean;
  files: {
    spec: FileStatus;
    plan: FileStatus;
    tasks: FileStatus;
    docs: FileStatus;
  };
  errors: string[];
  warnings: string[];
  nextStep: string | null;
}

interface FileStatus {
  exists: boolean;
  path: string;
  size?: number;
  modified?: string;
}

/**
 * Validate a single feature's workflow completion
 */
function validateFeature(feature: Feature): FeatureValidation {
  const result: FeatureValidation = {
    featureId: feature.id,
    name: feature.name,
    phase: feature.phase,
    status: feature.status,
    specPath: feature.specPath,
    valid: true,
    readyForImplementation: false,
    files: {
      spec: { exists: false, path: "" },
      plan: { exists: false, path: "" },
      tasks: { exists: false, path: "" },
      docs: { exists: false, path: "" },
    },
    errors: [],
    warnings: [],
    nextStep: null,
  };

  // If no spec path, can't validate files
  if (!feature.specPath) {
    result.valid = false;
    result.errors.push("No spec path configured");
    result.nextStep = `Run 'specflow specify ${feature.id}' to create specification`;
    return result;
  }

  // Check each file
  const specFile = join(feature.specPath, "spec.md");
  const planFile = join(feature.specPath, "plan.md");
  const tasksFile = join(feature.specPath, "tasks.md");
  const docsFile = join(feature.specPath, "docs.md");

  result.files.spec = checkFile(specFile);
  result.files.plan = checkFile(planFile);
  result.files.tasks = checkFile(tasksFile);
  result.files.docs = checkFile(docsFile);

  // Determine validity based on expected phase
  if (!result.files.spec.exists) {
    result.valid = false;
    result.errors.push("Missing spec.md - SPECIFY phase incomplete");
    result.nextStep = `Run 'specflow specify ${feature.id}'`;
  } else if (!result.files.plan.exists) {
    if (feature.phase === "specify" || feature.phase === "none") {
      result.warnings.push("plan.md not created yet (expected at this phase)");
    } else {
      result.valid = false;
      result.errors.push("Missing plan.md - PLAN phase incomplete");
    }
    result.nextStep = `Run 'specflow plan ${feature.id}'`;
  } else if (!result.files.tasks.exists) {
    if (feature.phase === "specify" || feature.phase === "plan" || feature.phase === "none") {
      result.warnings.push("tasks.md not created yet (expected at this phase)");
    } else {
      result.valid = false;
      result.errors.push("Missing tasks.md - TASKS phase incomplete");
    }
    result.nextStep = `Run 'specflow tasks ${feature.id}'`;
  } else {
    // All required phase files exist (spec, plan, tasks)
    result.readyForImplementation = true;
    if (feature.status !== "complete") {
      result.nextStep = `Ready to implement. Run 'specflow next --feature ${feature.id}'`;
    } else {
      result.nextStep = null; // Already complete
    }
  }

  // Check docs.md (warning if missing, required for completion)
  if (!result.files.docs.exists) {
    result.warnings.push("docs.md not yet created - required before 'specflow complete'");
  }

  // Warn about phase/file mismatch
  if (feature.phase === "tasks" && !result.files.tasks.exists) {
    result.warnings.push("Phase is 'tasks' but tasks.md doesn't exist - database out of sync");
  }
  if (feature.phase === "plan" && !result.files.plan.exists) {
    result.warnings.push("Phase is 'plan' but plan.md doesn't exist - database out of sync");
  }

  return result;
}

/**
 * Check file existence and get stats
 */
function checkFile(filePath: string): FileStatus {
  const status: FileStatus = {
    exists: existsSync(filePath),
    path: filePath,
  };

  if (status.exists) {
    try {
      const stats = statSync(filePath);
      status.size = stats.size;
      status.modified = stats.mtime.toISOString();
    } catch {
      // Ignore stat errors
    }
  }

  return status;
}

/**
 * Format file status for display
 */
function formatFileStatus(name: string, status: FileStatus): string {
  if (status.exists) {
    const size = status.size ? `${status.size} bytes` : "";
    return `  ✓ ${name} ${size}`;
  }
  return `  ✗ ${name} (missing)`;
}

/**
 * Main validate command
 */
export async function validateCommand(
  featureId: string | undefined,
  options: ValidateCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    let features: Feature[];

    if (options.all || !featureId) {
      features = getFeatures();
      if (features.length === 0) {
        console.log("No features found.");
        return;
      }
    } else {
      const feature = getFeature(featureId);
      if (!feature) {
        console.error(`Error: Feature ${featureId} not found.`);
        process.exit(1);
      }
      features = [feature];
    }

    const results = features.map(validateFeature);

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // Human-readable output
    const validCount = results.filter((r) => r.valid).length;
    const readyCount = results.filter((r) => r.readyForImplementation).length;

    console.log("SpecFlow Validation Report");
    console.log("═".repeat(60));
    console.log("");

    for (const result of results) {
      const statusIcon = result.valid ? "✓" : "✗";
      const readyIcon = result.readyForImplementation ? "🚀" : "";
      console.log(`${statusIcon} ${result.featureId}: ${result.name} ${readyIcon}`);
      console.log(`  Phase: ${result.phase} | Status: ${result.status}`);

      if (result.specPath) {
        console.log("  Files:");
        console.log(formatFileStatus("spec.md", result.files.spec));
        console.log(formatFileStatus("plan.md", result.files.plan));
        console.log(formatFileStatus("tasks.md", result.files.tasks));
        console.log(formatFileStatus("docs.md", result.files.docs));
      }

      if (result.errors.length > 0) {
        console.log("  Errors:");
        for (const error of result.errors) {
          console.log(`    ✗ ${error}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log("  Warnings:");
        for (const warning of result.warnings) {
          console.log(`    ⚠ ${warning}`);
        }
      }

      if (result.nextStep) {
        console.log(`  Next: ${result.nextStep}`);
      }

      console.log("");
    }

    console.log("─".repeat(60));
    console.log(`Summary: ${validCount}/${results.length} valid, ${readyCount} ready for implementation`);

    // Exit with error code if any validation failed
    if (validCount < results.length) {
      process.exit(1);
    }
  } finally {
    closeDatabase();
  }
}
