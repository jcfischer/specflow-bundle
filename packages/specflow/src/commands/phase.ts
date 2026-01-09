/**
 * Phase Command
 * Set or query the phase for a feature via CLI
 *
 * Use this when manually creating spec files instead of using the
 * specify/plan/tasks commands. NEVER update the database directly.
 */

import { join } from "path";
import { existsSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  updateFeatureSpecPath,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { SpecPhase } from "../types";

export interface PhaseCommandOptions {
  specPath?: string;
}

const VALID_PHASES: SpecPhase[] = ["none", "specify", "plan", "tasks", "implement"];

/**
 * Register the 'phase' command with the program
 */
export function phaseCommand(program: import("commander").Command): void {
  program
    .command("phase <feature-id> [phase]")
    .description("Get or set the phase for a feature (none, specify, plan, tasks, implement)")
    .option("--spec-path <path>", "Set the spec path for the feature")
    .action(async (featureId: string, phase: string | undefined, options: PhaseCommandOptions) => {
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

        // If no phase provided, show current phase
        if (!phase) {
          console.log(`Feature: ${feature.id} - ${feature.name}`);
          console.log(`Current phase: ${feature.phase}`);
          console.log(`Spec path: ${feature.specPath || "(not set)"}`);
          return;
        }

        // Validate phase
        if (!VALID_PHASES.includes(phase as SpecPhase)) {
          console.error(`Error: Invalid phase '${phase}'`);
          console.error(`Valid phases: ${VALID_PHASES.join(", ")}`);
          process.exit(1);
        }

        // Update spec path if provided
        if (options.specPath) {
          const fullSpecPath = join(projectPath, options.specPath);
          if (!existsSync(fullSpecPath)) {
            console.error(`Error: Spec path does not exist: ${fullSpecPath}`);
            process.exit(1);
          }
          updateFeatureSpecPath(featureId, fullSpecPath);
          console.log(`Updated spec path: ${fullSpecPath}`);
        }

        // Update phase
        updateFeaturePhase(featureId, phase as SpecPhase);
        console.log(`Updated ${featureId} phase: ${feature.phase} → ${phase}`);

        // Show next steps based on new phase
        if (phase === "tasks") {
          console.log("\nFeature is ready for implementation.");
          console.log("Run: specflow implement");
        } else if (phase === "specify") {
          console.log("\nNext: Run 'specflow plan " + featureId + "'");
        } else if (phase === "plan") {
          console.log("\nNext: Run 'specflow tasks " + featureId + "'");
        }
      } finally {
        closeDatabase();
      }
    });
}
