/**
 * Plan Command
 * Run SpecKit PLAN phase for a feature
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

export interface PlanCommandOptions {
  dryRun?: boolean;
}

/**
 * Execute the plan command for a feature
 */
export async function planCommand(
  featureId: string,
  options: PlanCommandOptions = {}
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
    if (feature.phase === "none") {
      console.error(`Error: Feature ${featureId} hasn't been specified yet.`);
      console.error("Run 'specflow specify " + featureId + "' first.");
      process.exit(1);
    }

    if (feature.phase !== "specify") {
      console.log(`Feature ${featureId} is in phase: ${feature.phase}`);
      if (feature.phase === "plan" || feature.phase === "tasks" || feature.phase === "implement") {
        console.log("Plan phase already complete. Continue with next phase.");
      }
      return;
    }

    // Check spec.md exists
    if (!feature.specPath) {
      console.error("Error: No spec path set for this feature.");
      process.exit(1);
    }

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) {
      console.error(`Error: spec.md not found at ${specFile}`);
      console.error("Run 'specflow specify " + featureId + "' first.");
      process.exit(1);
    }

    console.log(`\n📐 Starting PLAN phase for: ${feature.id} - ${feature.name}\n`);

    if (options.dryRun) {
      console.log("[DRY RUN] Would invoke SpecKit plan for this feature");
      return;
    }

    // Read the spec
    const specContent = readFileSync(specFile, "utf-8");

    // Build prompt
    const prompt = buildPlanPrompt(feature, specContent);

    // Update phase
    updateFeaturePhase(featureId, "plan");

    console.log("Invoking Claude with SpecKit plan workflow...\n");
    console.log("─".repeat(60));

    const result = await runClaude(prompt, projectPath);

    if (result.success) {
      const planFile = join(feature.specPath, "plan.md");
      if (existsSync(planFile)) {
        console.log("\n─".repeat(60));
        console.log(`\n✓ PLAN phase complete for ${featureId}`);
        console.log(`  Plan created: ${planFile}`);
        console.log("\nNext: Run 'specflow tasks " + featureId + "' to create implementation tasks");
      } else {
        console.log("\n⚠ Claude finished but plan.md was not created");
        updateFeaturePhase(featureId, "specify");
      }
    } else {
      console.error(`\n✗ PLAN phase failed: ${result.error}`);
      updateFeaturePhase(featureId, "specify");
    }
  } finally {
    closeDatabase();
  }
}

function buildPlanPrompt(feature: Feature, specContent: string): string {
  return `You are running SpecKit's PLAN phase for a feature.

## Feature

**ID:** ${feature.id}
**Name:** ${feature.name}
**Spec Path:** ${feature.specPath}

## Specification

${specContent}

## Your Task

Create a technical plan at: ${feature.specPath}/plan.md

The plan.md should contain:
- Architecture overview (ASCII diagram if helpful)
- Technology stack with rationale
- Data model (entities, schemas)
- API contracts (if applicable)
- Implementation phases
- File structure
- Dependencies
- Risk assessment

When complete, output:
[PHASE COMPLETE: PLAN]
Feature: ${feature.id}
Plan: ${feature.specPath}/plan.md`;
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
