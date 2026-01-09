/**
 * Tasks Command
 * Run SpecKit TASKS phase for a feature
 */

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";

export interface TasksCommandOptions {
  dryRun?: boolean;
}

/**
 * Execute the tasks command for a feature
 */
export async function tasksCommand(
  featureId: string,
  options: TasksCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
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

    // Check phase progression
    if (feature.phase === "none" || feature.phase === "specify") {
      console.error(`Error: Feature ${featureId} hasn't been planned yet.`);
      console.error("Run 'specflow plan " + featureId + "' first.");
      process.exit(1);
    }

    if (feature.phase !== "plan") {
      console.log(`Feature ${featureId} is in phase: ${feature.phase}`);
      if (feature.phase === "tasks" || feature.phase === "implement") {
        console.log("Tasks phase already complete. Continue with implementation.");
      }
      return;
    }

    if (!feature.specPath) {
      console.error("Error: No spec path set for this feature.");
      process.exit(1);
    }

    const planFile = join(feature.specPath, "plan.md");
    if (!existsSync(planFile)) {
      console.error(`Error: plan.md not found at ${planFile}`);
      process.exit(1);
    }

    console.log(`\n📝 Starting TASKS phase for: ${feature.id} - ${feature.name}\n`);

    if (options.dryRun) {
      console.log("[DRY RUN] Would invoke SpecKit tasks for this feature");
      return;
    }

    // Read spec and plan
    const specFile = join(feature.specPath, "spec.md");
    const specContent = existsSync(specFile) ? readFileSync(specFile, "utf-8") : "";
    const planContent = readFileSync(planFile, "utf-8");

    const prompt = buildTasksPrompt(feature, specContent, planContent);

    updateFeaturePhase(featureId, "tasks");

    console.log("Invoking Claude with SpecKit tasks workflow...\n");
    console.log("─".repeat(60));

    const result = await runClaude(prompt, projectPath);

    if (result.success) {
      const tasksFile = join(feature.specPath, "tasks.md");
      if (existsSync(tasksFile)) {
        console.log("\n─".repeat(60));
        console.log(`\n✓ TASKS phase complete for ${featureId}`);
        console.log(`  Tasks created: ${tasksFile}`);
        console.log("\nNext: Run 'specflow next --feature " + featureId + "' to get the implementation prompt");
      } else {
        console.log("\n⚠ Claude finished but tasks.md was not created");
        updateFeaturePhase(featureId, "plan");
      }
    } else {
      console.error(`\n✗ TASKS phase failed: ${result.error}`);
      updateFeaturePhase(featureId, "plan");
    }
  } finally {
    closeDatabase();
  }
}

function buildTasksPrompt(feature: Feature, specContent: string, planContent: string): string {
  return `You are running SpecKit's TASKS phase for a feature.

## Feature

**ID:** ${feature.id}
**Name:** ${feature.name}
**Spec Path:** ${feature.specPath}

## Specification

${specContent}

## Technical Plan

${planContent}

## Your Task

Create implementation tasks at: ${feature.specPath}/tasks.md

The tasks.md should contain:
- Task groups (Foundation, Core, Integration, etc.)
- Task IDs (T-1.1, T-1.2, T-2.1, etc.)
- Markers: [T] for tasks requiring tests, [P] for parallelizable
- Dependencies between tasks
- File paths and test locations
- Execution order
- Progress tracking table

Example format:
\`\`\`markdown
## Group 1: Foundation

### T-1.1: Create data model [T]
- File: src/model.ts
- Test: tests/model.test.ts
- Dependencies: none

### T-1.2: Add CLI skeleton [T]
- File: src/cli.ts
- Test: tests/cli.test.ts
- Dependencies: T-1.1
\`\`\`

When complete, output:
[PHASE COMPLETE: TASKS]
Feature: ${feature.id}
Tasks: ${feature.specPath}/tasks.md`;
}

async function runClaude(
  prompt: string,
  cwd: string
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0 || output.includes("[PHASE COMPLETE")) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, output, error: stderr || `Exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, output, error: err.message });
    });
  });
}
