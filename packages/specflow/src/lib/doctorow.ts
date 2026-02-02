/**
 * Doctorow Gate Module
 * Implementation of Cory Doctorow's pre-completion checklist
 *
 * The Doctorow Gate ensures that before marking a feature complete,
 * the developer has considered failure modes, assumptions, rollback
 * strategies, and technical debt.
 */

import { createInterface } from "readline";
import { existsSync, readFileSync, appendFileSync, readdirSync } from "fs";
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
 * @param evaluator - Optional tag like "[AI-evaluated]" to append to confirmed entries
 */
export function formatVerifyEntry(results: DoctorowCheckResult[], evaluator?: string): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  lines.push(`## Doctorow Gate Verification - ${timestamp}`);
  lines.push("");

  for (const result of results) {
    const check = DOCTOROW_CHECKS.find(c => c.id === result.checkId);
    const name = check?.name ?? result.checkId;

    if (result.confirmed) {
      const tag = evaluator ? ` ${evaluator}` : "";
      lines.push(`- [x] **${name}**: Confirmed${tag}`);
      if (result.skipReason) {
        // In AI mode, skipReason holds the reasoning
        lines.push(`  - Reasoning: ${result.skipReason}`);
      }
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
// Headless (AI) Evaluation
// =============================================================================

/**
 * Extract JSON from an LLM response.
 * Handles:
 * - Claude --output-format json wrapper (extracts from "result" field)
 * - Markdown code blocks (```json ... ```)
 * - Raw JSON strings
 * - JSON embedded in surrounding text
 */
export function extractJsonFromResponse(response: string): any | null {
  let text = response;

  // Check if this is Claude --output-format json wrapper
  try {
    const wrapper = JSON.parse(response);
    if (wrapper.type === "result" && wrapper.result) {
      text = wrapper.result;
    }
  } catch {
    // Not a JSON wrapper, use response as-is
  }

  // Try markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue to other methods
    }
  }

  // Try to find JSON object in response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Invalid JSON
    }
  }

  return null;
}

/**
 * Gather feature artifacts for AI evaluation context.
 * Reads spec.md, plan.md, tasks.md, verify.md and lists src/ filenames.
 */
export function gatherArtifacts(specPath: string): string {
  const parts: string[] = [];

  const artifactFiles = ["spec.md", "plan.md", "tasks.md", "verify.md"];
  for (const file of artifactFiles) {
    const filePath = join(specPath, file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      parts.push(`--- ${file} ---\n${content}`);
    }
  }

  // List src/ files (just names, not content)
  const srcDir = join(specPath, "..", "..", "..", "src");
  if (existsSync(srcDir)) {
    try {
      const files = listFilesRecursive(srcDir);
      if (files.length > 0) {
        parts.push(`--- src/ files ---\n${files.join("\n")}`);
      }
    } catch {
      // Ignore errors reading src directory
    }
  }

  return parts.join("\n\n");
}

/**
 * Recursively list files in a directory (relative paths).
 */
function listFilesRecursive(dir: string, prefix: string = ""): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...listFilesRecursive(join(dir, entry.name), relative));
      } else {
        results.push(relative);
      }
    }
  } catch {
    // Ignore permission errors
  }
  return results;
}

/**
 * Evaluate a single Doctorow check using AI (claude -p).
 * On failure, returns confirmed=true to avoid blocking the pipeline.
 */
/**
 * Default model for headless Doctorow evaluation.
 * Opus provides deep reasoning for thorough quality checks.
 * Override via SPECFLOW_DOCTOROW_MODEL env var.
 *
 * Recommended models:
 * - claude-haiku-4-5-20251001: Fast/cheap, may give shallow evaluations
 * - claude-sonnet-4-20250514: Balanced reasoning, lower cost
 * - claude-opus-4-5-20251101: Deep reasoning (default)
 */
const DEFAULT_DOCTOROW_MODEL = "claude-opus-4-5-20251101";

export async function evaluateCheckWithAI(
  check: DoctorowCheck,
  artifacts: string
): Promise<DoctorowCheckResult> {
  const model = process.env.SPECFLOW_DOCTOROW_MODEL || DEFAULT_DOCTOROW_MODEL;
  const systemPrompt =
    "You are a code quality reviewer evaluating a feature completion check. " +
    "Analyze the provided feature artifacts carefully. " +
    'Return ONLY valid JSON: {"pass": true, "reasoning": "one sentence explanation"}';

  const userPrompt =
    `Check: ${check.question}\n\nContext: ${check.prompt}\n\nFeature Artifacts:\n${artifacts}`;

  try {
    const proc = Bun.spawn(
      ["claude", "-p", "--output-format", "json", "--model", model, "--system-prompt", systemPrompt, userPrompt],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
      }
    );

    // 30 second timeout
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 30000);
    });

    const resultPromise = (async () => {
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) return null;

      const extracted = extractJsonFromResponse(output);
      if (!extracted || typeof extracted.pass !== "boolean") return null;

      return {
        checkId: check.id,
        confirmed: extracted.pass,
        skipReason: extracted.reasoning || null,
        timestamp: new Date(),
      };
    })();

    const result = await Promise.race([resultPromise, timeoutPromise]);

    if (result) return result;
  } catch {
    // Fall through to default
  }

  // On any AI failure, pass by default
  return {
    checkId: check.id,
    confirmed: true,
    skipReason: "AI evaluation unavailable — passed by default",
    timestamp: new Date(),
  };
}

/**
 * Run the Doctorow Gate in headless mode using AI evaluation.
 * Iterates through all checks and evaluates them with claude -p.
 */
export async function runDoctorowGateHeadless(
  featureId: string,
  specPath: string
): Promise<DoctorowResult> {
  const artifacts = gatherArtifacts(specPath);
  const results: DoctorowCheckResult[] = [];

  for (const check of DOCTOROW_CHECKS) {
    console.log(`  Evaluating: ${check.name}...`);
    const result = await evaluateCheckWithAI(check, artifacts);
    results.push(result);
    const status = result.confirmed ? "PASS" : "FAIL";
    console.log(`  ${status}: ${check.name} - ${result.skipReason || "confirmed"}`);
  }

  const failedCheck = results.find(r => !r.confirmed);
  const passed = !failedCheck;

  // Append AI results to verify.md
  appendToVerifyMd(specPath, results, "[AI-evaluated]");

  return {
    passed,
    skipped: false,
    failedCheck: failedCheck?.checkId,
    results,
  };
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

  // Detect headless mode
  const isHeadless = !process.stdin.isTTY || process.env.SPECFLOW_HEADLESS === "true";

  if (isHeadless) {
    const model = process.env.SPECFLOW_DOCTOROW_MODEL || DEFAULT_DOCTOROW_MODEL;
    console.log(`\n🤖 Running Doctorow Gate in headless mode (AI: ${model})...`);
    return runDoctorowGateHeadless(featureId, specPath);
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
export function appendToVerifyMd(specPath: string, results: DoctorowCheckResult[], evaluator?: string): void {
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
  content += formatVerifyEntry(results, evaluator);

  appendFileSync(verifyPath, formatVerifyEntry(results, evaluator));
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
