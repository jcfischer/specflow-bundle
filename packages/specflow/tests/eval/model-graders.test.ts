/**
 * Tests for model-based graders
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import {
  loadRubric,
  validateRubric,
  parseRubricYaml,
  modelGrader,
  buildGradingPrompt,
  parseGradingResponse,
} from "../../src/lib/eval/graders/model-based";
import type { Rubric, RubricCriterion, TestCase, GradeContext } from "../../src/lib/eval/types";

// Test in a temporary directory
const TEST_DIR = "/tmp/specflow-model-grader-test";

describe("Model-Based Graders", () => {
  beforeEach(() => {
    // Clean up and recreate test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, "rubrics"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("parseRubricYaml", () => {
    it("should parse valid rubric YAML", () => {
      const yaml = `
name: test-rubric
passThreshold: 0.7
criteria:
  - name: Completeness
    weight: 0.5
    description: All sections filled
  - name: Clarity
    weight: 0.5
    description: Writing is clear
`;

      const rubric = parseRubricYaml(yaml);

      expect(rubric.name).toBe("test-rubric");
      expect(rubric.passThreshold).toBe(0.7);
      expect(rubric.criteria).toHaveLength(2);
      expect(rubric.criteria[0].name).toBe("Completeness");
      expect(rubric.criteria[0].weight).toBe(0.5);
    });

    it("should parse rubric with examples", () => {
      const yaml = `
name: spec-quality
passThreshold: 0.7
criteria:
  - name: Testability
    weight: 1.0
    description: Success criteria are measurable
    examples:
      good: "Response time < 200ms"
      bad: "Should be fast"
`;

      const rubric = parseRubricYaml(yaml);

      expect(rubric.criteria[0].examples?.good).toContain("200ms");
      expect(rubric.criteria[0].examples?.bad).toContain("fast");
    });

    it("should throw on invalid YAML", () => {
      const yaml = `
name: invalid
passThreshold: not-a-number
`;

      expect(() => parseRubricYaml(yaml)).toThrow();
    });
  });

  describe("validateRubric", () => {
    it("should pass for valid rubric", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [
          { name: "A", weight: 0.5, description: "Criterion A" },
          { name: "B", weight: 0.5, description: "Criterion B" },
        ],
      };

      const result = validateRubric(rubric);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when weights don't sum to 1.0", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [
          { name: "A", weight: 0.3, description: "Criterion A" },
          { name: "B", weight: 0.3, description: "Criterion B" },
        ],
      };

      const result = validateRubric(rubric);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("sum to 1.0"))).toBe(true);
    });

    it("should allow weights close to 1.0 (floating point tolerance)", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [
          { name: "A", weight: 0.3, description: "Criterion A" },
          { name: "B", weight: 0.3, description: "Criterion B" },
          { name: "C", weight: 0.2, description: "Criterion C" },
          { name: "D", weight: 0.2, description: "Criterion D" },
        ],
      };

      const result = validateRubric(rubric);

      expect(result.valid).toBe(true);
    });

    it("should fail when passThreshold is out of range", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 1.5,
        criteria: [{ name: "A", weight: 1.0, description: "Criterion A" }],
      };

      const result = validateRubric(rubric);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("threshold"))).toBe(true);
    });

    it("should fail when criteria is empty", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [],
      };

      const result = validateRubric(rubric);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("criteria"))).toBe(true);
    });

    it("should fail when name is empty", () => {
      const rubric: Rubric = {
        name: "",
        passThreshold: 0.7,
        criteria: [{ name: "A", weight: 1.0, description: "Criterion A" }],
      };

      const result = validateRubric(rubric);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("name"))).toBe(true);
    });
  });

  describe("loadRubric", () => {
    it("should load rubric from file path", async () => {
      const rubricContent = `
name: file-rubric
passThreshold: 0.8
criteria:
  - name: Quality
    weight: 1.0
    description: Overall quality
`;
      writeFileSync(join(TEST_DIR, "rubrics", "test.yaml"), rubricContent);

      const rubric = await loadRubric(join(TEST_DIR, "rubrics", "test.yaml"));

      expect(rubric.name).toBe("file-rubric");
      expect(rubric.passThreshold).toBe(0.8);
    });

    it("should throw on non-existent file", async () => {
      await expect(loadRubric("/nonexistent/rubric.yaml")).rejects.toThrow();
    });

    it("should throw on invalid rubric", async () => {
      const invalidContent = `
name: invalid
passThreshold: 2.0
criteria: []
`;
      writeFileSync(join(TEST_DIR, "rubrics", "invalid.yaml"), invalidContent);

      await expect(loadRubric(join(TEST_DIR, "rubrics", "invalid.yaml"))).rejects.toThrow();
    });
  });

  describe("built-in rubrics", () => {
    it("should have spec-quality rubric available", async () => {
      // This tests that our spec-quality.yaml is valid
      const rubricPath = join(
        import.meta.dir,
        "../../evals/rubrics/spec-quality.yaml"
      );

      if (existsSync(rubricPath)) {
        const rubric = await loadRubric(rubricPath);
        expect(rubric.name).toBe("spec-quality");
        expect(rubric.criteria.length).toBeGreaterThan(0);

        const validation = validateRubric(rubric);
        expect(validation.valid).toBe(true);
      }
    });
  });

  describe("buildGradingPrompt", () => {
    it("should build a structured grading prompt", () => {
      const rubric: Rubric = {
        name: "test-rubric",
        passThreshold: 0.7,
        criteria: [
          { name: "Completeness", weight: 0.5, description: "All sections present" },
          { name: "Clarity", weight: 0.5, description: "Clear writing" },
        ],
      };
      const content = "# My Spec\n\n## Overview\n\nThis is a test specification.";

      const prompt = buildGradingPrompt(rubric, content);

      // Verify prompt structure
      expect(prompt).toContain("test-rubric");
      expect(prompt).toContain("Completeness");
      expect(prompt).toContain("Clarity");
      expect(prompt).toContain("weight: 0.5");
      expect(prompt).toContain("All sections present");
      expect(prompt).toContain("# My Spec");
      expect(prompt).toContain("JSON");
    });

    it("should include examples if provided", () => {
      const rubric: Rubric = {
        name: "test-rubric",
        passThreshold: 0.7,
        criteria: [
          {
            name: "Quality",
            weight: 1.0,
            description: "High quality",
            examples: { good: "Good example", bad: "Bad example" },
          },
        ],
      };

      const prompt = buildGradingPrompt(rubric, "content");

      expect(prompt).toContain("Good example");
      expect(prompt).toContain("Bad example");
    });
  });

  describe("parseGradingResponse", () => {
    it("should parse valid JSON response", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [
          { name: "A", weight: 0.5, description: "Criterion A" },
          { name: "B", weight: 0.5, description: "Criterion B" },
        ],
      };

      const responseText = JSON.stringify({
        scores: {
          A: { score: 0.8, reasoning: "Good A" },
          B: { score: 0.6, reasoning: "OK B" },
        },
        overall: "Decent spec",
      });

      const result = parseGradingResponse(responseText, rubric);

      expect(result.passed).toBe(true); // 0.8*0.5 + 0.6*0.5 = 0.7
      expect(result.score).toBe(0.7);
      expect(result.output).toContain("Good A");
      expect(result.output).toContain("OK B");
      expect(result.error).toBeUndefined();
    });

    it("should fail when weighted score below threshold", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.8,
        criteria: [
          { name: "A", weight: 1.0, description: "Criterion A" },
        ],
      };

      const responseText = JSON.stringify({
        scores: {
          A: { score: 0.5, reasoning: "Weak" },
        },
        overall: "Needs work",
      });

      const result = parseGradingResponse(responseText, rubric);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.5);
    });

    it("should handle missing criteria gracefully", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [
          { name: "A", weight: 0.5, description: "Criterion A" },
          { name: "B", weight: 0.5, description: "Criterion B" },
        ],
      };

      // Only A is scored
      const responseText = JSON.stringify({
        scores: {
          A: { score: 0.8, reasoning: "Good" },
        },
        overall: "Partial",
      });

      const result = parseGradingResponse(responseText, rubric);

      // Missing B gets 0, so: 0.8*0.5 + 0*0.5 = 0.4
      expect(result.score).toBe(0.4);
      expect(result.passed).toBe(false);
    });

    it("should handle malformed JSON", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [{ name: "A", weight: 1.0, description: "A" }],
      };

      const result = parseGradingResponse("not valid json {{{", rubric);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.error).toContain("parse");
    });

    it("should extract JSON from markdown code blocks", () => {
      const rubric: Rubric = {
        name: "test",
        passThreshold: 0.7,
        criteria: [{ name: "A", weight: 1.0, description: "A" }],
      };

      const responseText = `Here's my evaluation:

\`\`\`json
{
  "scores": {
    "A": { "score": 0.9, "reasoning": "Excellent" }
  },
  "overall": "Great spec"
}
\`\`\`

Hope this helps!`;

      const result = parseGradingResponse(responseText, rubric);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.9);
    });
  });

  describe("modelGrader.grade", () => {
    it("should return error when rubric not specified", async () => {
      const testCase: TestCase = {
        id: "TC-TEST",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "model",
        graderConfig: { file: "spec.md" }, // Missing rubric
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await modelGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("rubric");
    });

    it("should return error when file not specified", async () => {
      const testCase: TestCase = {
        id: "TC-TEST",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "model",
        graderConfig: { rubric: "spec-quality" }, // Missing file
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await modelGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("file");
    });

    it("should return error when file not found", async () => {
      // Create rubric
      const rubricContent = `
name: test
passThreshold: 0.7
criteria:
  - name: A
    weight: 1.0
    description: Test
`;
      writeFileSync(join(TEST_DIR, "rubrics", "test.yaml"), rubricContent);

      const testCase: TestCase = {
        id: "TC-TEST",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "model",
        graderConfig: {
          rubric: "test",
          rubricsDir: join(TEST_DIR, "rubrics"),
          file: "nonexistent.md",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await modelGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("not found");
    });

    // Integration test - only runs if ANTHROPIC_API_KEY is set
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    it.skipIf(!hasApiKey)("should grade a spec file using Claude Haiku", async () => {
      // Create rubric
      const rubricContent = `
name: simple-test
passThreshold: 0.5
criteria:
  - name: Exists
    weight: 1.0
    description: The spec exists and has content
`;
      writeFileSync(join(TEST_DIR, "rubrics", "simple-test.yaml"), rubricContent);

      // Create a simple spec file
      const specContent = `# Test Specification

## Overview

This is a test specification for evaluating the model grader.

## Requirements

- FR-1: The system should work
- FR-2: The system should be tested

## Success Criteria

- The spec is readable
- The spec has sections
`;
      mkdirSync(join(TEST_DIR, "specs"), { recursive: true });
      writeFileSync(join(TEST_DIR, "specs", "test-spec.md"), specContent);

      const testCase: TestCase = {
        id: "TC-INTEGRATION",
        name: "Integration Test",
        suite: "test",
        type: "positive",
        graderType: "model",
        graderConfig: {
          rubric: "simple-test",
          rubricsDir: join(TEST_DIR, "rubrics"),
          file: "specs/test-spec.md",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await modelGrader.grade(testCase, context);

      // Should pass with some score
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.output).toBeTruthy();
      // Low threshold so should pass
      expect(result.passed).toBe(true);
    }, 30000); // 30s timeout for API call
  });
});
