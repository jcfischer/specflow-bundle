/**
 * Tests for eval type definitions
 * Verifies that types are correctly defined and can be used
 */

import { describe, expect, it } from "bun:test";
import type {
  TestCase,
  EvalResult,
  EvalRun,
  Rubric,
  RubricCriterion,
  GradeResult,
  GradeContext,
  TestCaseType,
  GraderType,
} from "../../src/lib/eval/types";

describe("Eval Types", () => {
  describe("TestCase", () => {
    it("should accept valid positive test case", () => {
      const testCase: TestCase = {
        id: "TC-001",
        name: "Valid workflow test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: { checkType: "file-exists" },
        createdAt: new Date(),
      };

      expect(testCase.id).toBe("TC-001");
      expect(testCase.type).toBe("positive");
      expect(testCase.graderType).toBe("code");
    });

    it("should accept valid negative test case", () => {
      const testCase: TestCase = {
        id: "TC-002",
        name: "Phase gate violation",
        suite: "workflow",
        type: "negative",
        graderType: "code",
        prompt: "Skip directly to implementation",
        expectedBehavior: "Should fail with phase gate error",
        graderConfig: { checkType: "phase-gate" },
        createdAt: new Date(),
      };

      expect(testCase.type).toBe("negative");
      expect(testCase.prompt).toBeDefined();
      expect(testCase.expectedBehavior).toBeDefined();
    });

    it("should accept model grader test case", () => {
      const testCase: TestCase = {
        id: "TC-003",
        name: "Spec quality check",
        suite: "spec-quality",
        type: "positive",
        graderType: "model",
        graderConfig: { rubric: "spec-quality" },
        createdAt: new Date(),
      };

      expect(testCase.graderType).toBe("model");
    });
  });

  describe("EvalResult", () => {
    it("should accept valid passing result", () => {
      const result: EvalResult = {
        id: "ER-001",
        runId: "run-123",
        testCaseId: "TC-001",
        passed: true,
        score: null,
        durationMs: 150,
        rawOutput: "File exists at expected path",
        error: null,
        timestamp: new Date(),
      };

      expect(result.passed).toBe(true);
      expect(result.error).toBeNull();
    });

    it("should accept valid failing result with error", () => {
      const result: EvalResult = {
        id: "ER-002",
        runId: "run-123",
        testCaseId: "TC-002",
        passed: false,
        score: null,
        durationMs: 50,
        rawOutput: null,
        error: "File not found: spec.md",
        timestamp: new Date(),
      };

      expect(result.passed).toBe(false);
      expect(result.error).toBe("File not found: spec.md");
    });

    it("should accept model result with score", () => {
      const result: EvalResult = {
        id: "ER-003",
        runId: "run-123",
        testCaseId: "TC-003",
        passed: true,
        score: 0.85,
        durationMs: 2500,
        rawOutput: "Quality assessment: Completeness 0.9, Clarity 0.8...",
        error: null,
        timestamp: new Date(),
      };

      expect(result.score).toBe(0.85);
    });
  });

  describe("EvalRun", () => {
    it("should accept valid eval run", () => {
      const run: EvalRun = {
        id: "run-123",
        timestamp: new Date(),
        suites: ["workflow", "spec-quality"],
        totalTests: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        durationMs: 15000,
      };

      expect(run.totalTests).toBe(10);
      expect(run.passed + run.failed + run.skipped).toBe(run.totalTests);
    });

    it("should accept run with pass@k metrics", () => {
      const run: EvalRun = {
        id: "run-456",
        timestamp: new Date(),
        suites: ["workflow"],
        totalTests: 5,
        passed: 4,
        failed: 1,
        skipped: 0,
        durationMs: 8000,
        passAtK: { 1: 0.8, 3: 0.95, 5: 0.99 },
        passCaretK: 0.75,
      };

      expect(run.passAtK?.[1]).toBe(0.8);
      expect(run.passCaretK).toBe(0.75);
    });
  });

  describe("Rubric", () => {
    it("should accept valid rubric with criteria", () => {
      const criterion: RubricCriterion = {
        name: "Completeness",
        weight: 0.3,
        description: "All required sections are filled meaningfully",
      };

      const rubric: Rubric = {
        name: "spec-quality",
        passThreshold: 0.7,
        criteria: [criterion],
      };

      expect(rubric.passThreshold).toBe(0.7);
      expect(rubric.criteria).toHaveLength(1);
      expect(rubric.criteria[0].weight).toBe(0.3);
    });

    it("should accept rubric criterion with examples", () => {
      const criterion: RubricCriterion = {
        name: "Testability",
        weight: 0.3,
        description: "Success criteria are measurable",
        examples: {
          good: "Success criteria: API response time < 200ms",
          bad: "Success criteria: API should be fast",
        },
      };

      expect(criterion.examples?.good).toContain("200ms");
      expect(criterion.examples?.bad).toContain("fast");
    });
  });

  describe("GradeResult", () => {
    it("should accept passing code grader result", () => {
      const result: GradeResult = {
        passed: true,
        score: null,
        output: "All required files exist",
      };

      expect(result.passed).toBe(true);
      expect(result.score).toBeNull();
    });

    it("should accept failing model grader result", () => {
      const result: GradeResult = {
        passed: false,
        score: 0.55,
        output: "Spec scored below threshold",
        error: "Quality score 0.55 < threshold 0.7",
      };

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.55);
      expect(result.error).toBeDefined();
    });
  });

  describe("GradeContext", () => {
    it("should accept minimal context", () => {
      const context: GradeContext = {
        projectPath: "/path/to/project",
      };

      expect(context.projectPath).toBe("/path/to/project");
    });

    it("should accept full context with feature and spec", () => {
      const context: GradeContext = {
        projectPath: "/path/to/project",
        featureId: "F-001",
        specContent: "# Specification...",
      };

      expect(context.featureId).toBe("F-001");
      expect(context.specContent).toContain("Specification");
    });
  });

  describe("Type aliases", () => {
    it("should validate TestCaseType", () => {
      const positive: TestCaseType = "positive";
      const negative: TestCaseType = "negative";

      expect(positive).toBe("positive");
      expect(negative).toBe("negative");
    });

    it("should validate GraderType", () => {
      const code: GraderType = "code";
      const model: GraderType = "model";

      expect(code).toBe("code");
      expect(model).toBe("model");
    });
  });
});
