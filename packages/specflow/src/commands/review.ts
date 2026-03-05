/**
 * Review Command
 * Compile evidence package for human review decision
 *
 * Part of the extended lifecycle: IMPLEMENT → HARDEN → REVIEW → APPROVE
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  getDbPath,
  dbExists,
  getHardenResults,
  insertReviewRecord,
  insertApprovalGate,
} from "../lib/database";
import {
  runAutomatedChecks,
  checkFileAlignment,
  compileReviewPackage,
  writeReviewPackage,
} from "../lib/review";

export interface ReviewCommandOptions {
  json?: boolean;
}

export async function reviewCommand(
  featureId: string,
  options: ReviewCommandOptions = {}
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

    if (feature.phase !== "harden" && feature.phase !== "review") {
      console.error(`Error: Feature ${featureId} is at phase '${feature.phase}', expected 'harden'.`);
      console.error("Run 'specflow harden " + featureId + "' first.");
      process.exit(1);
    }

    // Check that harden results exist
    const hardenResults = getHardenResults(featureId);
    if (hardenResults.length === 0) {
      console.error(`Error: No acceptance test results found for ${featureId}.`);
      console.error("Run 'specflow harden " + featureId + " --ingest' first.");
      process.exit(1);
    }

    console.log(`\nCompiling review package for ${featureId}: ${feature.name}...\n`);

    // Run automated checks
    console.log("Running automated checks...");
    const checks = runAutomatedChecks(projectPath);
    for (const c of checks) {
      const icon = c.passed ? "✓" : "✗";
      const dur = c.duration < 1000 ? `${c.duration}ms` : `${(c.duration / 1000).toFixed(1)}s`;
      console.log(`  ${icon} ${c.name} (${dur})`);
    }

    // Check file alignment
    console.log("\nChecking file alignment...");
    const alignment = feature.specPath
      ? checkFileAlignment(feature.specPath, projectPath)
      : { matched: 0, missing: [], references: [] };
    console.log(`  ${alignment.matched}/${alignment.references.length} references found`);
    if (alignment.missing.length > 0) {
      console.log(`  ${alignment.missing.length} missing`);
    }

    // Compile and write review package
    const pkg = compileReviewPackage(feature, checks, alignment, hardenResults);
    const { mdPath, jsonPath } = writeReviewPackage(featureId, pkg);

    // Store review record
    insertReviewRecord(
      featureId,
      pkg.json.passed,
      JSON.stringify(pkg.json.checks),
      pkg.json.acceptanceTests ? JSON.stringify(pkg.json.acceptanceTests) : null
    );

    // Create approval gate
    insertApprovalGate(featureId);

    // Update phase
    updateFeaturePhase(featureId, "review");

    if (options.json) {
      console.log(JSON.stringify(pkg.json, null, 2));
    } else {
      console.log(`\n${"═".repeat(50)}`);
      console.log(`Verdict: ${pkg.json.passed ? "✓ ALL PASS" : "✗ NEEDS ATTENTION"}`);
      console.log(`${"═".repeat(50)}`);
      console.log(`\nReview package: ${mdPath}`);
      console.log(`Structured data: ${jsonPath}`);
      console.log(`\nDecision:`);
      console.log(`  specflow approve ${featureId}    # Accept`);
      console.log(`  specflow reject ${featureId} --reason "..."  # Return to implement`);
    }
  } finally {
    closeDatabase();
  }
}
