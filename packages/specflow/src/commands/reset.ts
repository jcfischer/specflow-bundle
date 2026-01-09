/**
 * Reset Command
 * Reset a feature (or all features) to pending status
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  resetFeature as resetFeatureDb,
  getDbPath,
  dbExists,
} from "../lib/database";

export interface ResetOptions {
  all?: boolean;
}

/**
 * Execute the reset command
 */
export async function resetCommand(featureId: string | undefined, options: ResetOptions): Promise<void> {
  const projectPath = process.cwd();

  // Check if database exists
  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    if (options.all) {
      // Reset all features
      const features = getFeatures();
      let count = 0;
      for (const feature of features) {
        if (feature.status !== "pending") {
          resetFeatureDb(feature.id);
          count++;
        }
      }
      console.log(`✓ Reset all features (${count} features changed to pending)`);
    } else {
      if (!featureId) {
        console.error("Error: Feature ID required (or use --all to reset all features)");
        process.exit(1);
      }

      // Check if feature exists
      const feature = getFeature(featureId);
      if (!feature) {
        console.error(`Error: Feature '${featureId}' not found.`);
        process.exit(1);
      }

      // Reset the feature
      resetFeatureDb(featureId);

      console.log(`✓ Reset feature ${featureId}: ${feature.name}`);
      console.log("  Feature status changed to 'pending', timestamps cleared.");
    }
  } finally {
    closeDatabase();
  }
}
