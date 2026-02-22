/**
 * Edit Command
 * Edit feature properties (priority, name, description)
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePriority,
  updateFeatureName,
  updateFeatureDescription,
  updateFeatureSpecPath,
  getDbPath,
  dbExists,
} from "../lib/database";
import { existsSync } from "fs";
import { dirname } from "path";

export interface EditCommandOptions {
  priority?: string;
  name?: string;
  description?: string;
  specPath?: string;
}

/**
 * Edit a feature's properties
 */
export async function editCommand(
  featureId: string,
  options: EditCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  // Check at least one option provided
  if (!options.priority && !options.name && !options.description && !options.specPath) {
    console.error("Error: No changes specified.");
    console.error("Use --priority, --name, --description, or --spec-path to modify the feature.");
    process.exit(1);
  }

  try {
    initDatabase(dbPath);

    const feature = getFeature(featureId);
    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    const changes: string[] = [];

    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority)) {
        console.error("Error: Priority must be a number.");
        process.exit(1);
      }
      updateFeaturePriority(featureId, priority);
      changes.push(`priority: ${feature.priority} → ${priority}`);
    }

    if (options.name) {
      updateFeatureName(featureId, options.name);
      changes.push(`name: "${feature.name}" → "${options.name}"`);
    }

    if (options.description) {
      updateFeatureDescription(featureId, options.description);
      changes.push(`description updated`);
    }

    if (options.specPath) {
      // Validate path: directory exists, or at least parent directory exists
      if (!existsSync(options.specPath) && !existsSync(dirname(options.specPath))) {
        console.error(`Error: Path '${options.specPath}' does not exist and parent directory '${dirname(options.specPath)}' does not exist either.`);
        process.exit(1);
      }
      updateFeatureSpecPath(featureId, options.specPath);
      changes.push(`spec_path: "${feature.specPath ?? "(none)"}" → "${options.specPath}"`);
    }

    console.log(`Updated ${featureId}:`);
    for (const change of changes) {
      console.log(`  - ${change}`);
    }
  } finally {
    closeDatabase();
  }
}
