/**
 * Contrib Prep Command
 * Prepare code for contribution to shared repositories
 *
 * Implements the tag-before-contrib pattern with:
 * - File inventory generation
 * - Sanitization scanning (gitleaks + custom patterns)
 * - Clean branch extraction from tag
 * - Verification of extracted contribution
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
} from "../lib/database";
import {
  getContribState,
  createContribState,
  generateInventory,
  runSanitization,
  runExtraction,
  runVerification,
  runContribWorkflow,
  interactiveApprover,
} from "../lib/contrib-prep";

// =============================================================================
// Types
// =============================================================================

export interface ContribPrepOptions {
  /** Generate file inventory only */
  inventory?: boolean;
  /** Run sanitization scan only */
  sanitize?: boolean;
  /** Extract to contrib branch */
  extract?: boolean;
  /** Verify contrib branch */
  verify?: boolean;
  /** Base branch for contrib (default: main) */
  base?: string;
  /** Custom tag name */
  tag?: string;
  /** Show what would happen without making changes */
  dryRun?: boolean;
  /** Skip confirmation prompts (NOT gates) */
  yes?: boolean;
}

// =============================================================================
// Command
// =============================================================================

/**
 * Execute the contrib-prep command
 */
export async function contribPrepCommand(
  featureId: string,
  options: ContribPrepOptions = {}
): Promise<void> {
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

    // Get or create contrib state
    let state = getContribState(featureId);
    if (!state) {
      state = createContribState(featureId, options.base ?? "main");
      console.log(`Initialized contrib-prep for ${featureId}`);
    }

    // Route to specific step or full workflow
    if (options.inventory) {
      const result = generateInventory(projectPath, featureId, options.base ?? "main");
      console.log(`Inventory generated for ${featureId}: ${feature.name}`);
      console.log(`  Included: ${result.included}`);
      console.log(`  Excluded: ${result.excluded}`);
      console.log(`  Review:   ${result.review}`);
      console.log(`  Total:    ${result.entries.length}`);
      console.log(`  Registry: ${result.registryPath}`);
    } else if (options.sanitize) {
      // Run inventory first to get included files
      const inventory = generateInventory(projectPath, featureId, options.base ?? "main");
      const includedFiles = inventory.entries
        .filter((e) => e.classification === "include")
        .map((e) => e.file);

      const report = runSanitization(projectPath, featureId, includedFiles, {
        skipGitleaks: false,
      });

      console.log(`Sanitization scan for ${featureId}: ${feature.name}`);
      console.log(`  Pass: ${report.pass}`);
      console.log(`  Gitleaks findings: ${report.gitleaksFindings}`);
      console.log(`  Custom findings: ${report.customFindings}`);
      console.log(`  Total findings: ${report.findings.length}`);
      if (report.findings.length > 0) {
        console.log(`  Findings:`);
        for (const f of report.findings) {
          console.log(`    - ${f.file}:${f.line} [${f.pattern}] ${f.suggestion}`);
        }
      }
    } else if (options.extract) {
      // Run inventory to get included files
      const inventory = generateInventory(projectPath, featureId, options.base ?? "main");
      const includedFiles = inventory.entries
        .filter((e) => e.classification === "include")
        .map((e) => e.file);

      const result = runExtraction(projectPath, featureId, includedFiles, {
        baseBranch: options.base ?? "main",
        tagName: options.tag,
        dryRun: options.dryRun,
      });

      console.log(`Extraction complete for ${featureId}: ${feature.name}`);
      console.log(`  Tag: ${result.tagName}`);
      console.log(`  Tag hash: ${result.tagHash}`);
      console.log(`  Branch: ${result.contribBranch}`);
      console.log(`  Files extracted: ${result.filesExtracted}`);
      console.log(`  Returned to: ${result.originalBranch}`);
      if (options.dryRun) {
        console.log(`  Mode: dry-run (no changes made)`);
      }
    } else if (options.verify) {
      // Need contrib branch and expected files
      const contribBranch = state.contribBranch ?? `contrib/${featureId}`;
      const inventory = generateInventory(projectPath, featureId, options.base ?? "main");
      const expectedFiles = inventory.entries
        .filter((e) => e.classification === "include")
        .map((e) => e.file);

      const report = runVerification(
        projectPath,
        featureId,
        contribBranch,
        expectedFiles,
        { skipTests: true, skipSanitize: false }
      );

      console.log(`Verification for ${featureId}: ${feature.name}`);
      console.log(`  Pass: ${report.pass}`);
      console.log(`  Checks:`);
      for (const check of report.checks) {
        console.log(`    ${check.pass ? "PASS" : "FAIL"}: ${check.name} — ${check.details.split("\n")[0]}`);
      }
    } else {
      // Full workflow with gates
      console.log(`[contrib-prep] Full workflow for ${featureId} (${feature.name})`);
      console.log(`  Current gate: ${state.gate}/5`);
      console.log(`  Base branch: ${options.base ?? state.baseBranch}`);
      if (options.dryRun) {
        console.log(`  Mode: dry-run`);
      }

      const result = await runContribWorkflow(projectPath, featureId, {
        baseBranch: options.base ?? state.baseBranch,
        tagName: options.tag,
        dryRun: options.dryRun,
        approver: interactiveApprover,
      });

      if (!result.completed) {
        console.log(`\n[contrib-prep] Stopped at gate ${result.stoppedAtGate}/5`);
        console.log(`  Run 'specflow contrib-prep ${featureId}' to resume.`);
      }
    }
  } finally {
    closeDatabase();
  }
}
