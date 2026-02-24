/**
 * Complete Command
 * Mark a feature as complete after implementation
 *
 * ENFORCES SpecFlow workflow:
 * - spec.md must exist (SPECIFY phase completed)
 * - plan.md must exist (PLAN phase completed)
 * - tasks.md must exist (TASKS phase completed)
 * - docs.md must exist (documentation updates recorded)
 *
 * Use --force to bypass validation (not recommended)
 */

import { join } from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { spawnSync } from "child_process";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeatureStatus,
  updateFeaturePhase,
  getStats,
  getDbPath,
  dbExists,
} from "../lib/database";
import { runDoctorowGate, isDoctorowVerified } from "../lib/doctorow";
import { generateDocs, loadDocGenConfig } from "../lib/doc-generator";

export interface CompleteCommandOptions {
  force?: boolean;
  skipDoctorow?: boolean;
  skipDocs?: boolean;
  reviewRequired?: boolean;
}

/**
 * Validation result for a feature
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: {
    specExists: boolean;
    planExists: boolean;
    tasksExists: boolean;
    docsExists: boolean;
    verifyExists: boolean;
  };
  tests: {
    srcFileCount: number;
    testFileCount: number;
    ratio: number;
    allTestsPass: boolean;
  };
}

// Minimum test coverage ratio (test files / source files)
const MIN_TEST_COVERAGE_RATIO = 0.3;

// Required sections in verify.md
const VERIFY_REQUIRED_SECTIONS = [
  "## Pre-Verification Checklist",
  "## Smoke Test Results",
  "## Browser Verification",
  "## API Verification",
];

/**
 * Count files matching pattern recursively
 */
function countFilesRecursive(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;

  let count = 0;
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      count += countFilesRecursive(fullPath, pattern);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      count++;
    }
  }

  return count;
}

/**
 * Run tests and check if they pass
 */
function runTests(): { pass: boolean; output: string } {
  const result = spawnSync("bun", ["test"], {
    encoding: "utf-8",
    timeout: 60000,
    cwd: process.cwd(),
  });

  return {
    pass: result.status === 0,
    output: result.stdout + result.stderr,
  };
}

/**
 * Validate verify.md has required sections
 */
/**
 * Check if a section's content indicates it is not applicable.
 * Returns true if the content between this heading and the next heading
 * contains "N/A", "Not applicable", "Not required", or "CLI only" (case-insensitive).
 */
