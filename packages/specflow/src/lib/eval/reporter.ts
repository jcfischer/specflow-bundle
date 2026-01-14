/**
 * Eval Reporter
 * Metrics calculation and report generation
 */

import type { EvalResultWithTest } from "./runner";

// =============================================================================
// Types
// =============================================================================

/**
 * Data for generating reports
 */
export interface ReportData {
  runId: string;
  timestamp: Date;
  suites: string[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  passRate: number;
  passAtK?: Record<number, number>;
  passCaretK?: number;
  results: EvalResultWithTest[];
  previousRun?: {
    runId: string;
    passRate: number;
    timestamp: Date;
  };
}

// =============================================================================
// Pass@k Calculation
// =============================================================================

/**
 * Calculate pass@k metric
 *
 * pass@k = probability of at least one success in k attempts
 * Formula: 1 - (1 - p)^k where p = success rate
 *
 * @param results - Array of results with passed boolean
 * @param k - Number of attempts
 * @returns Probability of at least one success
 */
export function calculatePassAtK(
  results: Array<{ passed: boolean }>,
  k: number
): number {
  if (results.length === 0) return 0;

  // Calculate success rate
  const successes = results.filter((r) => r.passed).length;
  const p = successes / results.length;

  if (p === 0) return 0;
  if (p === 1) return 1;

  // pass@k = 1 - (1-p)^k
  return 1 - Math.pow(1 - p, k);
}

// =============================================================================
// Pass^k Calculation
// =============================================================================

/**
 * Calculate pass^k metric (consistency)
 *
 * pass^k = probability of ALL k attempts succeeding
 * Formula: p^k where p = success rate
 *
 * @param results - Array of results with passed boolean
 * @param k - Number of attempts
 * @returns Probability of all attempts succeeding
 */
export function calculatePassCaretK(
  results: Array<{ passed: boolean }>,
  k: number
): number {
  if (results.length === 0) return 0;

  // Calculate success rate
  const successes = results.filter((r) => r.passed).length;
  const p = successes / results.length;

  if (p === 0) return 0;
  if (p === 1) return 1;

  // pass^k = p^k
  return Math.pow(p, k);
}

// =============================================================================
// Markdown Report
// =============================================================================

/**
 * Format percentage for display
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(data: ReportData): string {
  const lines: string[] = [];

  // Header
  lines.push("# Eval Report");
  lines.push("");
  lines.push(`**Run ID:** ${data.runId}`);
  lines.push(`**Timestamp:** ${data.timestamp.toISOString()}`);
  lines.push(`**Duration:** ${formatDuration(data.durationMs)}`);
  lines.push(`**Suites:** ${data.suites.join(", ") || "all"}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Tests | ${data.totalTests} |`);
  lines.push(`| Passed | ${data.passed} |`);
  lines.push(`| Failed | ${data.failed} |`);
  if (data.skipped > 0) {
    lines.push(`| Skipped | ${data.skipped} |`);
  }
  lines.push(`| Pass Rate | ${formatPercent(data.passRate)} |`);
  lines.push("");

  // Pass@k metrics
  if (data.passAtK || data.passCaretK !== undefined) {
    lines.push("## Reliability Metrics");
    lines.push("");
    lines.push("| Metric | Value | Description |");
    lines.push("|--------|-------|-------------|");

    if (data.passAtK) {
      for (const [k, value] of Object.entries(data.passAtK)) {
        lines.push(
          `| pass@${k} | ${formatPercent(value)} | P(≥1 success in ${k} attempts) |`
        );
      }
    }

    if (data.passCaretK !== undefined) {
      const k = data.passAtK ? Math.max(...Object.keys(data.passAtK).map(Number)) : 3;
      lines.push(
        `| pass^${k} | ${formatPercent(data.passCaretK)} | P(all ${k} attempts succeed) |`
      );
    }
    lines.push("");
  }

  // Trend comparison
  if (data.previousRun) {
    lines.push("## Trend");
    lines.push("");
    const diff = data.passRate - data.previousRun.passRate;
    const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
    const diffStr = diff > 0 ? `+${formatPercent(diff)}` : formatPercent(diff);
    lines.push(
      `Compared to previous run (${data.previousRun.runId}): ${arrow} ${diffStr}`
    );
    lines.push("");
  }

  // Results table
  if (data.results.length > 0) {
    lines.push("## Results");
    lines.push("");
    lines.push("| Status | Test Case | Suite | Duration | Details |");
    lines.push("|--------|-----------|-------|----------|---------|");

    for (const result of data.results) {
      const status = result.passed ? "✓" : "✗";
      const details = result.error
        ? result.error.substring(0, 50)
        : result.output?.substring(0, 50) ?? "";
      lines.push(
        `| ${status} | ${result.testCaseName} (${result.testCaseId}) | ${result.suite} | ${formatDuration(result.durationMs)} | ${details} |`
      );
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("*Generated by SpecFlow Eval*");

  return lines.join("\n");
}

// =============================================================================
// JSON Report
// =============================================================================

/**
 * Generate JSON report for CI/CD integration
 */
export function generateJsonReport(data: ReportData): string {
  const report = {
    runId: data.runId,
    timestamp: data.timestamp.toISOString(),
    suites: data.suites,
    summary: {
      totalTests: data.totalTests,
      passed: data.passed,
      failed: data.failed,
      skipped: data.skipped,
      passRate: data.passRate,
      durationMs: data.durationMs,
    },
    metrics: {
      passAtK: data.passAtK,
      passCaretK: data.passCaretK,
    },
    results: data.results.map((r) => ({
      testCaseId: r.testCaseId,
      testCaseName: r.testCaseName,
      suite: r.suite,
      type: r.type,
      passed: r.passed,
      score: r.score,
      durationMs: r.durationMs,
      error: r.error,
    })),
    // Exit code for CI/CD: 0 = all passed, 1 = some failed
    exitCode: data.failed > 0 ? 1 : 0,
  };

  return JSON.stringify(report, null, 2);
}
