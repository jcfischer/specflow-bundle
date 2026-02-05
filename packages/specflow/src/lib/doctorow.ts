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
import { spawnSync } from "child_process";

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
  /** How the evaluation was performed */
  evaluationMethod?: EvaluationMethod;
}

/**
 * How a Doctorow check was evaluated
 */
export type EvaluationMethod = "human" | "ai" | "static";

/**
 * Result from a programmatic evaluator
 */
export interface EvaluationResult {
  passed: boolean;
  reasoning: string;
}

/**
 * Interface for programmatic Doctorow check evaluators
 */
export interface DoctorowEvaluator {
  /** Name of the evaluator for tagging results */
  readonly method: EvaluationMethod;
  /** Evaluate a single Doctorow check against feature artifacts */
  evaluate(check: DoctorowCheck, specPath: string): Promise<EvaluationResult>;
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
// Headless Detection
// =============================================================================

/**
 * Detect whether we're running in a headless (non-interactive) environment.
 * Returns true if:
 * - SPECFLOW_HEADLESS=true environment variable is set
 * - process.stdin.isTTY is false (piped input, CI, background agent)
 * - An explicit headless flag was passed
 */
export function isHeadless(explicitFlag?: boolean): boolean {
  if (explicitFlag === true) return true;
  if (process.env.SPECFLOW_HEADLESS === "true") return true;
  if (process.env.SPECFLOW_HEADLESS === "1") return true;
  if (!process.stdin.isTTY) return true;
  return false;
}

// =============================================================================
// Static Evaluator
// =============================================================================

/**
 * Patterns to look for in feature artifacts for each Doctorow check.
 * Used by the static evaluator to determine pass/fail without AI.
 */
const STATIC_PATTERNS: Record<string, { files: string[]; patterns: RegExp[] }> = {
  failure_test: {
    files: ["spec.md", "plan.md", "verify.md"],
    patterns: [
      /error[\s_-]?handl/i,
      /try[\s]*\{|catch[\s]*\(/i,
      /fail(ure|s|ed|ing)?[\s_-]?(mode|case|scenario|test|handling)/i,
      /edge[\s_-]?case/i,
      /timeout/i,
      /retry/i,
      /graceful/i,
    ],
  },
  assumption_test: {
    files: ["spec.md", "plan.md"],
    patterns: [
      /##\s*assumption/i,
      /assumption/i,
      /constrain/i,
      /prerequisite/i,
      /depend(s|ency|encies)/i,
      /require(s|ment|ments)/i,
    ],
  },
  rollback_test: {
    files: ["spec.md", "plan.md", "verify.md"],
    patterns: [
      /rollback/i,
      /revert/i,
      /undo/i,
      /backward[\s_-]?compat/i,
      /migration[\s_-]?(revers|down|rollback)/i,
      /feature[\s_-]?flag/i,
    ],
  },
  debt_recorded: {
    files: ["spec.md", "plan.md", "tasks.md"],
    patterns: [
      /TODO/,
      /FIXME/,
      /HACK/,
      /technical[\s_-]?debt/i,
      /future[\s_-]?(work|improvement|refactor)/i,
      /known[\s_-]?(issue|limitation)/i,
      /shortcut/i,
    ],
  },
};

/**
 * Static evaluator that pattern-matches artifacts for evidence.
 * No external dependencies required — works offline.
 */
export class StaticDoctorowEvaluator implements DoctorowEvaluator {
  readonly method: EvaluationMethod = "static";

  async evaluate(check: DoctorowCheck, specPath: string): Promise<EvaluationResult> {
    const config = STATIC_PATTERNS[check.id];
    if (!config) {
      return { passed: false, reasoning: `No static patterns configured for check: ${check.id}` };
    }

    const matchedPatterns: string[] = [];

    for (const file of config.files) {
      const filePath = join(specPath, file);
      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf-8");
      for (const pattern of config.patterns) {
        if (pattern.test(content)) {
          matchedPatterns.push(`${file}: matched ${pattern.source}`);
        }
      }
    }

    if (matchedPatterns.length >= 2) {
      return {
        passed: true,
        reasoning: `Found ${matchedPatterns.length} evidence patterns: ${matchedPatterns.slice(0, 3).join("; ")}`,
      };
    }

    if (matchedPatterns.length === 1) {
      return {
        passed: false,
        reasoning: `Only 1 evidence pattern found (need 2+): ${matchedPatterns[0]}`,
      };
    }

    return {
      passed: false,
      reasoning: `No evidence patterns found in artifacts for "${check.name}"`,
    };
  }
}

// =============================================================================
// AI Evaluator
// =============================================================================

/**
 * AI evaluator that uses a subprocess (e.g., `claude -p`) to evaluate
 * each Doctorow check against the actual feature artifacts.
 */
export class AiDoctorowEvaluator implements DoctorowEvaluator {
  readonly method: EvaluationMethod = "ai";
  private command: string;
  private args: string[];

  constructor(command?: string) {
    const cmd = command ?? process.env.SPECFLOW_AI_COMMAND ?? "claude -p";
    const parts = cmd.split(/\s+/);
    this.command = parts[0];
    this.args = parts.slice(1);
  }

  async evaluate(check: DoctorowCheck, specPath: string): Promise<EvaluationResult> {
    // Gather artifact contents
    const artifacts: string[] = [];
    for (const file of ["spec.md", "plan.md", "tasks.md", "verify.md"]) {
      const filePath = join(specPath, file);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        artifacts.push(`--- ${file} ---\n${content}`);
      }
    }

    if (artifacts.length === 0) {
      return { passed: false, reasoning: "No artifacts found to evaluate" };
    }

    const prompt = [
      `You are evaluating a Doctorow Gate check for a software feature.`,
      ``,
      `Check: ${check.name}`,
      `Question: ${check.question}`,
      `Context: ${check.prompt}`,
      ``,
      `Feature artifacts:`,
      artifacts.join("\n\n"),
      ``,
      `Based on the artifacts above, has this check been adequately addressed?`,
      `Respond with EXACTLY one line: PASS or FAIL, followed by a brief reason.`,
      `Example: PASS - Error handling tests cover API failures, timeouts, and invalid input`,
      `Example: FAIL - No evidence of rollback strategy in any artifact`,
    ].join("\n");

    try {
      const result = spawnSync(this.command, [...this.args], {
        input: prompt,
        encoding: "utf-8",
        timeout: 30000,
      });

      if (result.status !== 0) {
        // Fallback to static evaluation if AI command fails
        return {
          passed: false,
          reasoning: `AI evaluator failed (exit ${result.status}), recommend using static evaluator`,
        };
      }

      const output = (result.stdout ?? "").trim();
      const passed = output.toUpperCase().startsWith("PASS");
      const reasoning = output.replace(/^(PASS|FAIL)\s*[-:]\s*/i, "").trim() || output;

      return { passed, reasoning };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        passed: false,
        reasoning: `AI evaluator error: ${msg}`,
      };
    }
  }
}

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
export function formatVerifyEntry(
  results: DoctorowCheckResult[],
  evaluationMethod?: EvaluationMethod
): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();
  const tag = evaluationMethod ? ` [${evaluationMethod}-evaluated]` : "";

