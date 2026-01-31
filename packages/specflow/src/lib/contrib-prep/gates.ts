/**
 * Contrib Prep Gate System
 * Interactive approval gates between workflow phases
 *
 * Gates are mandatory human checkpoints. --yes skips confirmations but NOT gates.
 * For testing, inject an approver function instead of readline.
 */

import * as readline from "readline";

// =============================================================================
// Types
// =============================================================================

export interface GateContext {
  title: string;
  summary: string;
  details?: string[];
}

/** Function that asks for approval and returns true/false */
export type GateApprover = (gateNum: number, context: GateContext) => Promise<boolean>;

// =============================================================================
// Gate Definitions
// =============================================================================

const GATE_TITLES: Record<number, string> = {
  1: "Inventory Review",
  2: "Sanitization Review",
  3: "Pre-Extraction Approval",
  4: "Extraction Review",
  5: "Final Verification",
};

/**
 * Get the title for a gate number
 */
export function getGateTitle(gateNum: number): string {
  return GATE_TITLES[gateNum] ?? `Gate ${gateNum}`;
}

// =============================================================================
// Interactive Approver (readline)
// =============================================================================

/**
 * Default interactive gate approver using readline.
 * Displays gate context and waits for 'yes' or 'no'.
 */
export async function interactiveApprover(
  gateNum: number,
  context: GateContext
): Promise<boolean> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  GATE ${gateNum}/5: ${context.title}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n${context.summary}`);

  if (context.details && context.details.length > 0) {
    console.log("");
    for (const detail of context.details) {
      console.log(`  ${detail}`);
    }
  }

  console.log(`\nType 'yes' to proceed, 'no' to abort:`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question("> ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

// =============================================================================
// Auto Approver (for testing)
// =============================================================================

/**
 * Create an auto-approver that approves or rejects all gates.
 * Useful for testing.
 */
export function createAutoApprover(approve: boolean): GateApprover {
  return async (_gateNum: number, _context: GateContext): Promise<boolean> => {
    return approve;
  };
}

/**
 * Create an approver that rejects at a specific gate.
 * Approves all others. Useful for testing gate rejection.
 */
export function createRejectAtGateApprover(rejectAt: number): GateApprover {
  return async (gateNum: number, _context: GateContext): Promise<boolean> => {
    return gateNum !== rejectAt;
  };
}

// =============================================================================
// Gate Context Builders
// =============================================================================

/**
 * Build context for Gate 1: Inventory Review
 */
export function buildInventoryGateContext(
  included: number,
  excluded: number,
  review: number,
  registryPath: string
): GateContext {
  return {
    title: getGateTitle(1),
    summary: "Review the file inventory before proceeding to sanitization.",
    details: [
      `Included files: ${included}`,
      `Excluded files: ${excluded}`,
      `Files needing review: ${review}`,
      `Registry: ${registryPath}`,
    ],
  };
}

/**
 * Build context for Gate 2: Sanitization Review
 */
export function buildSanitizationGateContext(
  pass: boolean,
  findings: number
): GateContext {
  return {
    title: getGateTitle(2),
    summary: pass
      ? "Sanitization passed. No secrets or PII found."
      : `Sanitization found ${findings} issue(s). Review and fix before proceeding.`,
    details: [
      `Pass: ${pass}`,
      `Findings: ${findings}`,
    ],
  };
}

/**
 * Build context for Gate 3: Pre-Extraction
 */
export function buildPreExtractionGateContext(
  featureId: string,
  tagName: string,
  baseBranch: string,
  fileCount: number
): GateContext {
  return {
    title: getGateTitle(3),
    summary: "About to create an annotated tag and extract files to a clean branch.",
    details: [
      `Feature: ${featureId}`,
      `Tag: ${tagName}`,
      `Base branch: ${baseBranch}`,
      `Files to extract: ${fileCount}`,
    ],
  };
}

/**
 * Build context for Gate 4: Post-Extraction
 */
export function buildPostExtractionGateContext(
  tagName: string,
  contribBranch: string,
  filesExtracted: number
): GateContext {
  return {
    title: getGateTitle(4),
    summary: "Extraction complete. Review the contrib branch before verification.",
    details: [
      `Tag: ${tagName}`,
      `Branch: ${contribBranch}`,
      `Files extracted: ${filesExtracted}`,
    ],
  };
}

/**
 * Build context for Gate 5: Final Verification
 */
export function buildVerificationGateContext(
  pass: boolean,
  checkResults: string[]
): GateContext {
  return {
    title: getGateTitle(5),
    summary: pass
      ? "All verification checks passed. Ready to push."
      : "Some verification checks failed. Review before proceeding.",
    details: checkResults,
  };
}
