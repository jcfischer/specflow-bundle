/**
 * Implement Command
 * Generate implementation prompt ONLY if all phases are complete
 *
 * This is the gatekeeper that ensures the SpecFlow workflow is followed.
 * Unlike 'next', this command REFUSES to generate a prompt if:
 * - spec.md doesn't exist
 * - plan.md doesn't exist
 * - tasks.md doesn't exist
 *
 * This prevents LLMs from skipping directly to implementation.
 */

import { join } from "path";
import { readFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getNextReadyFeature,
  getNextFeatureNeedingPhases,
  updateFeatureStatus,
  updateFeaturePhase,
  getDbPath,
  dbExists,
} from "../lib/database";
import { validateFeatureCompletion } from "./complete";
import type { Feature } from "../types";

export interface ImplementCommandOptions {
  json?: boolean;
  featureId?: string;
}

interface ImplementPrompt {
  featureId: string;
  name: string;
  description: string;
  prompt: string;
  files: {
    spec: string;
    plan: string;
    tasks: string;
  };
}

/**
 * Build implementation prompt from spec files
 */
function buildImplementationPrompt(feature: Feature): ImplementPrompt {
  const specPath = feature.specPath!;
  const specFile = join(specPath, "spec.md");
  const planFile = join(specPath, "plan.md");
  const tasksFile = join(specPath, "tasks.md");

  const spec = readFileSync(specFile, "utf-8");
  const plan = readFileSync(planFile, "utf-8");
  const tasks = readFileSync(tasksFile, "utf-8");

  // Build the implementation prompt
  const prompt = `# Implementation Task: ${feature.id} - ${feature.name}

## Description
${feature.description}

## Specification (spec.md)
${spec}

## Technical Plan (plan.md)
${plan}

## Implementation Tasks (tasks.md)
${tasks}

## Instructions

Implement this feature following the tasks above. Requirements:

1. **Follow the tasks exactly** - Each task in tasks.md should be completed in order
2. **Write tests first (TDD)** - Create failing tests before implementation
3. **Verify each step** - Run tests after each task to ensure progress
4. **Use project conventions** - Follow existing code patterns in the project

## Completion Criteria

When complete, output:

\`\`\`
[FEATURE COMPLETE]
Feature: ${feature.id} - ${feature.name}
Tests: <number> passing
Files: <list of created/modified files>
\`\`\`

If blocked, output:

\`\`\`
[FEATURE BLOCKED]
Feature: ${feature.id} - ${feature.name}
Reason: <why implementation cannot proceed>
\`\`\`
`;

  return {
    featureId: feature.id,
    name: feature.name,
    description: feature.description,
    prompt,
    files: { spec, plan, tasks },
  };
}

/**
 * Main implement command
 *
 * CRITICAL: This command validates that all phases are complete
 * before allowing implementation to proceed.
 */
export async function implementCommand(
  options: ImplementCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // Get the feature to implement
    let feature: Feature | null;

    if (options.featureId) {
      feature = getFeature(options.featureId);
      if (!feature) {
        console.error(`Error: Feature ${options.featureId} not found.`);
        process.exit(1);
      }
    } else {
      // Get highest-priority feature that's ready for implementation
      feature = getNextReadyFeature();

      if (!feature) {
        // Check if there are features that need phases first
        const needsPhases = getNextFeatureNeedingPhases();

        if (needsPhases) {
          console.error("═".repeat(60));
          console.error("NO FEATURES READY - SpecKit phases needed first");
          console.error("═".repeat(60));
          console.error("");
          console.error(`Next feature by priority: ${needsPhases.id} - ${needsPhases.name}`);
          console.error(`Priority: ${needsPhases.priority}`);
          console.error(`Current phase: ${needsPhases.phase || "none"}`);
          console.error("");
          console.error("Complete SpecKit phases first:");
          if (needsPhases.phase === "none") {
            console.error(`  specflow specify ${needsPhases.id}`);
          }
          if (needsPhases.phase === "none" || needsPhases.phase === "specify") {
            console.error(`  specflow plan ${needsPhases.id}`);
          }
          if (needsPhases.phase !== "tasks" && needsPhases.phase !== "implement") {
            console.error(`  specflow tasks ${needsPhases.id}`);
          }
          console.error("");
          console.error("Then run: specflow implement");
          process.exit(1);
        }

        console.log("No pending features. All features are complete or skipped.");
        return;
      }
    }

    // Check if already complete
    if (feature.status === "complete") {
      console.error(`Error: Feature ${feature.id} is already complete.`);
      process.exit(1);
    }

    // Validate spec path exists
    if (!feature.specPath) {
      console.error(`Error: Feature ${feature.id} has no spec path.`);
      console.error("");
      console.error("You must complete the SpecFlow workflow first:");
      console.error(`  1. Run 'specflow specify ${feature.id}' to create specification`);
      console.error(`  2. Run 'specflow plan ${feature.id}' to create technical plan`);
      console.error(`  3. Run 'specflow tasks ${feature.id}' to create implementation tasks`);
      console.error(`  4. Run 'specflow implement --feature ${feature.id}' to get implementation prompt`);
      process.exit(1);
    }

    // CRITICAL: Validate all required files exist
    const validation = validateFeatureCompletion(feature.specPath);

    if (!validation.valid) {
      console.error("═".repeat(60));
      console.error("IMPLEMENTATION BLOCKED - SpecFlow workflow incomplete");
      console.error("═".repeat(60));
      console.error("");
      console.error(`Feature: ${feature.id} - ${feature.name}`);
      console.error("");
      console.error("Missing required files:");
      for (const error of validation.errors) {
        console.error(`  ✗ ${error}`);
      }
      console.error("");
      console.error("The SpecFlow workflow requires completing all phases:");
      console.error("  1. SPECIFY → spec.md   (requirements and scope)");
      console.error("  2. PLAN    → plan.md   (technical approach)");
      console.error("  3. TASKS   → tasks.md  (implementation steps)");
      console.error("  4. IMPLEMENT           (this command)");
      console.error("");
      console.error("Current file status:");
      console.error(`  spec.md:  ${validation.files.specExists ? "✓ exists" : "✗ missing"}`);
      console.error(`  plan.md:  ${validation.files.planExists ? "✓ exists" : "✗ missing"}`);
      console.error(`  tasks.md: ${validation.files.tasksExists ? "✓ exists" : "✗ missing"}`);
      console.error("");

      // Suggest next step
      if (!validation.files.specExists) {
        console.error(`Next: Run 'specflow specify ${feature.id}'`);
      } else if (!validation.files.planExists) {
        console.error(`Next: Run 'specflow plan ${feature.id}'`);
      } else if (!validation.files.tasksExists) {
        console.error(`Next: Run 'specflow tasks ${feature.id}'`);
      }

      process.exit(1);
    }

    // All validation passed - generate the prompt
    console.error("✓ Validation passed - all SpecFlow phases complete");
    console.error("");

    // Mark as in_progress and update phase
    updateFeatureStatus(feature.id, "in_progress");
    updateFeaturePhase(feature.id, "implement");

    const result = buildImplementationPrompt(feature);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Output just the prompt for use with Task tool
      console.log(result.prompt);
    }
  } finally {
    closeDatabase();
  }
}
