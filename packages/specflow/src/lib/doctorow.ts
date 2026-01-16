/**
 * Doctorow Gate Module
 * Implementation of Cory Doctorow's pre-completion checklist
 *
 * The Doctorow Gate ensures that before marking a feature complete,
 * the developer has considered failure modes, assumptions, rollback
 * strategies, and technical debt.
 */

import { createInterface } from "readline";
import { existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";

// =============================================================================
// Types
// =============================================================================

/**
 * A single check in the Doctorow Gate
 */
export interface DoctorowCheck {
  /** Unique identifier for the check */
  id: string;
  /** Short name for display */
  name: string;
  /** Main question to ask the user */
  question: string;
  /** Explanatory prompt with more context */
  prompt: string;
}

/**
 * Result of a single Doctorow check
 */
export interface DoctorowCheckResult {
  /** ID of the check */
  checkId: string;
  /** Whether the check was confirmed */
  confirmed: boolean;
  /** Reason for skipping (if skipped) */
  skipReason: string | null;
  /** When the check was performed */
  timestamp: Date;
}

/**
 * Overall result of the Doctorow Gate
 */
export interface DoctorowResult {
  /** Whether all checks passed */
  passed: boolean;
  /** Whether the gate was skipped entirely */
  skipped: boolean;
  /** ID of the check that failed (if any) */
  failedCheck?: string;
  /** Individual check results */
  results: DoctorowCheckResult[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * The four Doctorow checks
 * Based on Cory Doctorow's "How to Do Things" approach
 */
export const DOCTOROW_CHECKS: DoctorowCheck[] = [
  {
    id: "failure_test",
    name: "Failure Test",
    question: "Have you tested what happens when this feature fails?",
    prompt: `Consider: What happens if the API is down? Database unavailable?
User provides invalid input? Network times out? Have you handled these gracefully?`,
  },
  {
    id: "assumption_test",
    name: "Assumption Test",
    question: "Have you validated your key assumptions?",
    prompt: `Consider: What assumptions did you make about user behavior, data format,
system load, or third-party services? Are they documented and tested?`,
  },
  {
    id: "rollback_test",
    name: "Rollback Test",
    question: "Can this feature be safely rolled back?",
    prompt: `Consider: If this deployment causes issues, can you revert without data loss?
Are database migrations reversible? Are there breaking API changes?`,
  },
  {
    id: "debt_recorded",
    name: "Technical Debt",
    question: "Have you documented any technical debt introduced?",
    prompt: `Consider: Are there shortcuts taken for time? TODOs left in code?
Areas needing future refactoring? Document them for future reference.`,
  },
];

/**
 * Valid responses for Doctorow checks
 */
export const DOCTOROW_RESPONSES = {
  YES: ["y", "yes"],
  NO: ["n", "no"],
  SKIP: ["s", "skip"],
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse user response to a Doctorow check
 */
export function parseResponse(input: string): "yes" | "no" | "skip" | null {
  const normalized = input.trim().toLowerCase();

  if ((DOCTOROW_RESPONSES.YES as readonly string[]).includes(normalized)) {
    return "yes";
  }
  if ((DOCTOROW_RESPONSES.NO as readonly string[]).includes(normalized)) {
    return "no";
  }
  if ((DOCTOROW_RESPONSES.SKIP as readonly string[]).includes(normalized)) {
    return "skip";
  }

  return null;
}

/**
 * Format a check result for display
 */
export function formatCheckResult(result: DoctorowCheckResult): string {
  const check = DOCTOROW_CHECKS.find(c => c.id === result.checkId);
  const name = check?.name ?? result.checkId;

  if (result.confirmed) {
    return `✓ ${name}: Confirmed`;
  }
  if (result.skipReason) {
    return `⊘ ${name}: Skipped - ${result.skipReason}`;
  }
  return `✗ ${name}: Not confirmed`;
}

/**
 * Format verification entry for verify.md
 */
export function formatVerifyEntry(results: DoctorowCheckResult[]): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  lines.push(`## Doctorow Gate Verification - ${timestamp}`);
  lines.push("");

  for (const result of results) {
    const check = DOCTOROW_CHECKS.find(c => c.id === result.checkId);
    const name = check?.name ?? result.checkId;

    if (result.confirmed) {
      lines.push(`- [x] **${name}**: Confirmed`);
    } else if (result.skipReason) {
      lines.push(`- [ ] **${name}**: Skipped`);
      lines.push(`  - Reason: ${result.skipReason}`);
    } else {
      lines.push(`- [ ] **${name}**: Not confirmed`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// =============================================================================
// Gate Logic
// =============================================================================

/**
 * Prompt user for a single Doctorow check
 * @returns Promise resolving to the check result
 */
async function promptForCheck(
  check: DoctorowCheck,
  rl: ReturnType<typeof createInterface>
): Promise<DoctorowCheckResult> {
  return new Promise((resolve) => {
    console.log(`\n📋 ${check.name}`);
    console.log(`   ${check.prompt}`);
    console.log("");

    const askQuestion = () => {
      rl.question(`   ${check.question} [Y/n/s(kip)] `, (answer) => {
        const response = parseResponse(answer);

        if (response === null) {
          console.log("   Invalid response. Please enter Y, N, or S.");
          askQuestion();
          return;
        }

        if (response === "yes") {
          resolve({
            checkId: check.id,
            confirmed: true,
            skipReason: null,
            timestamp: new Date(),
          });
        } else if (response === "no") {
          resolve({
            checkId: check.id,
            confirmed: false,
            skipReason: null,
            timestamp: new Date(),
          });
        } else {
          // Skip - need to ask for reason
          rl.question("   Reason for skipping: ", (reason) => {
            resolve({
              checkId: check.id,
              confirmed: false,
              skipReason: reason.trim() || "No reason provided",
              timestamp: new Date(),
            });
          });
        }
      });
    };

    askQuestion();
  });
}

/**
 * Run the full Doctorow Gate
 * @param featureId - Feature being completed
 * @param specPath - Path to feature spec directory
 * @param skipFlag - If true, skip the entire gate
 */
export async function runDoctorowGate(
  featureId: string,
  specPath: string,
  skipFlag: boolean = false
): Promise<DoctorowResult> {
  // Handle skip flag
  if (skipFlag) {
    console.log("\n⚠ Doctorow Gate skipped via --skip-doctorow flag");
    return {
      passed: true,
      skipped: true,
      results: [],
    };
  }

  console.log(`\n🔍 Running Doctorow Gate for ${featureId}`);
  console.log("─".repeat(50));
  console.log("The Doctorow Gate ensures you've considered failure modes,");
  console.log("validated assumptions, planned for rollback, and documented debt.");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const results: DoctorowCheckResult[] = [];
  let failedCheck: string | undefined;

  try {
    for (const check of DOCTOROW_CHECKS) {
      const result = await promptForCheck(check, rl);
      results.push(result);

      // If user said "no", the gate fails
      if (!result.confirmed && !result.skipReason) {
        failedCheck = check.id;
        break;
      }
    }
  } finally {
    rl.close();
  }

  const passed = !failedCheck;

  // Display summary
  console.log("\n─".repeat(50));
  console.log("Doctorow Gate Results:");
  for (const result of results) {
    console.log(`   ${formatCheckResult(result)}`);
  }

  // Append to verify.md if there are skips
  const skippedResults = results.filter(r => r.skipReason);
  if (skippedResults.length > 0) {
    appendToVerifyMd(specPath, results);
    console.log(`\n📝 Skipped checks recorded in ${join(specPath, "verify.md")}`);
  }

  return {
    passed,
    skipped: false,
    failedCheck,
    results,
  };
}

/**
 * Append verification results to verify.md
 */
export function appendToVerifyMd(specPath: string, results: DoctorowCheckResult[]): void {
  const verifyPath = join(specPath, "verify.md");

  let content = "";

  // If file exists, read existing content
  if (existsSync(verifyPath)) {
    content = readFileSync(verifyPath, "utf-8");
    if (!content.endsWith("\n")) {
      content += "\n";
    }
    content += "\n";
  } else {
    // Create new file with header
    content = `# Verification Log\n\nThis file tracks verification activities for the feature.\n\n`;
  }

  // Append new entry
  content += formatVerifyEntry(results);

  appendFileSync(verifyPath, formatVerifyEntry(results));
}

/**
 * Check if Doctorow Gate has been verified for a feature
 */
export function isDoctorowVerified(specPath: string): boolean {
  const verifyPath = join(specPath, "verify.md");

  if (!existsSync(verifyPath)) {
    return false;
  }

  const content = readFileSync(verifyPath, "utf-8");
  return content.includes("Doctorow Gate Verification");
}
