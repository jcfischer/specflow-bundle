/**
 * Reject Command
 * Reject a feature pending review, returning it to implement phase
 *
 * Part of the extended lifecycle: IMPLEMENT → HARDEN → REVIEW → APPROVE
 */

import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  updateFeatureStatus,
  getDbPath,
  dbExists,
  resolveApprovalGate,
} from "../lib/database";
import { getReviewDir } from "../lib/review";

export interface RejectCommandOptions {
  reason?: string;
}

export async function rejectCommand(
  featureId: string,
  options: RejectCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  if (!options.reason) {
    console.error("Error: --reason is required when rejecting a feature.");
    console.error(`Usage: specflow reject ${featureId} --reason "Explain what needs to change"`);
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

    if (feature.phase !== "review") {
      console.error(`Error: Feature ${featureId} is at phase '${feature.phase}', expected 'review'.`);
      process.exit(1);
    }

    // Resolve approval gate as rejected
    resolveApprovalGate(featureId, "rejected", options.reason);

    // Write feedback file
    const reviewDir = getReviewDir(featureId);
    if (!existsSync(reviewDir)) {
      mkdirSync(reviewDir, { recursive: true });
    }
    const feedbackPath = join(reviewDir, "feedback.md");
    const feedbackContent = `# Rejection Feedback: ${featureId} — ${feature.name}\n\n` +
      `**Date:** ${new Date().toISOString()}\n\n` +
      `## Reason\n\n${options.reason}\n\n` +
      `## Next Steps\n\n` +
      `1. Address the feedback above\n` +
      `2. Re-run: \`specflow harden ${featureId}\` (regenerate acceptance tests if needed)\n` +
      `3. Fill in acceptance tests and ingest: \`specflow harden ${featureId} --ingest\`\n` +
      `4. Re-review: \`specflow review ${featureId}\`\n`;
    writeFileSync(feedbackPath, feedbackContent, "utf-8");

    // Return to implement phase
    updateFeaturePhase(featureId, "implement");
    updateFeatureStatus(featureId, "in_progress");

    console.log(`✗ Rejected ${featureId}: ${feature.name}`);
    console.log(`  Reason: ${options.reason}`);
    console.log(`  Feedback saved: ${feedbackPath}`);
    console.log(`\nFeature returned to IMPLEMENT phase. Fix issues and re-harden.`);
  } finally {
    closeDatabase();
  }
}
