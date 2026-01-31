/**
 * Contrib Prep Workflow Orchestrator
 * Chains inventory → sanitize → extract → verify with gates between phases
 *
 * Supports resume from any gate (reads state.gate to skip completed phases).
 * Gates are mandatory human checkpoints — --yes skips confirmations but NOT gates.
 * For testing, inject a GateApprover function.
 */

import {
  getContribState,
  createContribState,
  updateContribGate,
} from "./state";
import { generateInventory } from "./inventory";
import { runSanitization } from "./sanitize";
import { runExtraction } from "./extract";
import { runVerification } from "./verify";
import {
  interactiveApprover,
  buildInventoryGateContext,
  buildSanitizationGateContext,
  buildPreExtractionGateContext,
  buildPostExtractionGateContext,
  buildVerificationGateContext,
} from "./gates";
import type { GateApprover } from "./gates";
import type { ContribPrepState } from "./state";

// =============================================================================
// Types
// =============================================================================

export interface WorkflowOptions {
  baseBranch?: string;
  tagName?: string;
  dryRun?: boolean;
  approver?: GateApprover;
}

export interface WorkflowResult {
  completed: boolean;
  stoppedAtGate: number | null;
  featureId: string;
  finalGate: number;
  tagName: string | null;
  contribBranch: string | null;
  verificationPass: boolean | null;
}

// =============================================================================
// Workflow Orchestrator
// =============================================================================

/**
 * Run the full contrib-prep workflow with gates.
 * Resumes from the current gate in state.
 */
export async function runContribWorkflow(
  projectPath: string,
  featureId: string,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const baseBranch = options.baseBranch ?? "main";
  const approver = options.approver ?? interactiveApprover;

  // Get or create state
  let state = getContribState(featureId);
  if (!state) {
    state = createContribState(featureId, baseBranch);
  }

  // Phase 1: Inventory (gate 0 → gate 1)
  if (state.gate < 1) {
    console.log("\n[1/4] Running inventory...");
    const inventory = generateInventory(projectPath, featureId, baseBranch);

    console.log(`  Included: ${inventory.included}`);
    console.log(`  Excluded: ${inventory.excluded}`);
    console.log(`  Review:   ${inventory.review}`);
    console.log(`  Registry: ${inventory.registryPath}`);

    const ctx = buildInventoryGateContext(
      inventory.included,
      inventory.excluded,
      inventory.review,
      inventory.registryPath
    );

    const approved = await approver(1, ctx);
    if (!approved) {
      return buildResult(featureId, false, 1, state);
    }

    updateContribGate(featureId, 1);
    state = getContribState(featureId)!;
  }

  // Phase 2: Sanitization (gate 1 → gate 2)
  if (state.gate < 2) {
    console.log("\n[2/4] Running sanitization...");
    const inventory = generateInventory(projectPath, featureId, baseBranch);
    const includedFiles = inventory.entries
      .filter((e) => e.classification === "include")
      .map((e) => e.file);

    const report = runSanitization(projectPath, featureId, includedFiles, {
      skipGitleaks: options.dryRun ?? false,
    });

    console.log(`  Pass: ${report.pass}`);
    console.log(`  Findings: ${report.findings.length}`);
    if (report.findings.length > 0) {
      for (const f of report.findings) {
        console.log(`    - ${f.file}:${f.line} [${f.pattern}]`);
      }
    }

    const ctx = buildSanitizationGateContext(report.pass, report.findings.length);

    const approved = await approver(2, ctx);
    if (!approved) {
      return buildResult(featureId, false, 2, state);
    }

    // Gate 2 is already advanced by runSanitization, but ensure it's set
    if (state.gate < 2) {
      updateContribGate(featureId, 2);
    }
    state = getContribState(featureId)!;
  }

  // Phase 3: Extraction (gate 2 → gate 4, with pre-extraction gate 3)
  if (state.gate < 4) {
    const inventory = generateInventory(projectPath, featureId, baseBranch);
    const includedFiles = inventory.entries
      .filter((e) => e.classification === "include")
      .map((e) => e.file);

    const tagName = options.tagName ?? `contrib/${featureId}/v1`;

    // Gate 3: Pre-extraction approval
    if (state.gate < 3) {
      const ctx = buildPreExtractionGateContext(
        featureId,
        tagName,
        baseBranch,
        includedFiles.length
      );

      const approved = await approver(3, ctx);
      if (!approved) {
        return buildResult(featureId, false, 3, state);
      }

      updateContribGate(featureId, 3);
      state = getContribState(featureId)!;
    }

    // Run extraction
    console.log("\n[3/4] Running extraction...");
    const result = runExtraction(projectPath, featureId, includedFiles, {
      baseBranch,
      tagName: options.tagName,
      dryRun: options.dryRun,
    });

    console.log(`  Tag: ${result.tagName}`);
    console.log(`  Branch: ${result.contribBranch}`);
    console.log(`  Files: ${result.filesExtracted}`);
    if (options.dryRun) {
      console.log(`  Mode: dry-run`);
    }

    // Gate 4: Post-extraction review
    const postCtx = buildPostExtractionGateContext(
      result.tagName,
      result.contribBranch,
      result.filesExtracted
    );

    // Refresh state after extraction (runExtraction updates DB)
    state = getContribState(featureId)!;

    const approved = await approver(4, postCtx);
    if (!approved) {
      return buildResult(featureId, false, 4, state);
    }

    // Gate 4 is already advanced by runExtraction, but ensure it's set
    if (state.gate < 4) {
      updateContribGate(featureId, 4);
    }
    state = getContribState(featureId)!;
  }

  // Phase 4: Verification (gate 4 → gate 5)
  // Skip verification in dry-run mode since no real branch was created
  if (state.gate < 5 && !options.dryRun) {
    console.log("\n[4/4] Running verification...");
    const contribBranch = state.contribBranch ?? `contrib/${featureId}`;
    const inventory = generateInventory(projectPath, featureId, baseBranch);
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

    console.log(`  Pass: ${report.pass}`);
    for (const check of report.checks) {
      console.log(`    ${check.pass ? "PASS" : "FAIL"}: ${check.name}`);
    }

    const checkResults = report.checks.map(
      (c) => `${c.pass ? "PASS" : "FAIL"}: ${c.name} — ${c.details.split("\n")[0]}`
    );

    const ctx = buildVerificationGateContext(report.pass, checkResults);

    const approved = await approver(5, ctx);
    if (!approved) {
      return buildResult(featureId, false, 5, state);
    }

    // Gate 5 is already advanced by runVerification on pass
    if (state.gate < 5) {
      updateContribGate(featureId, 5);
    }
    state = getContribState(featureId)!;
  } else if (options.dryRun && state.gate < 5) {
    console.log("\n[4/4] Verification skipped (dry-run mode)");
  }

  // Workflow complete
  console.log("\n[contrib-prep] Workflow complete!");
  console.log(`  Feature: ${featureId}`);
  console.log(`  Tag: ${state.tagName}`);
  console.log(`  Branch: ${state.contribBranch}`);
  console.log(`  Verification: ${state.verificationPass ? "PASS" : "FAIL"}`);

  return buildResult(featureId, true, null, state);
}

// =============================================================================
// Helpers
// =============================================================================

function buildResult(
  featureId: string,
  completed: boolean,
  stoppedAtGate: number | null,
  state: ContribPrepState
): WorkflowResult {
  return {
    completed,
    stoppedAtGate,
    featureId,
    finalGate: state.gate,
    tagName: state.tagName,
    contribBranch: state.contribBranch,
    verificationPass: state.verificationPass,
  };
}
