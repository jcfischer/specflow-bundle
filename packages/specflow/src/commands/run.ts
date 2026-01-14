/**
 * Run Command
 * Show guidance for implementing features via Task tool
 *
 * NOTE: This command no longer executes Claude directly.
 * Instead, use 'specflow next' to get the prompt and execute via Task tool.
 */

import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getStats,
  getNextReadyFeature,
  getNextFeatureNeedingPhases,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";

export interface RunCommandOptions {
  maxFeatures?: string;
  delay?: string;
  dryRun?: boolean;
  feature?: string;
}

/**
 * Show run guidance
 */
export async function runCommand(options: RunCommandOptions): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const features = getFeatures();
    const stats = getStats();

    console.log("\n📋 SpecFlow Implementation Guide\n");
    console.log(`Progress: ${stats.complete}/${stats.total} features (${stats.percentComplete}%)`);
    console.log("");

    // Find features by state
    const needsPhases = features.filter(f => f.status === "pending" && f.phase !== "tasks" && f.phase !== "implement");
    const readyToImplement = features.filter(f => f.status === "pending" && (f.phase === "tasks" || f.phase === "implement"));
    const complete = features.filter(f => f.status === "complete");

    if (stats.complete === stats.total) {
      console.log("🎉 All features complete!\n");
      return;
    }

    // Get the next feature by priority (regardless of phase)
    const nextByPriority = getNextFeatureNeedingPhases() || getNextReadyFeature();
    const nextReady = getNextReadyFeature();

    // Show what needs to be done - with priority highlighted
    if (needsPhases.length > 0) {
      console.log("⏳ Features needing SpecFlow phases (by priority):");
      for (const f of needsPhases.slice(0, 5)) {
        const isPriority = f.id === nextByPriority?.id;
        const marker = isPriority ? "→" : " ";
        console.log(`  ${marker} [P${f.priority}] ${f.id}: ${f.name} (phase: ${f.phase || "none"})`);
        if (isPriority) {
          printPhaseCommands(f);
        }
      }
      if (needsPhases.length > 5) {
        console.log(`     ... and ${needsPhases.length - 5} more`);
      }
      console.log("");
    }

    if (readyToImplement.length > 0) {
      console.log("✅ Features ready to implement (by priority):");
      for (const f of readyToImplement.slice(0, 5)) {
        const isPriority = f.id === nextReady?.id && !nextByPriority;
        const marker = isPriority ? "→" : " ";
        console.log(`  ${marker} [P${f.priority}] ${f.id}: ${f.name}`);
      }
      if (readyToImplement.length > 5) {
        console.log(`     ... and ${readyToImplement.length - 5} more`);
      }
      console.log("");
    }

    // Show next steps based on priority
    console.log("─".repeat(60));
    console.log("NEXT STEPS (by priority):");
    console.log("─".repeat(60));
    console.log("");

    if (nextByPriority && needsPhases.some(f => f.id === nextByPriority.id)) {
      // Highest priority feature needs phases
      console.log(`Highest priority: ${nextByPriority.id} [P${nextByPriority.priority}] - ${nextByPriority.name}`);
      console.log("");
      console.log("Complete SpecFlow phases first:");
      printPhaseCommands(nextByPriority, "   ");
      console.log("");
      console.log("Then run: specflow implement");
    } else if (nextReady) {
      // Feature is ready for implementation
      console.log(`Highest priority ready: ${nextReady.id} [P${nextReady.priority}] - ${nextReady.name}`);
      console.log("");
      console.log("1. Get the implementation prompt:");
      console.log(`   specflow implement`);
      console.log("");
      console.log("2. In Claude, use Task tool with the prompt");
      console.log("");
      console.log("3. After implementation, mark complete:");
      console.log(`   specflow complete ${nextReady.id}`);
    }
    console.log("");

  } finally {
    closeDatabase();
  }
}

function printPhaseCommands(feature: Feature, indent: string = "      "): void {
  if (feature.phase === "none") {
    console.log(`${indent}specflow specify ${feature.id}`);
  }
  if (feature.phase === "none" || feature.phase === "specify") {
    console.log(`${indent}specflow plan ${feature.id}`);
  }
  if (feature.phase !== "tasks" && feature.phase !== "implement") {
    console.log(`${indent}specflow tasks ${feature.id}`);
  }
}
