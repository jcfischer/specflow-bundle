/**
 * Feedback Module Tests
 */

import { describe, it, expect } from "bun:test";
import {
  ImpactLevel,
  ActionableFeedback,
  FeedbackReport,
  SUGGESTION_PATTERNS,
  QUICK_WIN_THRESHOLDS,
  weightToImpact,
  isQuickWin,
  getSuggestionForCriterion,
  parseModelOutput,
  sortFeedbackByPriority,
  generateActionableFeedback,
  formatFeedbackReport,
} from "../../src/lib/feedback";
import type { GradeResult, Rubric, RubricCriterion } from "../../src/lib/eval/types";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockRubric: Rubric = {
  name: "spec-quality",
  passThreshold: 0.8,
  criteria: [
    { name: "Completeness", weight: 0.3, description: "All sections present" },
    { name: "Clarity", weight: 0.25, description: "Clear language" },
    { name: "Testability", weight: 0.25, description: "Measurable criteria" },
    { name: "User Scenarios", weight: 0.2, description: "Concrete scenarios" },
  ],
};

const mockGradeResult: GradeResult = {
  passed: false,
  score: 0.65,
  output: `The specification has some issues:
- Completeness: Missing non-functional requirements section
- Clarity: Some requirements use vague language like "should be fast"
- FR-2: Lacks testable acceptance criteria
- User Scenarios: Only covers happy path, missing edge cases`,
};

// =============================================================================
// Types Tests
// =============================================================================

describe("SUGGESTION_PATTERNS", () => {
  it("should have patterns for common criterion types", () => {
    expect(SUGGESTION_PATTERNS["completeness"]).toBeDefined();
    expect(SUGGESTION_PATTERNS["clarity"]).toBeDefined();
    expect(SUGGESTION_PATTERNS["testability"]).toBeDefined();
    expect(SUGGESTION_PATTERNS["default"]).toBeDefined();
  });

  it("should have suggestion and example for each pattern", () => {
    for (const [key, pattern] of Object.entries(SUGGESTION_PATTERNS)) {
      expect(pattern.suggestion).toBeTruthy();
      expect(pattern.example).toBeTruthy();
    }
  });
});

describe("QUICK_WIN_THRESHOLDS", () => {
  it("should have reasonable thresholds", () => {
    expect(QUICK_WIN_THRESHOLDS.maxScore).toBeGreaterThan(0);
    expect(QUICK_WIN_THRESHOLDS.maxScore).toBeLessThan(1);
    expect(QUICK_WIN_THRESHOLDS.minWeight).toBeGreaterThan(0);
    expect(QUICK_WIN_THRESHOLDS.minWeight).toBeLessThan(1);
  });
});

// =============================================================================
// Helper Functions Tests
// =============================================================================

describe("weightToImpact", () => {
  it("should return high for weight >= 0.3", () => {
    expect(weightToImpact(0.3)).toBe("high");
    expect(weightToImpact(0.5)).toBe("high");
    expect(weightToImpact(1.0)).toBe("high");
  });

  it("should return medium for weight >= 0.15 and < 0.3", () => {
    expect(weightToImpact(0.15)).toBe("medium");
    expect(weightToImpact(0.2)).toBe("medium");
    expect(weightToImpact(0.29)).toBe("medium");
  });

  it("should return low for weight < 0.15", () => {
    expect(weightToImpact(0.1)).toBe("low");
    expect(weightToImpact(0.05)).toBe("low");
    expect(weightToImpact(0)).toBe("low");
  });
});

describe("isQuickWin", () => {
  it("should return true for low score and high weight", () => {
    expect(isQuickWin(0.4, 0.3)).toBe(true);
    expect(isQuickWin(0.5, 0.2)).toBe(true);
  });

  it("should return false for high score", () => {
    expect(isQuickWin(0.7, 0.3)).toBe(false);
    expect(isQuickWin(0.9, 0.5)).toBe(false);
  });

  it("should return false for low weight", () => {
    expect(isQuickWin(0.3, 0.1)).toBe(false);
    expect(isQuickWin(0.4, 0.05)).toBe(false);
  });

  it("should handle undefined score as 0", () => {
    expect(isQuickWin(undefined, 0.3)).toBe(true);
  });
});

