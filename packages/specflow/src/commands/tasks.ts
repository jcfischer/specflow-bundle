/**
 * Tasks Command
 * Run SpecFlow TASKS phase for a feature
 */

import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { isHeadlessMode, runClaudeHeadless, extractMarkdownArtifact } from "../lib/headless";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";
import { wrapPhaseExecution } from "../lib/pipeline-interceptor";
import {
  getAutoChainConfig,
  getAutoChainDescription,
  type AutoChainMode,
} from "../lib/autochain";

export interface TasksCommandOptions {
  dryRun?: boolean;
  /** Auto-chain mode override from CLI: 'always' | 'never' */
  autoChain?: string;
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
      // Self-healing: if DB says tasks is done but tasks.md doesn't exist, re-run
      const tasksFile = feature.specPath ? join(feature.specPath, "tasks.md") : null;
      const artifactMissing = tasksFile && !existsSync(tasksFile);

      if (artifactMissing) {
        console.log(`Feature ${featureId} phase is "${feature.phase}" but tasks.md is missing — re-running tasks`);
        updateFeaturePhase(featureId, "plan");
        // Fall through to run task generation
      } else {
        console.log(`Feature ${featureId} is in phase: ${feature.phase}`);
        if (feature.phase === "tasks" || feature.phase === "implement") {
          console.log("Tasks phase already complete. Continue with implementation.");
        }
        return;
      }
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

    // In headless mode, force autoChain to "always" (skip readline prompt)
    const autoChainOverride = isHeadlessMode() ? "always" : options.autoChain;
    // Get auto-chain configuration for display
    const autoChainConfig = getAutoChainConfig(autoChainOverride, projectPath);

    console.log(`\n📝 Starting TASKS phase for: ${feature.id} - ${feature.name}\n`);
    console.log(`Auto-chain: ${getAutoChainDescription(autoChainConfig)}`);

    if (options.dryRun) {
      console.log("\n[DRY RUN] Would invoke SpecFlow tasks for this feature");
      return;
    }

    // Read spec and plan
    const specFile = join(feature.specPath, "spec.md");
    const specContent = existsSync(specFile) ? readFileSync(specFile, "utf-8") : "";
    const planContent = readFileSync(planFile, "utf-8");

    const prompt = buildTasksPrompt(feature, specContent, planContent);

    console.log("Invoking Claude with SpecFlow tasks workflow...\n");
    console.log("─".repeat(60));

    const tasksFile = join(feature.specPath, "tasks.md");

    try {
      await wrapPhaseExecution(async () => {
        const result = await runClaude(prompt, projectPath);
        if (!result.success) {
          throw new Error(result.error || "Claude execution failed");
        }
        // In headless mode, claude -p can't write files — extract tasks from output
        if (!existsSync(tasksFile) && isHeadlessMode() && result.output) {
          const extracted = extractMarkdownArtifact(result.output);
          if (extracted) {
            writeFileSync(tasksFile, extracted);
            console.log("[headless] Extracted tasks from Claude output and wrote to tasks.md");
          }
        }
        if (!existsSync(tasksFile)) {
          throw new Error("Claude finished but tasks.md was not created");
        }
      }, featureId, feature.name, "tasks", projectPath);
    } catch (error) {
      console.error(`\n✗ TASKS phase failed: ${error instanceof Error ? error.message : String(error)}`);
      updateFeaturePhase(featureId, "plan");
      process.exit(1);
    }

    // Phase succeeded — update and handle auto-chaining
    updateFeaturePhase(featureId, "tasks");
    console.log("\n─".repeat(60));
    console.log(`\n✓ TASKS phase complete for ${featureId}`);
    console.log(`  Tasks created: ${tasksFile}`);

    // Handle auto-chaining (using config declared earlier)
    const shouldChain = await handleAutoChain(autoChainConfig.mode, featureId);

    if (shouldChain) {
      console.log("\n🔗 Chaining to implementation...\n");
      console.log(`Next: Run 'specflow implement ${featureId}' to start implementation`);
    } else {
      console.log("\nTasks ready. Run 'specflow next --feature " + featureId + "' to get the implementation prompt");
    }
  } finally {
    closeDatabase();
  }
}

/**
 * Handle auto-chain logic based on mode
 * @returns true if should chain to implementation
 */
async function handleAutoChain(mode: AutoChainMode, featureId: string): Promise<boolean> {
  switch (mode) {
    case "always":
      return true;

    case "never":
      return false;

    case "prompt":
      return await askUserToChain(featureId);
  }
}

