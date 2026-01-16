/**
 * Feedback Module
 * Actionable feedback generation for quality gate failures
 *
 * Council Design Decision (F-093):
 * - Quality gates that fail should provide actionable feedback
 * - Feedback should be prioritized by impact
 * - Quick wins (easy fixes with high impact) should be highlighted first
 */

import type { GradeResult, Rubric, RubricCriterion } from "./eval/types";

// =============================================================================
// Types
// =============================================================================

/**
 * Impact level for feedback items
 */
export type ImpactLevel = "high" | "medium" | "low";

/**
 * A single actionable feedback item
 */
export interface ActionableFeedback {
  /** Section reference (e.g., "FR-2", "Acceptance Criteria") */
  section: string;
  /** What's wrong */
  issue: string;
  /** How to fix it */
  suggestion: string;
  /** Example of a good version */
  example: string;
  /** Impact level based on criterion weight */
  impact: ImpactLevel;
  /** Easy fix with high impact */
  isQuickWin: boolean;
  /** Original criterion name if applicable */
  criterionName?: string;
  /** Score for this criterion (0-1) if available */
  score?: number;
}

/**
 * Complete feedback report
 */
export interface FeedbackReport {
  /** Overall score (0-1) */
  overallScore: number;
  /** Threshold that was not met */
  threshold: number;
  /** All feedback items sorted by priority */
  items: ActionableFeedback[];
  /** Quick wins extracted for easy access */
  quickWins: ActionableFeedback[];
  /** Summary statistics */
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    quickWins: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Suggestion patterns for common criterion types
 */
export const SUGGESTION_PATTERNS: Record<string, { suggestion: string; example: string }> = {
  // Spec quality patterns
  "completeness": {
    suggestion: "Ensure all required sections are present and filled out",
    example: "Include: Overview, User Scenarios, Functional Requirements, Success Criteria",
  },
  "clarity": {
    suggestion: "Use clear, unambiguous language without jargon",
    example: "Instead of 'system should be fast', say 'response time under 200ms'",
  },
  "testability": {
    suggestion: "Add specific, measurable acceptance criteria",
    example: "Given a logged-in user, When they click 'Submit', Then the form is saved within 2 seconds",
  },
  "acceptance_criteria": {
    suggestion: "Write criteria in Given/When/Then format with measurable outcomes",
    example: "Given [precondition], When [action], Then [observable result]",
  },
  "user_scenarios": {
    suggestion: "Add concrete user scenarios covering happy path and edge cases",
    example: "Scenario: User logs in with valid credentials → Success message shown",
  },
  "functional_requirements": {
    suggestion: "Number requirements (FR-1, FR-2) with clear, atomic statements",
    example: "FR-1: System SHALL validate email format before submission",
  },
  "non_functional_requirements": {
    suggestion: "Specify performance, security, and scalability requirements",
    example: "NFR-1: API response time SHALL be under 500ms for 95th percentile",
  },
  "edge_cases": {
    suggestion: "Document error handling and boundary conditions",
    example: "Edge case: Empty input → Display 'Field required' error message",
  },

  // Plan quality patterns
  "architecture": {
    suggestion: "Include system diagrams and component relationships",
    example: "Component A → API Gateway → Service B → Database",
  },
  "dependencies": {
    suggestion: "List all external dependencies with version constraints",
    example: "Requires: auth-service v2.x, postgres 14+",
  },
  "risk_assessment": {
    suggestion: "Identify technical risks with mitigation strategies",
    example: "Risk: API rate limiting → Mitigation: Implement exponential backoff",
  },
  "implementation_order": {
    suggestion: "Define clear implementation phases with dependencies",
    example: "Phase 1: Data model → Phase 2: API → Phase 3: UI (depends on Phase 2)",
  },

  // Default pattern
  "default": {
    suggestion: "Review and improve this section for clarity and completeness",
    example: "Ensure the content is specific, measurable, and actionable",
  },
};

/**
 * Quick win thresholds
 */
export const QUICK_WIN_THRESHOLDS = {
  /** Minimum score for item to be considered improvable (not already good) */
  maxScore: 0.7,
  /** Minimum weight for high impact */
  minWeight: 0.15,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map criterion weight to impact level
 */
export function weightToImpact(weight: number): ImpactLevel {
  if (weight >= 0.3) return "high";
  if (weight >= 0.15) return "medium";
  return "low";
}

/**
 * Determine if an item is a quick win
 * Quick win = not already good (score < 0.6) AND high impact (weight >= 0.15)
 */
export function isQuickWin(score: number | undefined, weight: number): boolean {
  const scoreValue = score ?? 0;
  return scoreValue < QUICK_WIN_THRESHOLDS.maxScore && weight >= QUICK_WIN_THRESHOLDS.minWeight;
}

/**
 * Get suggestion pattern for a criterion
 */
export function getSuggestionForCriterion(criterionName: string): { suggestion: string; example: string } {
  // Normalize the criterion name for lookup
  const normalized = criterionName.toLowerCase().replace(/[\s-]+/g, "_");

  // Try exact match first
  if (SUGGESTION_PATTERNS[normalized]) {
    return SUGGESTION_PATTERNS[normalized];
  }

  // Try partial match
  for (const [key, value] of Object.entries(SUGGESTION_PATTERNS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return SUGGESTION_PATTERNS["default"];
}

/**
 * Parse model output to extract section-specific issues
 */
export function parseModelOutput(output: string): Array<{ section: string; issue: string }> {
  const issues: Array<{ section: string; issue: string }> = [];

  // Common patterns in model feedback
  const patterns = [
    // "Section X: issue description"
    /(?:^|\n)\s*(?:[-•*]?\s*)?([A-Z][A-Za-z\s-]+(?:\d+)?)\s*[:\-–]\s*(.+?)(?=\n|$)/g,
    // "FR-1: issue" or "NFR-2: issue"
    /(?:^|\n)\s*(?:[-•*]?\s*)?((?:FR|NFR|AC|SC)-\d+)\s*[:\-–]\s*(.+?)(?=\n|$)/g,
    // "The X section lacks..." or "X is missing..."
    /(?:The\s+)?([A-Za-z\s-]+)\s+(?:section\s+)?(?:lacks?|is missing|needs?|should|could)\s+(.+?)(?=\n|$)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const section = match[1].trim();
      const issue = match[2].trim();

      // Avoid duplicates
      if (!issues.some(i => i.section === section && i.issue === issue)) {
        issues.push({ section, issue });
      }
    }
  }

  return issues;
}

/**
 * Sort feedback items by priority (quick wins first, then by impact)
 */
export function sortFeedbackByPriority(items: ActionableFeedback[]): ActionableFeedback[] {
  return [...items].sort((a, b) => {
    // Quick wins first
    if (a.isQuickWin !== b.isQuickWin) {
      return a.isQuickWin ? -1 : 1;
    }

    // Then by impact
    const impactOrder: Record<ImpactLevel, number> = { high: 0, medium: 1, low: 2 };
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate actionable feedback from a grade result
 */
export function generateActionableFeedback(
  gradeResult: GradeResult,
  rubric: Rubric
): FeedbackReport {
  const items: ActionableFeedback[] = [];

  // Parse section-specific issues from model output
  const parsedIssues = parseModelOutput(gradeResult.output);

  // Generate feedback for each criterion
  for (const criterion of rubric.criteria) {
    const impact = weightToImpact(criterion.weight);
    const { suggestion, example } = getSuggestionForCriterion(criterion.name);

    // Find parsed issues related to this criterion
    const relatedIssue = parsedIssues.find(
      issue => issue.section.toLowerCase().includes(criterion.name.toLowerCase()) ||
               criterion.name.toLowerCase().includes(issue.section.toLowerCase())
    );

    // Estimate criterion score from overall score and weight
    // This is a heuristic since we don't have per-criterion scores
    const estimatedScore = gradeResult.score ?? 0;

    const item: ActionableFeedback = {
      section: relatedIssue?.section ?? criterion.name,
      issue: relatedIssue?.issue ?? `Needs improvement in ${criterion.name.toLowerCase()}`,
      suggestion,
      example,
      impact,
      isQuickWin: isQuickWin(estimatedScore, criterion.weight),
      criterionName: criterion.name,
      score: estimatedScore,
    };

    items.push(item);
  }

  // Also add any parsed issues that weren't matched to criteria
  for (const issue of parsedIssues) {
    const alreadyIncluded = items.some(
      item => item.section.toLowerCase() === issue.section.toLowerCase()
    );

    if (!alreadyIncluded) {
      const pattern = getSuggestionForCriterion(issue.section);
      items.push({
        section: issue.section,
        issue: issue.issue,
        suggestion: pattern.suggestion,
        example: pattern.example,
        impact: "medium",
        isQuickWin: false,
      });
    }
  }

  // Sort by priority
  const sortedItems = sortFeedbackByPriority(items);
  const quickWins = sortedItems.filter(item => item.isQuickWin);

  // Calculate stats
  const stats = {
    total: sortedItems.length,
    high: sortedItems.filter(i => i.impact === "high").length,
    medium: sortedItems.filter(i => i.impact === "medium").length,
    low: sortedItems.filter(i => i.impact === "low").length,
    quickWins: quickWins.length,
  };

  return {
    overallScore: gradeResult.score ?? 0,
    threshold: rubric.passThreshold,
    items: sortedItems,
    quickWins,
    stats,
  };
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format feedback report as a human-readable string
 */
export function formatFeedbackReport(report: FeedbackReport): string {
  const lines: string[] = [];

  // Header
  const scorePercent = Math.round(report.overallScore * 100);
  const thresholdPercent = Math.round(report.threshold * 100);
  lines.push(`⚠ Quality gate failed (${scorePercent}% < ${thresholdPercent}%)`);
  lines.push("");
  lines.push("📍 Issues (prioritized):");
  lines.push("");

  // Quick wins first
  if (report.quickWins.length > 0) {
    for (const item of report.quickWins) {
      lines.push(`🎯 QUICK WIN: ${item.section}`);
      lines.push(`   Issue: ${item.issue}`);
      lines.push(`   Fix: ${item.suggestion}`);
      lines.push(`   Example: ${item.example}`);
      lines.push("");
    }
  }

  // Other items by impact
  const nonQuickWins = report.items.filter(i => !i.isQuickWin);
  for (const item of nonQuickWins) {
    const icon = item.impact === "high" ? "⚠" : item.impact === "medium" ? "📝" : "💡";
    const label = item.impact.toUpperCase();
    lines.push(`${icon} ${label}: ${item.section}`);
    lines.push(`   Issue: ${item.issue}`);
    lines.push(`   Fix: ${item.suggestion}`);
    lines.push("");
  }

  // Summary
  lines.push("─".repeat(40));
  lines.push(`Summary: ${report.stats.total} issues (${report.stats.high} high, ${report.stats.medium} medium, ${report.stats.low} low)`);
  if (report.stats.quickWins > 0) {
    lines.push(`💡 ${report.stats.quickWins} quick win(s) identified - start there!`);
  }

  return lines.join("\n");
}