describe("getSuggestionForCriterion", () => {
  it("should return exact match patterns", () => {
    const result = getSuggestionForCriterion("completeness");
    expect(result.suggestion).toContain("required sections");
  });

  it("should normalize criterion names", () => {
    const result1 = getSuggestionForCriterion("Acceptance Criteria");
    const result2 = getSuggestionForCriterion("acceptance-criteria");
    const result3 = getSuggestionForCriterion("ACCEPTANCE_CRITERIA");

    expect(result1.suggestion).toBe(result2.suggestion);
    expect(result2.suggestion).toBe(result3.suggestion);
  });

  it("should return partial match patterns", () => {
    // "user_scenarios" pattern should match when criterion contains "user_scenarios"
    const result = getSuggestionForCriterion("user_scenarios");
    expect(result.suggestion).toContain("scenario");
  });

  it("should return default pattern for unknown criteria", () => {
    const result = getSuggestionForCriterion("unknown_criterion_xyz");
    expect(result.suggestion).toBe(SUGGESTION_PATTERNS["default"].suggestion);
  });
});

describe("parseModelOutput", () => {
  it("should parse section: issue format", () => {
    const output = "Completeness: Missing overview section";
    const issues = parseModelOutput(output);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.section.includes("Completeness"))).toBe(true);
  });

  it("should parse FR-X: issue format", () => {
    const output = "FR-2: Lacks testable criteria";
    const issues = parseModelOutput(output);
    expect(issues.some(i => i.section === "FR-2")).toBe(true);
  });

  it("should parse NFR-X: issue format", () => {
    const output = "NFR-1: Missing performance requirements";
    const issues = parseModelOutput(output);
    expect(issues.some(i => i.section === "NFR-1")).toBe(true);
  });

  it("should parse multiple issues from complex output", () => {
    const output = `Issues found:
- Completeness: Missing sections
- Clarity: Vague language
- FR-1: Not testable`;
    const issues = parseModelOutput(output);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("should avoid duplicates", () => {
    const output = `Completeness: Missing overview
Completeness: Missing overview`;
    const issues = parseModelOutput(output);
    const completenessIssues = issues.filter(i => i.section === "Completeness");
    expect(completenessIssues.length).toBe(1);
  });

  it("should handle empty output", () => {
    const issues = parseModelOutput("");
    expect(issues).toHaveLength(0);
  });
});

describe("sortFeedbackByPriority", () => {
  it("should put quick wins first", () => {
    const items: ActionableFeedback[] = [
      { section: "A", issue: "", suggestion: "", example: "", impact: "high", isQuickWin: false },
      { section: "B", issue: "", suggestion: "", example: "", impact: "low", isQuickWin: true },
      { section: "C", issue: "", suggestion: "", example: "", impact: "medium", isQuickWin: false },
    ];

    const sorted = sortFeedbackByPriority(items);
    expect(sorted[0].section).toBe("B");
    expect(sorted[0].isQuickWin).toBe(true);
  });

  it("should sort by impact after quick wins", () => {
    const items: ActionableFeedback[] = [
      { section: "Low", issue: "", suggestion: "", example: "", impact: "low", isQuickWin: false },
      { section: "High", issue: "", suggestion: "", example: "", impact: "high", isQuickWin: false },
      { section: "Medium", issue: "", suggestion: "", example: "", impact: "medium", isQuickWin: false },
    ];

    const sorted = sortFeedbackByPriority(items);
    expect(sorted[0].impact).toBe("high");
    expect(sorted[1].impact).toBe("medium");
    expect(sorted[2].impact).toBe("low");
  });

  it("should not mutate original array", () => {
    const items: ActionableFeedback[] = [
      { section: "A", issue: "", suggestion: "", example: "", impact: "low", isQuickWin: false },
      { section: "B", issue: "", suggestion: "", example: "", impact: "high", isQuickWin: false },
    ];

    const sorted = sortFeedbackByPriority(items);
    expect(items[0].section).toBe("A");
    expect(sorted[0].section).toBe("B");
  });
});

