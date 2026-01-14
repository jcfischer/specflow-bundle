/**
 * Runner Module
 * Orchestrates feature implementation with fresh context per feature
 */

import {
  initDatabase,
  closeDatabase,
  getNextFeature,
  getFeature,
  updateFeatureStatus,
  skipFeature,
  getStats,
  getDbPath,
} from "./database";
import { buildAppContext, buildFeatureContext, formatContextForAgent } from "./context";
import { executeFeature, executeFeatureStreaming } from "./executor";
import type { Feature, RunOptions, RunResult, FeatureStats } from "../types";

// =============================================================================
// Runner Configuration
// =============================================================================

const DEFAULT_DELAY_SECONDS = 3;

// =============================================================================
// Runner Loop
// =============================================================================

export interface RunnerCallbacks {
  onFeatureStart?: (feature: Feature) => void;
  onFeatureComplete?: (feature: Feature, result: RunResult) => void;
  onFeatureBlocked?: (feature: Feature, reason: string) => void;
  onFeatureFailed?: (feature: Feature, error: string) => void;
  onOutput?: (chunk: string) => void;
  onProgress?: (stats: FeatureStats) => void;
}

/**
 * Run the implementation loop
 */
export async function runLoop(
  projectPath: string,
  options: RunOptions,
  callbacks: RunnerCallbacks = {}
): Promise<void> {
  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const appContext = buildAppContext(projectPath);

    let featuresCompleted = 0;
    const maxFeatures = options.maxFeatures || Infinity;

    while (featuresCompleted < maxFeatures) {
      // Get next pending feature
      const feature = getNextFeature();

      if (!feature) {
        // No more pending features
        const stats = getStats();
        callbacks.onProgress?.(stats);

        if (stats.complete === stats.total) {
          console.log("\n✓ All features complete!");
        } else {
          console.log("\n○ No pending features available.");
          console.log(`  ${stats.complete}/${stats.total} complete, ${stats.skipped} skipped`);
        }
        break;
      }

      // Check if feature has completed SpecFlow phases
      if (feature.phase !== "tasks" && feature.phase !== "implement") {
        console.log(`\n⚠ Feature ${feature.id} is not ready for implementation.`);
        console.log(`  Current phase: ${feature.phase || "none"}`);
        console.log(`  Required phase: tasks (after specify → plan → tasks)`);
        console.log(`\n  Run the following commands first:`);
        if (feature.phase === "none") {
          console.log(`    specflow specify ${feature.id}`);
          console.log(`    specflow plan ${feature.id}`);
          console.log(`    specflow tasks ${feature.id}`);
        } else if (feature.phase === "specify") {
          console.log(`    specflow plan ${feature.id}`);
          console.log(`    specflow tasks ${feature.id}`);
        } else if (feature.phase === "plan") {
          console.log(`    specflow tasks ${feature.id}`);
        }
        console.log("\nStopping runner. Complete SpecFlow phases before running.");
        break;
      }

      // Mark feature as in progress
      updateFeatureStatus(feature.id, "in_progress");
      callbacks.onFeatureStart?.(feature);

      // Build context for this feature
      const featureContext = buildFeatureContext(appContext, feature);
      const prompt = formatContextForAgent(featureContext);

      // Execute
      let result: RunResult;

      if (options.dryRun) {
        console.log(`\n[DRY RUN] Would implement: ${feature.id} - ${feature.name}`);
        console.log(`Prompt length: ${prompt.length} characters`);

        // Reset status since we didn't actually run
        updateFeatureStatus(feature.id, "pending");
        featuresCompleted++;
        continue;
      }

      if (callbacks.onOutput) {
        // Streaming mode
        result = await executeFeatureStreaming(
          featureContext,
          prompt,
          callbacks.onOutput,
          { dryRun: options.dryRun }
        );
      } else {
        // Non-streaming mode
        result = await executeFeature(featureContext, prompt, {
          dryRun: options.dryRun,
        });
      }

      // Handle result
      if (result.success) {
        updateFeatureStatus(feature.id, "complete");
        callbacks.onFeatureComplete?.(feature, result);
        featuresCompleted++;

        const stats = getStats();
        callbacks.onProgress?.(stats);
      } else if (result.blocked) {
        skipFeature(feature.id);
        callbacks.onFeatureBlocked?.(feature, result.blockReason ?? "Unknown reason");
      } else {
        // Failed - keep as in_progress for retry or manual intervention
        callbacks.onFeatureFailed?.(feature, result.error ?? "Unknown error");

        // Don't auto-continue on failure - let user decide
        console.log("\nFeature failed. Stopping runner.");
        console.log("Use 'specflow reset' to retry or 'specflow skip' to move on.");
        break;
      }

      // Delay between features
      if (featuresCompleted < maxFeatures) {
        const delayMs = (options.delaySeconds || DEFAULT_DELAY_SECONDS) * 1000;
        await sleep(delayMs);
      }
    }
  } finally {
    closeDatabase();
  }
}

/**
 * Run a single feature by ID
 */
export async function runSingleFeature(
  projectPath: string,
  featureId: string,
  options: Omit<RunOptions, "maxFeatures">,
  callbacks: RunnerCallbacks = {}
): Promise<RunResult> {
  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const appContext = buildAppContext(projectPath);

    const feature = getFeature(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Mark feature as in progress
    updateFeatureStatus(feature.id, "in_progress");
    callbacks.onFeatureStart?.(feature);

    // Build context
    const featureContext = buildFeatureContext(appContext, feature);
    const prompt = formatContextForAgent(featureContext);

    // Execute
    let result: RunResult;

    if (callbacks.onOutput) {
      result = await executeFeatureStreaming(
        featureContext,
        prompt,
        callbacks.onOutput,
        { dryRun: options.dryRun }
      );
    } else {
      result = await executeFeature(featureContext, prompt, {
        dryRun: options.dryRun,
      });
    }

    // Update status based on result
    if (result.success) {
      updateFeatureStatus(feature.id, "complete");
      callbacks.onFeatureComplete?.(feature, result);
    } else if (result.blocked) {
      skipFeature(feature.id);
      callbacks.onFeatureBlocked?.(feature, result.blockReason ?? "Unknown");
    } else {
      callbacks.onFeatureFailed?.(feature, result.error ?? "Unknown error");
    }

    return result;
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
