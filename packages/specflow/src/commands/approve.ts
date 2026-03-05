/**
 * Approve Command
 * Approve one or more features pending review
 *
 * Part of the extended lifecycle: IMPLEMENT → HARDEN → REVIEW → APPROVE
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  updateFeatureStatus,
  getDbPath,
  dbExists,
  resolveApprovalGate,
  getStats,
} from "../lib/database";

export async function approveCommand(featureIds: string[]): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    let approved = 0;
    let errors = 0;

    for (const featureId of featureIds) {
      const feature = getFeature(featureId);
      if (!feature) {
        console.error(`✗ Feature ${featureId} not found.`);
        errors++;
        continue;
      }

      if (feature.phase !== "review") {
        console.error(`✗ Feature ${featureId} is at phase '${feature.phase}', expected 'review'.`);
        errors++;
        continue;
      }

      resolveApprovalGate(featureId, "approved");
      updateFeaturePhase(featureId, "approve");
      updateFeatureStatus(featureId, "complete");

      console.log(`✓ Approved ${featureId}: ${feature.name}`);
      approved++;
    }

    const stats = getStats();
    console.log(`\n${approved} approved, ${errors} error(s)`);
    console.log(`Progress: ${stats.complete}/${stats.total} features (${stats.percentComplete}%)`);
  } finally {
    closeDatabase();
  }
}