  lines.push(`## Doctorow Gate Verification - ${timestamp}${tag}`);
  lines.push("");

  for (const result of results) {
    const check = DOCTOROW_CHECKS.find(c => c.id === result.checkId);
    const name = check?.name ?? result.checkId;

    if (result.confirmed) {
      const reasonSuffix = result.skipReason ? ` — ${result.skipReason}` : "";
      lines.push(`- [x] **${name}**: Confirmed${reasonSuffix}`);
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
 * Options for running the Doctorow Gate
 */
export interface DoctorowGateOptions {
  /** If true, skip the entire gate */
  skipFlag?: boolean;
  /** Explicit headless mode flag (auto-detected if not provided) */
  headless?: boolean;
  /** Evaluator to use in headless mode (defaults to static) */
  evaluator?: DoctorowEvaluator;
  /** AI command for AI evaluator (e.g., "claude -p") */
  aiCommand?: string;
}

/**
 * Run the full Doctorow Gate
 * @param featureId - Feature being completed
 * @param specPath - Path to feature spec directory
 * @param optionsOrSkipFlag - Options object, or legacy boolean skip flag
 */
export async function runDoctorowGate(
  featureId: string,
  specPath: string,
  optionsOrSkipFlag: DoctorowGateOptions | boolean = false
): Promise<DoctorowResult> {
  // Support legacy boolean skip flag
  const options: DoctorowGateOptions =
    typeof optionsOrSkipFlag === "boolean"
      ? { skipFlag: optionsOrSkipFlag }
      : optionsOrSkipFlag;

  // Handle skip flag
  if (options.skipFlag) {
    console.log("\n⚠ Doctorow Gate skipped via --skip-doctorow flag");
    return {
      passed: true,
      skipped: true,
      results: [],
    };
  }

  // Determine if headless mode should be used
  const headless = isHeadless(options.headless);

  if (headless) {
    return runHeadlessDoctorowGate(featureId, specPath, options);
  }

  return runInteractiveDoctorowGate(featureId, specPath);
}

/**
 * Run the Doctorow Gate in headless mode using a programmatic evaluator
 */
async function runHeadlessDoctorowGate(
  featureId: string,
  specPath: string,
  options: DoctorowGateOptions
): Promise<DoctorowResult> {
  // Select evaluator: explicit > AI (if command available) > static
  const evaluator = options.evaluator ?? new StaticDoctorowEvaluator();

  console.log(`\n🤖 Running Doctorow Gate for ${featureId} [headless, ${evaluator.method} evaluator]`);
  console.log("─".repeat(50));

  const results: DoctorowCheckResult[] = [];
  let failedCheck: string | undefined;

  for (const check of DOCTOROW_CHECKS) {
    const evaluation = await evaluator.evaluate(check, specPath);

    const result: DoctorowCheckResult = {
      checkId: check.id,
      confirmed: evaluation.passed,
      skipReason: evaluation.passed ? evaluation.reasoning : null,
      timestamp: new Date(),
    };

    results.push(result);

    const icon = evaluation.passed ? "✓" : "✗";
    console.log(`   ${icon} ${check.name}: ${evaluation.reasoning}`);

    if (!evaluation.passed && !failedCheck) {
      failedCheck = check.id;
      // In headless mode, continue evaluating all checks (don't stop early)
      // This gives the full picture for CI reports. Only record the first failure.
    }
  }

  const passed = !failedCheck;

  // Display summary
  console.log("─".repeat(50));
  console.log(`Doctorow Gate: ${passed ? "PASSED" : "FAILED"} [${evaluator.method}-evaluated]`);

  // Always append to verify.md in headless mode
  appendToVerifyMd(specPath, results, evaluator.method);
  console.log(`\n📝 Results recorded in ${join(specPath, "verify.md")}`);

  return {
    passed,
    skipped: false,
    failedCheck,
    results,
    evaluationMethod: evaluator.method,
  };
}

/**
 * Run the Doctorow Gate interactively (original behavior)
 */
async function runInteractiveDoctorowGate(
  featureId: string,
  specPath: string
): Promise<DoctorowResult> {
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
    appendToVerifyMd(specPath, results, "human");
    console.log(`\n📝 Skipped checks recorded in ${join(specPath, "verify.md")}`);
  }

  return {
    passed,
    skipped: false,
    failedCheck,
    results,
    evaluationMethod: "human",
  };
}

/**
 * Append verification results to verify.md
 */
export function appendToVerifyMd(
  specPath: string,
  results: DoctorowCheckResult[],
  evaluationMethod?: EvaluationMethod
): void {
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
  content += formatVerifyEntry(results, evaluationMethod);

  appendFileSync(verifyPath, formatVerifyEntry(results, evaluationMethod));
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
