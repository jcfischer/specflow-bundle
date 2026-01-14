/**
 * Next Command
 * Output context for the next ready feature (for use with Task tool)
 */

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getNextReadyFeature,
  getNextFeatureNeedingPhases,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";
import { getPAIContext } from "../lib/pai-context";

export interface NextCommandOptions {
  json?: boolean;
  featureId?: string;
}

/**
 * Get the next feature ready for implementation
 */
export async function nextCommand(options: NextCommandOptions): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    let feature: Feature | null = null;

    if (options.featureId) {
      feature = getFeature(options.featureId);
      if (!feature) {
        console.error(`Error: Feature ${options.featureId} not found.`);
        process.exit(1);
      }
    } else {
      // Find next feature ready for implementation (highest priority with phase = tasks or implement)
      feature = getNextReadyFeature();
    }

    if (!feature) {
      // Check if there are features needing phases (highest priority first)
      const needsPhases = getNextFeatureNeedingPhases();

      if (needsPhases) {
        // Build list of needed phases
        const neededPhases: string[] = [];
        if (needsPhases.phase === "none" || needsPhases.phase === "specify") {
          neededPhases.push("specify");
        }
        if (needsPhases.phase === "none" || needsPhases.phase === "specify" || needsPhases.phase === "plan") {
          neededPhases.push("plan");
        }
        if (needsPhases.phase !== "tasks" && needsPhases.phase !== "implement") {
          neededPhases.push("tasks");
        }

        if (options.json) {
          console.log(JSON.stringify({
            status: "needs_phases",
            featureId: needsPhases.id,
            featureName: needsPhases.name,
            featureDescription: needsPhases.description,
            currentPhase: needsPhases.phase,
            priority: needsPhases.priority,
            neededPhases,
            projectPath,
          }, null, 2));
        } else {
          console.log("No features ready for implementation.");
          console.log(`\nFeature ${needsPhases.id} [P${needsPhases.priority}] needs SpecFlow phases first:`);
          for (const phase of neededPhases) {
            console.log(`  specflow ${phase} ${needsPhases.id}`);
          }
        }
      } else {
        if (options.json) {
          console.log(JSON.stringify({
            status: "all_complete",
            message: "All features complete or no pending features.",
          }, null, 2));
        } else {
          console.log("All features complete or no pending features.");
        }
      }
      return;
    }

    // Build the context
    const context = buildFeatureContext(projectPath, feature);

    if (options.json) {
      console.log(JSON.stringify({ ...context, priority: feature.priority }, null, 2));
    } else {
      // Output human-readable prompt for Task tool
      console.log("─".repeat(70));
      console.log(`FEATURE: ${feature.id} [P${feature.priority}] - ${feature.name}`);
      console.log("─".repeat(70));
      console.log("\nCopy this prompt for Task tool:\n");
      console.log("```");
      console.log(context.prompt);
      console.log("```");
      console.log("\nAfter completion, run:");
      console.log(`  specflow complete ${feature.id}`);
    }
  } finally {
    closeDatabase();
  }
}

interface FeatureContextOutput {
  featureId: string;
  featureName: string;
  projectPath: string;
  specPath: string | null;
  prompt: string;
}

function buildFeatureContext(projectPath: string, feature: Feature): FeatureContextOutput {
  const parts: string[] = [];

  parts.push(`Implement feature ${feature.id}: ${feature.name}`);
  parts.push("");
  parts.push(`**Project Path:** ${projectPath}`);
  parts.push(`**Description:** ${feature.description}`);
  parts.push("");

  // Load spec files if available
  if (feature.specPath && existsSync(feature.specPath)) {
    const specFile = join(feature.specPath, "spec.md");
    const planFile = join(feature.specPath, "plan.md");
    const tasksFile = join(feature.specPath, "tasks.md");

    if (existsSync(specFile)) {
      parts.push("## Specification");
      parts.push(readFileSync(specFile, "utf-8"));
      parts.push("");
    }

    if (existsSync(planFile)) {
      parts.push("## Technical Plan");
      parts.push(readFileSync(planFile, "utf-8"));
      parts.push("");
    }

    if (existsSync(tasksFile)) {
      parts.push("## Tasks");
      parts.push(readFileSync(tasksFile, "utf-8"));
      parts.push("");
    }
  }

  // Add PAI context
  parts.push(getPAIContext());
  parts.push("");

  parts.push("## Instructions");
  parts.push("1. Read existing code in the project first");
  parts.push("2. Implement the feature following the spec/plan/tasks");
  parts.push("3. Follow TDD where applicable (write test first, then implementation)");
  parts.push("4. Run `bun test` and `bun run typecheck` to verify");
  parts.push("5. When complete, output:");
  parts.push("```");
  parts.push("[FEATURE COMPLETE]");
  parts.push(`Feature: ${feature.id}`);
  parts.push("Files: <list of files created/modified>");
  parts.push("```");

  return {
    featureId: feature.id,
    featureName: feature.name,
    projectPath,
    specPath: feature.specPath,
    prompt: parts.join("\n"),
  };
}
