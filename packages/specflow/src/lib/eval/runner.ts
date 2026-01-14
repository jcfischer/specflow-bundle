/**
 * Eval Runner
 * Executes evaluation test cases and collects results
 */

import {
  initEvalDatabase,
  getTestCases,
  getTestCasesBySuite,
  addEvalRun,
  addEvalResult,
} from "./database";
import { getGraderForTestCase, graderRegistry } from "./graders";
import type { TestCase, EvalResult, GradeContext } from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for running evaluations
 */
export interface EvalRunnerOptions {
  /** Path to project being evaluated */
  projectPath: string;
  /** Path to eval database */
  dbPath: string;
  /** Run specific suites only (default: all) */
  suites?: string[];
  /** Skip model-based evaluations */
  skipModel?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Feature ID for feature-specific evals */
  featureId?: string;
}

/**
 * Result of an eval run
 */
export interface EvalRunnerResult {
  /** Unique run ID */
  runId: string;
  /** Suites that were run */
  suites: string[];
  /** Total number of tests */
  totalTests: number;
  /** Number of tests that passed */
  passed: number;
  /** Number of tests that failed */
  failed: number;
  /** Number of tests skipped */
  skipped: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Individual test results */
  results: EvalResultWithTest[];
}

/**
 * Extended eval result with test case info
 */
export interface EvalResultWithTest {
  testCaseId: string;
  testCaseName: string;
  suite: string;
  type: "positive" | "negative";
  passed: boolean;
  score: number | null;
  durationMs: number;
  output: string | null;
  error: string | null;
}

// =============================================================================
// Runner Implementation
// =============================================================================

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

/**
 * Generate a unique result ID
 */
function generateResultId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `result-${timestamp}-${random}`;
}

/**
 * Run evaluations
 */
export async function runEvals(options: EvalRunnerOptions): Promise<EvalRunnerResult> {
  const startTime = performance.now();
  const runId = generateRunId();

  // Initialize database
  initEvalDatabase(options.dbPath);

  // Get test cases
  let testCases: TestCase[];
  if (options.suites && options.suites.length > 0) {
    // Get test cases for specified suites
    testCases = [];
    for (const suite of options.suites) {
      const suiteTests = getTestCasesBySuite(suite);
      testCases.push(...suiteTests);
    }
  } else {
    testCases = getTestCases();
  }

  // Filter out model graders if skipModel is set
  const skippedTestCases: TestCase[] = [];
  if (options.skipModel) {
    const filtered = testCases.filter((tc) => {
      if (tc.graderType === "model") {
        skippedTestCases.push(tc);
        return false;
      }
      return true;
    });
    testCases = filtered;
  }

  // Build grade context
  const context: GradeContext = {
    projectPath: options.projectPath,
    featureId: options.featureId,
  };

  // Run each test case
  const results: EvalResultWithTest[] = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const testStartTime = performance.now();
    let testPassed = false;
    let testScore: number | null = null;
    let testOutput: string | null = null;
    let testError: string | null = null;

    try {
      // Get grader for this test case
      const graderName = (testCase.graderConfig.grader as string) ?? testCase.graderType;

      if (!graderRegistry.has(graderName)) {
        throw new Error(`Unknown grader: ${graderName}`);
      }

      const grader = getGraderForTestCase(testCase);
      const gradeResult = await grader.grade(testCase, context);

      testScore = gradeResult.score;
      testOutput = gradeResult.output;

      // Handle positive vs negative test cases
      if (testCase.type === "positive") {
        // Positive test: grader pass = test pass
        testPassed = gradeResult.passed;
        if (!testPassed) {
          testError = gradeResult.error ?? "Grader returned failure";
        }
      } else {
        // Negative test: grader fail = test pass (expected failure)
        testPassed = !gradeResult.passed;
        if (!testPassed) {
          testError = "Expected grader to fail, but it passed";
        }
      }
    } catch (error) {
      testError = error instanceof Error ? error.message : String(error);

      // For negative tests, an error might be expected
      if (testCase.type === "negative") {
        testPassed = true;
        testOutput = `Expected error: ${testError}`;
        testError = null;
      }
    }

    const testDurationMs = Math.round(performance.now() - testStartTime);

    // Record result
    const resultWithTest: EvalResultWithTest = {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      suite: testCase.suite,
      type: testCase.type,
      passed: testPassed,
      score: testScore,
      durationMs: testDurationMs,
      output: testOutput,
      error: testError,
    };
    results.push(resultWithTest);

    if (testPassed) {
      passed++;
    } else {
      failed++;
    }

    // Save result to database
    addEvalResult({
      id: generateResultId(),
      runId,
      testCaseId: testCase.id,
      passed: testPassed,
      score: testScore,
      durationMs: testDurationMs,
      rawOutput: testOutput,
      error: testError,
    });

    if (options.verbose) {
      const status = testPassed ? "✓" : "✗";
      console.log(`${status} ${testCase.name} (${testDurationMs}ms)`);
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  // Determine which suites were actually run
  const suitesRun = options.suites ?? [...new Set(testCases.map((tc) => tc.suite))];

  // Save run to database
  addEvalRun({
    id: runId,
    suites: suitesRun,
    totalTests: testCases.length,
    passed,
    failed,
    skipped: skippedTestCases.length,
    durationMs,
  });

  return {
    runId,
    suites: suitesRun,
    totalTests: testCases.length,
    passed,
    failed,
    skipped: skippedTestCases.length,
    durationMs,
    results,
  };
}