/**
 * Ask user if they want to chain to implementation
 */
async function askUserToChain(featureId: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\nStart implementation for ${featureId} now? [Y/n] `, (answer) => {
      rl.close();
      // Default to yes if user just presses enter
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}

function buildTasksPrompt(feature: Feature, specContent: string, planContent: string): string {
  return `# Task Breakdown

## Context & Motivation

Task breakdown transforms a technical plan into atomic, executable work units. Well-structured tasks enable parallel execution where possible, clear progress tracking, and explicit dependency management. Research shows that tasks with clear file paths and test locations complete 2x faster than ambiguous tasks, because developers spend zero time deciding *where* to write code.

## Feature

**ID:** ${feature.id}
**Name:** ${feature.name}
**Spec Path:** ${feature.specPath}

## Specification

${specContent}

## Technical Plan

${planContent}

## Instructions

Create implementation tasks at: ${feature.specPath}/tasks.md

### Task Structure Requirements

| Element | Purpose |
|---------|---------|
| Task groups | Logical groupings (Foundation, Core, Integration, Polish) |
| Task IDs | Hierarchical numbering (T-1.1, T-1.2, T-2.1) |
| Markers | [T] = requires tests, [P] = parallelizable |
| Dependencies | Which tasks must complete first |
| File paths | Exact paths where code will be written |
| Test locations | Exact paths for test files |
| Progress table | Checklist for tracking completion |

### Example Task Breakdown

\`\`\`markdown
# Implementation Tasks: ${feature.name}

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| T-1.1 | ☐ | |
| T-1.2 | ☐ | |
| T-2.1 | ☐ | |

## Group 1: Foundation

### T-1.1: Create data model [T]
- **File:** src/lib/${feature.id.toLowerCase()}/model.ts
- **Test:** src/lib/${feature.id.toLowerCase()}/model.test.ts
- **Dependencies:** none
- **Description:** Define TypeScript interfaces and Zod schemas for [entities from plan]

### T-1.2: Add database operations [T] [P with T-1.3]
- **File:** src/lib/${feature.id.toLowerCase()}/database.ts
- **Test:** src/lib/${feature.id.toLowerCase()}/database.test.ts
- **Dependencies:** T-1.1
- **Description:** CRUD operations using Drizzle ORM

## Group 2: Core Logic

### T-2.1: Implement business logic [T]
- **File:** src/lib/${feature.id.toLowerCase()}/service.ts
- **Test:** src/lib/${feature.id.toLowerCase()}/service.test.ts
- **Dependencies:** T-1.1, T-1.2
- **Description:** Core service functions per specification requirements

## Group 3: Integration

### T-3.1: Add CLI command [T]
- **File:** src/commands/${feature.id.toLowerCase()}.ts
- **Test:** src/commands/${feature.id.toLowerCase()}.test.ts
- **Dependencies:** T-2.1
- **Description:** Wire service to CLI with Commander.js

## Execution Order

1. T-1.1 (foundation - no deps)
2. T-1.2, T-1.3 (can run in parallel)
3. T-2.1 (after group 1)
4. T-3.1 (after core logic)
\`\`\`

## Output Format

### On Success

\`\`\`
[PHASE COMPLETE: TASKS]
Feature: ${feature.id}
Tasks: ${feature.specPath}/tasks.md
Total tasks: [count]
Parallelizable: [count]
\`\`\`

### On Blocker

\`\`\`
[PHASE BLOCKED: TASKS]
Feature: ${feature.id}
Reason: [explanation of what's blocking]
Suggestion: [how to resolve]
\`\`\``;
}

async function runClaude(
  prompt: string,
  cwd: string
): Promise<{ success: boolean; output: string; error?: string }> {
  // Headless mode: use claude -p --output-format json
  if (isHeadlessMode()) {
    console.log("[headless] Running tasks phase via claude -p...");
    const systemPrompt =
      "You are a task breakdown agent. Follow the instructions exactly. " +
      "Output the complete task breakdown as markdown. " +
      "Start with a # heading. " +
      "Output [PHASE COMPLETE: TASKS] after the tasks content.";
    const result = await runClaudeHeadless(prompt, {
      systemPrompt,
      cwd,
      timeout: parseInt(process.env.SPECFLOW_TIMEOUT ?? '600000', 10),
    });
    if (result.output) {
      process.stdout.write(result.output);
    }
    return result;
  }

  // Interactive mode: unchanged
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