function isSectionNotApplicable(content: string, sectionHeading: string): boolean {
  const headingIndex = content.indexOf(sectionHeading);
  if (headingIndex === -1) return false;

  const afterHeading = content.slice(headingIndex + sectionHeading.length);
  const nextHeadingMatch = afterHeading.match(/\n## /);
  const sectionContent = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  const naPattern = /\b(n\/a|not applicable|not required|cli only)\b/i;
  return naPattern.test(sectionContent);
}

function validateVerifyFile(verifyPath: string): string[] {
  const errors: string[] = [];

  if (!existsSync(verifyPath)) {
    return ["verify.md does not exist"];
  }

  const content = readFileSync(verifyPath, "utf-8");

  for (const section of VERIFY_REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      errors.push(`verify.md missing required section: "${section}"`);
    }
  }

  // Check that verification was actually completed (not just template)
  // But skip placeholder checks for sections marked as N/A
  if (content.includes("[paste actual output]") || content.includes("[paste actual response]")) {
    // Only flag unfilled placeholders if the section containing them is not marked N/A
    const placeholderPattern = /\[paste actual (?:output|response)\]/g;
    let match;
    while ((match = placeholderPattern.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lastHeadingMatch = beforeMatch.match(/## [^\n]+/g);
      const lastHeading = lastHeadingMatch ? lastHeadingMatch[lastHeadingMatch.length - 1] : null;

      if (!lastHeading || !isSectionNotApplicable(content, lastHeading)) {
        errors.push("verify.md contains unfilled placeholders - actual verification not performed");
        break;
      }
    }
  }

  return errors;
}

/**
 * Check if a PR for the given branch has been approved via GitHub PR reviews.
 * Returns { approved, reviewCount, prNumber } or null if no PR found.
 */
function checkPRReviewStatus(branch: string): {
  approved: boolean;
  reviewCount: number;
  prNumber: number | null;
} | null {
  // Find PR for this branch
  const prResult = spawnSync(
    "gh",
    ["pr", "list", "--head", branch, "--state", "open", "--json", "number,reviews", "--limit", "1"],
    { encoding: "utf-8", timeout: 15000 }
  );

  if (prResult.status !== 0) return null;

  try {
    const prs = JSON.parse(prResult.stdout);
    if (prs.length === 0) return null;

    const pr = prs[0];
    const reviews: Array<{ state: string }> = pr.reviews ?? [];
    const approved = reviews.some((r: { state: string }) => r.state === "APPROVED");

    return {
      approved,
      reviewCount: reviews.length,
      prNumber: pr.number,
    };
  } catch {
    return null;
  }
}

/**
 * Validate that a feature has completed all required phases
 * Returns validation result with specific errors
 */
export function validateFeatureCompletion(specPath: string): ValidationResult {
  const projectPath = process.cwd();

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    files: {
      specExists: false,
      planExists: false,
      tasksExists: false,
      docsExists: false,
      verifyExists: false,
    },
    tests: {
      srcFileCount: 0,
      testFileCount: 0,
      ratio: 0,
      allTestsPass: false,
    },
  };

  const specFile = join(specPath, "spec.md");
  const planFile = join(specPath, "plan.md");
  const tasksFile = join(specPath, "tasks.md");
  const docsFile = join(specPath, "docs.md");
  const verifyFile = join(specPath, "verify.md");

  // Check each required file
  result.files.specExists = existsSync(specFile);
  result.files.planExists = existsSync(planFile);
  result.files.tasksExists = existsSync(tasksFile);
  result.files.docsExists = existsSync(docsFile);
  result.files.verifyExists = existsSync(verifyFile);

  if (!result.files.specExists) {
    result.valid = false;
    result.errors.push(`Missing spec.md - run 'specflow specify <id>' first`);
  }

  if (!result.files.planExists) {
    result.valid = false;
    result.errors.push(`Missing plan.md - run 'specflow plan <id>' first`);
  }

  if (!result.files.tasksExists) {
    result.valid = false;
    result.errors.push(`Missing tasks.md - run 'specflow tasks <id>' first`);
  }

  if (!result.files.docsExists) {
    result.valid = false;
    result.errors.push(`Missing docs.md - document what was updated (README, CLAUDE.md, etc.)`);
  }

  if (!result.files.verifyExists) {
    result.valid = false;
    result.errors.push(`Missing verify.md - verify the feature works end-to-end before completing`);
  } else {
    // Validate verify.md content
    const verifyErrors = validateVerifyFile(verifyFile);
    if (verifyErrors.length > 0) {
      result.valid = false;
      result.errors.push(...verifyErrors);
    }
  }

  // Test coverage validation
  const srcDir = join(projectPath, "src");
  const testsDir = join(projectPath, "tests");
  const testDirAlt = join(projectPath, "test");

  result.tests.srcFileCount = countFilesRecursive(srcDir, /\.(ts|tsx|js|jsx)$/);
  result.tests.testFileCount =
    countFilesRecursive(testsDir, /\.test\.(ts|tsx|js|jsx)$/) +
    countFilesRecursive(testDirAlt, /\.test\.(ts|tsx|js|jsx)$/);

  if (result.tests.srcFileCount > 0) {
    result.tests.ratio = result.tests.testFileCount / result.tests.srcFileCount;

    if (result.tests.ratio < MIN_TEST_COVERAGE_RATIO) {
      result.valid = false;
      result.errors.push(
        `Insufficient test coverage: ${result.tests.testFileCount} test files for ${result.tests.srcFileCount} source files ` +
          `(ratio: ${result.tests.ratio.toFixed(2)}, minimum: ${MIN_TEST_COVERAGE_RATIO})`
      );
    }
  }

  // Run tests and check they pass
  if (result.tests.testFileCount > 0) {
    const testResult = runTests();
    result.tests.allTestsPass = testResult.pass;

    if (!testResult.pass) {
      result.valid = false;
      result.errors.push("Tests are failing - fix all tests before marking feature complete");
    }
  } else {
    result.warnings.push("No test files found - TDD was not followed");
  }

  return result;
}

/**
 * Mark a feature as complete
 * Validates that all SpecFlow phases were completed
 */
export async function completeCommand(
  featureId: string,
  options: CompleteCommandOptions = {}
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

    if (feature.status === "complete") {
      console.log(`Feature ${featureId} is already complete.`);
      return;
    }

    // Validate spec path exists
    if (!feature.specPath) {
      console.error(`Error: Feature ${featureId} has no spec path configured.`);
      console.error(`Run 'specflow specify ${featureId}' first.`);
      process.exit(1);
    }

    // Auto-generate documentation (docs.md, CHANGELOG) before validation
    if (!options.skipDocs && !options.force) {
      console.log("📝 Generating documentation...");
      const docResult = await generateDocs(
        projectPath,
        featureId,
        feature.name,
        feature.specPath
      );

      if (docResult.changelogEntry) {
        console.log(`  ✓ CHANGELOG entry added`);
      }
      if (docResult.docsContent) {
        console.log(`  ✓ docs.md generated`);
      }
      if (docResult.readmeSuggestions) {
        console.log(`  ✓ README suggestions generated`);
      }
      if (docResult.errors.length > 0) {
        for (const error of docResult.errors) {
          console.warn(`  ⚠ ${error}`);
        }
      }
      console.log("");
    }

    // Validate all required files exist
    const validation = validateFeatureCompletion(feature.specPath);

    // Show warnings even if validation passes
    if (validation.warnings.length > 0) {
      console.warn("⚠️  Warnings:");
      for (const warning of validation.warnings) {
        console.warn(`   - ${warning}`);
      }
      console.warn("");
    }

    if (!validation.valid) {
      if (options.force) {
        console.warn("⚠️  WARNING: Bypassing validation with --force");
        console.warn("   Issues:");
        for (const error of validation.errors) {
          console.warn(`   - ${error}`);
        }
        console.warn("");
      } else {
        console.error("Error: Cannot mark feature as complete - validation failed:");
        console.error("");
        for (const error of validation.errors) {
          console.error(`  ✗ ${error}`);
        }
        console.error("");
        console.error("The SpecFlow workflow requires:");
        console.error("  1. spec.md   - Feature specification (specflow specify)");
        console.error("  2. plan.md   - Technical plan (specflow plan)");
        console.error("  3. tasks.md  - Implementation tasks (specflow tasks)");
        console.error("  4. docs.md   - Documentation updates (auto-generated or manual)");
        console.error("  5. verify.md - End-to-end verification (prove it works)");
        console.error("");
        console.error("Test Coverage Requirements:");
        console.error(`  - Minimum test file ratio: ${MIN_TEST_COVERAGE_RATIO} (test files / source files)`);
        console.error("  - All tests must pass");
        console.error("");
        console.error("Use --force to bypass validation (not recommended).");
        process.exit(1);
      }
    } else {
      console.log("✓ Validation passed:");
      console.log(`  ✓ spec.md exists`);
      console.log(`  ✓ plan.md exists`);
      console.log(`  ✓ tasks.md exists`);
      console.log(`  ✓ docs.md exists`);
      console.log(`  ✓ verify.md exists and complete`);
      console.log(
        `  ✓ Test coverage: ${validation.tests.testFileCount}/${validation.tests.srcFileCount} files ` +
          `(ratio: ${validation.tests.ratio.toFixed(2)})`
      );
      console.log(`  ✓ All tests pass`);
      console.log("");
    }

    // Run Doctorow Gate (unless force is used)
    if (!options.force) {
      // Check if already verified
      if (isDoctorowVerified(feature.specPath)) {
        console.log("✓ Doctorow Gate previously verified");
      } else {
        const doctorowResult = await runDoctorowGate(
          featureId,
          feature.specPath,
          options.skipDoctorow ?? false
        );

        if (!doctorowResult.passed && !doctorowResult.skipped) {
          console.error(`\n✗ Doctorow Gate failed on: ${doctorowResult.failedCheck}`);
          console.error("  Address the concern and try again, or use --skip-doctorow to bypass.");
          process.exit(1);
        }

        if (doctorowResult.skipped) {
          console.warn("\n⚠ Doctorow Gate skipped - consider reviewing before production use");
        } else {
          console.log("\n✓ Doctorow Gate passed");
        }
      }
    }

    // Code Review Gate (optional, activated by --review-required)
    if (options.reviewRequired && !options.force) {
      const branchName = `feat/${featureId}-${feature.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      const reviewStatus = checkPRReviewStatus(branchName);

      if (!reviewStatus) {
        console.warn("⚠️  No open PR found for review gate check (branch: " + branchName + ")");
        console.warn("   Skipping review gate — no PR to check");
      } else if (!reviewStatus.approved) {
        console.error(`\n✗ Code review gate failed for PR #${reviewStatus.prNumber}`);
        console.error(`  ${reviewStatus.reviewCount} review(s) found, none approved`);
        console.error("  The PR must be approved before completing the feature.");
        console.error("  Use --force to bypass the review gate.");
        process.exit(1);
      } else {
        console.log(`\n✓ Code review approved (PR #${reviewStatus.prNumber})`);
      }
    }

    // Mark as complete
    updateFeaturePhase(featureId, "implement");
    updateFeatureStatus(featureId, "complete");

    const stats = getStats();

    console.log(`✓ Marked ${featureId} as complete`);
    console.log(`\nProgress: ${stats.complete}/${stats.total} features (${stats.percentComplete}%)`);

    // Remind to commit changes
    console.log(`\n📝 Don't forget to commit your changes:`);
    console.log(`   git add -A && git commit -m "feat(${featureId}): ${feature.name}"`);

    if (stats.complete < stats.total) {
      console.log(`\nNext: Run 'specflow next' for the next feature.`);
    } else {
      console.log(`\n🎉 All features complete!`);
    }
  } finally {
    closeDatabase();
  }
}
