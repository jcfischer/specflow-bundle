/**
 * Specify-All Command
 * Runs batch specification for all pending features in parallel
 */

import { spawn } from "child_process";
import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";
import { isBatchReady } from "../types";
import type { DecomposedFeature } from "../types";

export interface SpecifyAllOptions {
  dryRun?: boolean;
  concurrency?: number;
}

interface SpecifyResult {
  featureId: string;
  success: boolean;
  error?: string;
}

/**
 * Execute specify-all command for parallel batch specification
 */
export async function specifyAllCommand(
  options: SpecifyAllOptions = {}
): Promise<void> {
  const projectPath = process.cwd();
  const { dryRun = false, concurrency = 4 } = options;

  // Check if database exists
  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const allFeatures = getFeatures();

    // Filter to pending features in "none" phase that are batch-ready
    const pendingFeatures = allFeatures.filter((f) => {
      if (f.status !== "pending" || f.phase !== "none") {
        return false;
      }
      // Check if feature has rich decomposition data
      const decomposed = f as unknown as Feature & DecomposedFeature;
      return isBatchReady(decomposed);
    });

    if (pendingFeatures.length === 0) {
      console.log("\n📋 No features ready for batch specification.");
      console.log("\nFeatures need:");
      console.log("  - Status: pending");
      console.log("  - Phase: none");
      console.log("  - Rich decomposition fields (problemType, urgency, primaryUser, integrationScope)");
      console.log("\nRun 'specflow enrich <feature-id>' to add missing fields,");
      console.log("or use 'specflow specify <feature-id>' for interactive mode.");
      return;
    }

    console.log(`\n🚀 Batch Specification - ${pendingFeatures.length} features ready\n`);
    console.log(`Concurrency: ${concurrency} parallel processes`);
    console.log("");

    // Display features to be processed
    for (const feature of pendingFeatures) {
      const decomposed = feature as unknown as Feature & DecomposedFeature;
      console.log(`  ${feature.id}: ${feature.name}`);
      console.log(`     └─ ${decomposed.problemType} / ${decomposed.urgency}`);
    }

    if (dryRun) {
      console.log("\n[DRY RUN] Would run batch specification for the above features.");
      return;
    }

    console.log("\n" + "─".repeat(60));
    console.log("Starting parallel specification...\n");

    // Process in batches based on concurrency
    const results: SpecifyResult[] = [];
    for (let i = 0; i < pendingFeatures.length; i += concurrency) {
      const batch = pendingFeatures.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((feature) => runSpecify(feature.id, projectPath))
      );
      results.push(...batchResults);

      // Show progress
      const completed = Math.min(i + concurrency, pendingFeatures.length);
      console.log(`\nProgress: ${completed}/${pendingFeatures.length} features processed`);
    }

    // Summary
    console.log("\n" + "─".repeat(60));
    console.log("\n📊 Specification Summary\n");

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`✓ Successful: ${successful.length}`);
    if (successful.length > 0) {
      for (const r of successful) {
        console.log(`    ${r.featureId}`);
      }
    }

    if (failed.length > 0) {
      console.log(`\n✗ Failed: ${failed.length}`);
      for (const r of failed) {
        console.log(`    ${r.featureId}: ${r.error}`);
      }
    }

    console.log("\n➡️  Next: Run 'specflow status' to see updated phases");
    if (successful.length > 0) {
      console.log(`    Then: Run 'specflow plan <feature-id>' for each specified feature`);
    }
  } finally {
    closeDatabase();
  }
}

/**
 * Run specflow specify --batch for a single feature
 */
async function runSpecify(
  featureId: string,
  cwd: string
): Promise<SpecifyResult> {
  return new Promise((resolve) => {
    console.log(`  ▶ Starting ${featureId}...`);

    const proc = spawn(
      "specflow",
      ["specify", featureId, "--batch"],
      {
        cwd,
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env },
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`  ✓ ${featureId} completed`);
        resolve({ featureId, success: true });
      } else {
        console.log(`  ✗ ${featureId} failed`);
        resolve({
          featureId,
          success: false,
          error: stderr || stdout || `Exit code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      console.log(`  ✗ ${featureId} error: ${err.message}`);
      resolve({
        featureId,
        success: false,
        error: err.message,
      });
    });
  });
}