// =============================================================================
// Generator Tests
// =============================================================================

describe("generateActionableFeedback", () => {
  it("should generate feedback for all criteria", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    expect(report.items.length).toBeGreaterThanOrEqual(mockRubric.criteria.length);
  });

  it("should set overall score from grade result", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    expect(report.overallScore).toBe(0.65);
  });

  it("should set threshold from rubric", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    expect(report.threshold).toBe(0.8);
  });

  it("should identify quick wins", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    // With score 0.65 and high weight criteria, there should be quick wins
    expect(report.quickWins.length).toBeGreaterThan(0);
  });

  it("should calculate stats correctly", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    expect(report.stats.total).toBe(report.items.length);
    expect(report.stats.quickWins).toBe(report.quickWins.length);
    expect(report.stats.high + report.stats.medium + report.stats.low).toBe(report.stats.total);
  });

  it("should sort items by priority", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);

    // Quick wins should come first
    let foundNonQuickWin = false;
    for (const item of report.items) {
      if (!item.isQuickWin) {
        foundNonQuickWin = true;
      }
      if (foundNonQuickWin && item.isQuickWin) {
        throw new Error("Quick win found after non-quick-win");
      }
    }
  });

  it("should handle grade result with null score", () => {
    const resultWithNullScore: GradeResult = {
      passed: false,
      score: null,
      output: "Failed evaluation",
    };

    const report = generateActionableFeedback(resultWithNullScore, mockRubric);
    expect(report.overallScore).toBe(0);
  });

  it("should include parsed issues from output", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);

    // Should include FR-2 from the parsed output
    const hasFR2 = report.items.some(item =>
      item.section.includes("FR-2") || item.issue.includes("FR-2")
    );
    expect(hasFR2).toBe(true);
  });
});

// =============================================================================
// Formatting Tests
// =============================================================================

describe("formatFeedbackReport", () => {
  it("should include score and threshold", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    const formatted = formatFeedbackReport(report);

    expect(formatted).toContain("65%");
    expect(formatted).toContain("80%");
  });

  it("should format quick wins with special marker", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    const formatted = formatFeedbackReport(report);

    if (report.quickWins.length > 0) {
      expect(formatted).toContain("QUICK WIN");
      expect(formatted).toContain("🎯");
    }
  });

  it("should include impact labels", () => {
    const report: FeedbackReport = {
      overallScore: 0.5,
      threshold: 0.8,
      items: [
        { section: "A", issue: "Issue A", suggestion: "Fix A", example: "Ex A", impact: "high", isQuickWin: false },
        { section: "B", issue: "Issue B", suggestion: "Fix B", example: "Ex B", impact: "medium", isQuickWin: false },
        { section: "C", issue: "Issue C", suggestion: "Fix C", example: "Ex C", impact: "low", isQuickWin: false },
      ],
      quickWins: [],
      stats: { total: 3, high: 1, medium: 1, low: 1, quickWins: 0 },
    };

    const formatted = formatFeedbackReport(report);
    expect(formatted).toContain("HIGH");
    expect(formatted).toContain("MEDIUM");
    expect(formatted).toContain("LOW");
  });

  it("should include summary line", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    const formatted = formatFeedbackReport(report);

    expect(formatted).toContain("Summary:");
    expect(formatted).toContain("issues");
  });

  it("should include quick win count in summary when applicable", () => {
    const report = generateActionableFeedback(mockGradeResult, mockRubric);
    const formatted = formatFeedbackReport(report);

    if (report.stats.quickWins > 0) {
      expect(formatted).toContain("quick win");
    }
  });
});
