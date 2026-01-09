/**
 * Skip Command
 * Move a feature to the end of the queue
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  skipFeature as skipFeatureDb,
  getDbPath,
  dbExists,
} from "../lib/database";

/**
 * Execute the skip command
 */
export async function skipCommand(featureId: string): Promise<void> {
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

    // Check if feature exists
    const feature = getFeature(featureId);
    if (!feature) {
      console.error(`Error: Feature '${featureId}' not found.`);
      process.exit(1);
    }

    // Skip the feature
    skipFeatureDb(featureId);

    console.log(`✓ Skipped feature ${featureId}: ${feature.name}`);
    console.log("  Feature moved to end of queue with status 'skipped'.");
  } finally {
    closeDatabase();
  }
}
