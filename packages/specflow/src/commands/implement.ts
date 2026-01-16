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
  const prompt = `# Feature Implementation

## Context & Motivation

This implementation prompt is only generated after completing all SpecFlow phases—specification, technical planning, and task breakdown. By the time you reach this phase, requirements are documented, architecture is decided, and tasks are explicit. This upstream work reduces implementation time by 40-50% and prevents the "build first, understand later" anti-pattern that causes rework.

## Feature

**ID:** ${feature.id}
**Name:** ${feature.name}
**Description:** ${feature.description}

## Specification (spec.md)

${spec}

## Technical Plan (plan.md)

${plan}

## Implementation Tasks (tasks.md)

${tasks}

## Instructions

### Implementation Workflow

Work through tasks in the order specified in tasks.md. For each task:

1. **Read the task** - Understand what needs to be built and where
2. **Write failing test** - Define expected behavior before writing code
3. **Confirm failure** - Run test to verify it fails meaningfully
4. **Write minimal implementation** - Just enough code to pass the test
5. **Confirm pass** - Run test to verify implementation works
6. **Refactor if needed** - Clean up while keeping tests green
7. **Mark task complete** - Update progress tracking table

### Quality Standards

| Standard | Requirement |
|----------|-------------|
| Type safety | TypeScript strict mode, explicit types |
| Documentation | JSDoc for exported functions |
| Error handling | Specific error types, actionable messages |
| Code style | Match existing project conventions |

### Example TDD Cycle

\`\`\`typescript
// Task: T-1.1 Create data model
// Step 1: Write failing test
describe('DataModel', () => {
  it('validates required fields', () => {
    expect(() => createEntity({})).toThrow('name is required');
  });
});

// Step 2: Run → FAIL (function doesn't exist yet)
// Step 3: Write minimal implementation
export function createEntity(data: unknown): Entity {
  const parsed = EntitySchema.parse(data);
  return parsed;
}

// Step 4: Run → PASS
// Step 5: Refactor (add edge cases, improve error messages)
// Step 6: Mark T-1.1 complete, move to T-1.2
\`\`\`

## Output Format

### On Success

\`\`\`
[FEATURE COMPLETE]
Feature: ${feature.id} - ${feature.name}
Tests: [number] passing
Files: [list of created/modified files]
\`\`\`

### On Blocker

\`\`\`
[FEATURE BLOCKED]
Feature: ${feature.id} - ${feature.name}
Reason: [why implementation cannot proceed]
Suggestion: [how to resolve]
\`\`\`

### On Partial Completion

\`\`\`
[FEATURE PARTIAL]
Feature: ${feature.id} - ${feature.name}
Completed: [list of completed task IDs]
Remaining: [list of remaining task IDs]
Blocker: [what's preventing completion]
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
          console.error("NO FEATURES READY - SpecFlow phases needed first");
          console.error("═".repeat(60));
          console.error("");
          console.error(`Next feature by priority: ${needsPhases.id} - ${needsPhases.name}`);
          console.error(`Priority: ${needsPhases.priority}`);
          console.error(`Current phase: ${needsPhases.phase || "none"}`);
          console.error("");
          console.error("Complete SpecFlow phases first:");
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
