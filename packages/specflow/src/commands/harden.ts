/**
 * Harden Command
 * Generate acceptance test templates and ingest filled results
 *
 * Part of the extended lifecycle: IMPLEMENT → HARDEN → REVIEW → APPROVE
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  updateFeaturePhase,
  getDbPath,
  dbExists,
  getHardenResults,
  upsertHardenResult,
  clearHardenResults,
} from "../lib/database";
import {
  generateAcceptanceTemplate,
  writeTemplate,
  getTemplatePath,
  parseAcceptanceTemplate,
  writeResults,
} from "../lib/harden";
import { existsSync, readFileSync } from "fs";

export interface HardenCommandOptions {
  ingest?: boolean;
  status?: boolean;
  all?: boolean;
  dryRun?: boolean;
}

export async function hardenCommand(
  featureId: string | undefined,
  options: HardenCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // --status: show hardening progress
    if (options.status) {
      showHardenStatus();
      return;
    }

    // --all: generate for all features at implement phase
    if (options.all) {
      const features = getFeatures().filter(
        (f) => f.phase === "implement" && (f.status === "in_progress" || f.status === "complete")
      );
      if (features.length === 0) {
        console.log("No features at implement phase ready for hardening.");
        return;
      }
      for (const f of features) {
        hardenSingleFeature(f.id, options);
      }
      return;
    }

    if (!featureId) {
      console.error("Error: Feature ID required. Usage: specflow harden F-N");
      process.exit(1);
    }

    if (options.ingest) {
      ingestResults(featureId);
    } else {
      hardenSingleFeature(featureId, options);
    }
  } finally {
    closeDatabase();
  }
}

function hardenSingleFeature(featureId: string, options: HardenCommandOptions): void {
  const feature = getFeature(featureId);
  if (!feature) {
    console.error(`Error: Feature ${featureId} not found.`);
    process.exit(1);
  }

  // Allow harden on implement or already-harden phase (for regeneration)
  if (feature.phase !== "implement" && feature.phase !== "harden") {
    console.error(`Error: Feature ${featureId} is at phase '${feature.phase}', expected 'implement' or 'harden'.`);
    console.error("Complete implementation first, then run harden.");
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(`Would generate acceptance tests for ${featureId} (${feature.name})`);
    console.log(`Template path: ${getTemplatePath(featureId)}`);
    return;
  }

  console.log(`\nGenerating acceptance tests for ${featureId}: ${feature.name}...`);
  const template = generateAcceptanceTemplate(feature);
  const path = writeTemplate(featureId, template);

  updateFeaturePhase(featureId, "harden");

  console.log(`\n✓ Acceptance test template generated`);
  console.log(`  Path: ${path}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open ${path}`);
  console.log(`  2. For each test, mark [x] PASS, [x] FAIL, or [x] SKIP`);
  console.log(`  3. Add evidence (screenshots, logs, observations)`);
  console.log(`  4. Run: specflow harden ${featureId} --ingest`);
}

function ingestResults(featureId: string): void {
  const feature = getFeature(featureId);
  if (!feature) {
    console.error(`Error: Feature ${featureId} not found.`);
    process.exit(1);
  }

  if (feature.phase !== "harden") {
    console.error(`Error: Feature ${featureId} is at phase '${feature.phase}', expected 'harden'.`);
    console.error("Run 'specflow harden " + featureId + "' first to generate the template.");
    process.exit(1);
  }

  const templatePath = getTemplatePath(featureId);
  if (!existsSync(templatePath)) {
    console.error(`Error: No acceptance test template found at ${templatePath}`);
    console.error("Run 'specflow harden " + featureId + "' first.");
    process.exit(1);
  }

  const content = readFileSync(templatePath, "utf-8");
  const results = parseAcceptanceTemplate(content);

  if (results.length === 0) {
    console.error("Error: No acceptance tests found in template. Check the format.");
    process.exit(1);
  }

  // Check for pending (unfilled) tests
  const pending = results.filter((r) => r.status === "pending");
  if (pending.length > 0) {
    console.warn(`⚠ ${pending.length} test(s) still pending (not filled in):`);
    for (const p of pending) {
      console.warn(`  - ${p.name}`);
    }
    console.warn("");
  }

  // Store results
  clearHardenResults(featureId);
  for (const r of results) {
    upsertHardenResult(featureId, r.name, r.status, r.evidence);
  }

  // Write results JSON
  writeResults(featureId, results);

  // Summary
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const pend = results.filter((r) => r.status === "pending").length;

  console.log(`\n✓ Ingested ${results.length} acceptance test results for ${featureId}`);
  console.log(`  ✓ Pass: ${pass}  ✗ Fail: ${fail}  ⊘ Skip: ${skip}  ○ Pending: ${pend}`);

  if (fail > 0) {
    console.log(`\n✗ ${fail} test(s) failed. Fix issues and re-run:`);
    console.log(`  specflow harden ${featureId} --ingest`);
  } else if (pend > 0) {
    console.log(`\n○ ${pend} test(s) still pending. Fill them in and re-run:`);
    console.log(`  specflow harden ${featureId} --ingest`);
  } else {
    console.log(`\nReady for review. Run: specflow review ${featureId}`);
  }
}

function showHardenStatus(): void {
  const features = getFeatures();
  const hardenable = features.filter(
    (f) => f.phase === "implement" || f.phase === "harden" || f.phase === "review" || f.phase === "approve"
  );

  if (hardenable.length === 0) {
    console.log("No features at implement phase or beyond.");
    return;
  }

  console.log("\nHarden Status\n");
  console.log("ID        Phase      ATs    Pass   Fail   Status");
  console.log("─".repeat(60));

  for (const f of hardenable) {
    const results = getHardenResults(f.id);
    const total = results.length;
    const pass = results.filter((r) => r.status === "pass").length;
    const fail = results.filter((r) => r.status === "fail").length;

    let status = "—";
    if (f.phase === "implement") status = "Not started";
    else if (f.phase === "harden" && total === 0) status = "Template generated";
    else if (f.phase === "harden" && fail > 0) status = "Failing";
    else if (f.phase === "harden" && total > 0) status = "Ready for review";
    else if (f.phase === "review") status = "In review";
    else if (f.phase === "approve") status = "Approved";

    console.log(
      `${f.id.padEnd(10)}${f.phase.padEnd(11)}${String(total).padEnd(7)}${String(pass).padEnd(7)}${String(fail).padEnd(7)}${status}`
    );
  }
}
