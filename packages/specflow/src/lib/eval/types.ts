/**
 * Eval Type Definitions
 * Core types for evaluation infrastructure
 */

// =============================================================================
// Type Aliases
// =============================================================================

/**
 * Type of test case: positive (should pass) or negative (should fail/be blocked)
 */
export type TestCaseType = "positive" | "negative";

/**
 * Type of grader: code (deterministic) or model (LLM-based)
 */
export type GraderType = "code" | "model";

// =============================================================================
// Test Case
// =============================================================================

/**
 * An evaluation test case
 */
export interface TestCase {
  /** Unique test case ID (e.g., "TC-001") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Suite this test belongs to (e.g., "workflow", "spec-quality") */
  suite: string;
  /** Whether this is a positive or negative test case */
  type: TestCaseType;
  /** Type of grader to use */
  graderType: GraderType;
  /** Prompt for workflow/agent evals (optional) */
  prompt?: string;
  /** Expected behavior description (optional) */
  expectedBehavior?: string;
  /** Grader-specific configuration */
  graderConfig: Record<string, unknown>;
  /** When the test case was created */
  createdAt: Date;
}

// =============================================================================
// Eval Result
// =============================================================================

/**
 * Result of running a single evaluation
 */
export interface EvalResult {
  /** Unique result ID (UUID) */
  id: string;
  /** Parent run ID */
  runId: string;
  /** Which test case this result is for */
  testCaseId: string;
  /** Whether the eval passed */
  passed: boolean;
  /** Score from 0.0-1.0 for model graders, null for code graders */
  score: number | null;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Grader output/reasoning */
  rawOutput: string | null;
  /** Error message if failed */
  error: string | null;
  /** When this result was recorded */
  timestamp: Date;
}

// =============================================================================
// Eval Run
// =============================================================================

/**
 * A complete evaluation run
 */
export interface EvalRun {
  /** Unique run ID (UUID) */
  id: string;
  /** When the run started */
  timestamp: Date;
  /** Which suites were run */
  suites: string[];
  /** Total number of tests run */
  totalTests: number;
  /** Number of tests that passed */
  passed: number;
  /** Number of tests that failed */
  failed: number;
  /** Number of tests that were skipped */
  skipped: number;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** pass@k metrics: k -> probability of success in k attempts */
  passAtK?: Record<number, number>;
  /** pass^k metric: probability ALL k attempts succeed */
  passCaretK?: number;
}

// =============================================================================
// Rubric
// =============================================================================

/**
 * A single criterion in a quality rubric
 */
export interface RubricCriterion {
  /** Criterion name (e.g., "Completeness") */
  name: string;
  /** Weight in final score (should sum to 1.0 across criteria) */
  weight: number;
  /** Description of what to evaluate */
  description: string;
  /** Few-shot examples for grading */
  examples?: {
    good: string;
    bad: string;
  };
}

/**
 * Quality rubric for model-based grading
 */
export interface Rubric {
  /** Rubric name (e.g., "spec-quality") */
  name: string;
  /** Score threshold for passing (e.g., 0.7) */
  passThreshold: number;
  /** Evaluation criteria with weights */
  criteria: RubricCriterion[];
}

// =============================================================================
// Grading
// =============================================================================

/**
 * Context provided to graders for evaluation
 */
export interface GradeContext {
  /** Absolute path to project root */
  projectPath: string;
  /** Feature ID for feature-specific evals (optional) */
  featureId?: string;
  /** Spec content for quality evals (optional) */
  specContent?: string;
}

/**
 * Result returned by a grader
 */
export interface GradeResult {
  /** Whether the eval passed */
  passed: boolean;
  /** Score from 0.0-1.0 for model graders, null for code graders */
  score: number | null;
  /** Grader output/reasoning */
  output: string;
  /** Error message if grading failed */
  error?: string;
}

// =============================================================================
// Runner Options
// =============================================================================

/**
 * Options for running evaluations
 */
export interface RunOptions {
  /** Run specific suites only (default: all) */
  suites?: string[];
  /** Run k times for pass@k calculation (default: 1) */
  k?: number;
  /** Skip model-based evaluations */
  skipModel?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

// =============================================================================
// Report Options
// =============================================================================

/**
 * Options for generating evaluation reports
 */
export interface ReportOptions {
  /** Output format */
  format: "markdown" | "json";
  /** Include trend comparison with previous runs */
  includeTrends?: boolean;
  /** Compare with specific run ID */
  compareRun?: string;
}
