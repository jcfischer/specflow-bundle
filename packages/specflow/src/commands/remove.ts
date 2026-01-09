/**
 * Remove Command
 * Remove a feature from the queue entirely
 *
 * Use with caution - this permanently deletes the feature from the database.
 * Does NOT delete spec files from .specify/specs/
 */

import { existsSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  deleteFeature,
  getDbPath,
  dbExists,
} from "../lib/database";

export interface RemoveCommandOptions {
  force?: boolean;
}

/**
 * Remove a feature from the queue
 */
export async function removeCommand(
  featureId: string,
  options: RemoveCommandOptions = {}
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

    // Warn if feature has spec files
    if (feature.specPath && existsSync(feature.specPath)) {
      console.warn(`Warning: Spec directory exists at ${feature.specPath}`);
      console.warn("         This command does NOT delete spec files.");
      if (!options.force) {
        console.error("");
        console.error("Use --force to confirm removal.");
        process.exit(1);
      }
    }

    // Warn if feature is complete
    if (feature.status === "complete" && !options.force) {
      console.error(`Error: Feature ${featureId} is already complete.`);
      console.error("       Use --force to remove completed features.");
      process.exit(1);
    }

    deleteFeature(featureId);

    console.log(`Removed feature ${featureId}: ${feature.name}`);
    if (feature.specPath && existsSync(feature.specPath)) {
      console.log("");
      console.log(`Note: Spec files remain at ${feature.specPath}`);
      console.log("      Delete manually if no longer needed.");
    }
  } finally {
    closeDatabase();
  }
}
