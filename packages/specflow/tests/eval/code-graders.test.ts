/**
 * Tests for code-based graders
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import {
  fileExistsGrader,
  schemaValidGrader,
  phaseGateGrader,
  sectionPresentGrader,
} from "../../src/lib/eval/graders/code-based";
import type { TestCase, GradeContext } from "../../src/lib/eval/types";

// Test in a temporary directory
const TEST_DIR = "/tmp/specflow-grader-test";

describe("Code-Based Graders", () => {
  beforeEach(() => {
    // Clean up and recreate test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("file-exists grader", () => {
    it("should pass when file exists", async () => {
      // Create test file
      writeFileSync(join(TEST_DIR, "spec.md"), "# Spec");

      const testCase: TestCase = {
        id: "TC-001",
        name: "Check spec exists",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await fileExistsGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
      expect(result.score).toBeNull();
      expect(result.output).toContain("exists");
    });

    it("should fail when file does not exist", async () => {
      const testCase: TestCase = {
        id: "TC-002",
        name: "Check missing file",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "missing.md",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await fileExistsGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should check multiple files", async () => {
      // Create test files
      writeFileSync(join(TEST_DIR, "spec.md"), "# Spec");
      writeFileSync(join(TEST_DIR, "plan.md"), "# Plan");

      const testCase: TestCase = {
        id: "TC-003",
        name: "Check multiple files",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          paths: ["spec.md", "plan.md"],
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await fileExistsGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });

    it("should fail if any file in list is missing", async () => {
      writeFileSync(join(TEST_DIR, "spec.md"), "# Spec");

      const testCase: TestCase = {
        id: "TC-004",
        name: "Check files with one missing",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          paths: ["spec.md", "missing.md"],
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await fileExistsGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("missing.md");
    });

    it("should support glob patterns", async () => {
      mkdirSync(join(TEST_DIR, ".specify", "specs", "001-feature"), { recursive: true });
      writeFileSync(join(TEST_DIR, ".specify", "specs", "001-feature", "spec.md"), "# Spec");

      const testCase: TestCase = {
        id: "TC-005",
        name: "Check glob pattern",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          pattern: ".specify/specs/*/spec.md",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await fileExistsGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("schema-valid grader", () => {
    it("should pass when all required sections exist", async () => {
      const content = `# Feature Spec

## Overview
This is the overview.

## User Scenarios
User scenario here.

## Requirements
Requirements list.

## Success Criteria
Success criteria here.
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-010",
        name: "Validate spec schema",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "schema-valid",
          file: "spec.md",
          requiredSections: ["Overview", "User Scenarios", "Requirements", "Success Criteria"],
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await schemaValidGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });

    it("should fail when required section is missing", async () => {
      const content = `# Feature Spec

## Overview
This is the overview.

## Requirements
Requirements list.
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-011",
        name: "Validate incomplete spec",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "schema-valid",
          file: "spec.md",
          requiredSections: ["Overview", "User Scenarios", "Requirements"],
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await schemaValidGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("User Scenarios");
    });

    it("should handle case-insensitive section matching", async () => {
      const content = `# Feature

## OVERVIEW
Content here.

## user scenarios
More content.
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-012",
        name: "Case insensitive sections",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "schema-valid",
          file: "spec.md",
          requiredSections: ["Overview", "User Scenarios"],
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await schemaValidGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("phase-gate grader", () => {
    it("should pass when phases are in correct order", async () => {
      // Create spec, plan, and tasks in order
      mkdirSync(join(TEST_DIR, ".specify", "specs", "001-test"), { recursive: true });
      writeFileSync(join(TEST_DIR, ".specify", "specs", "001-test", "spec.md"), "# Spec");
      writeFileSync(join(TEST_DIR, ".specify", "specs", "001-test", "plan.md"), "# Plan");
      writeFileSync(join(TEST_DIR, ".specify", "specs", "001-test", "tasks.md"), "# Tasks");

      const testCase: TestCase = {
        id: "TC-020",
        name: "Check phase order",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "phase-gate",
          featureDir: ".specify/specs/001-test",
          expectedPhase: "tasks",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await phaseGateGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });

    it("should fail when trying to skip phases", async () => {
      // Create only spec (missing plan)
      mkdirSync(join(TEST_DIR, ".specify", "specs", "001-test"), { recursive: true });
      writeFileSync(join(TEST_DIR, ".specify", "specs", "001-test", "spec.md"), "# Spec");

      const testCase: TestCase = {
        id: "TC-021",
        name: "Check phase skip violation",
        suite: "workflow",
        type: "negative",
        graderType: "code",
        graderConfig: {
          grader: "phase-gate",
          featureDir: ".specify/specs/001-test",
          expectedPhase: "tasks",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await phaseGateGrader.grade(testCase, context);

      // For negative test, we expect the grader to detect the violation
      expect(result.passed).toBe(false);
      expect(result.error).toContain("plan.md");
    });

    it("should pass for specify phase with no prerequisites", async () => {
      mkdirSync(join(TEST_DIR, ".specify", "specs", "001-test"), { recursive: true });

      const testCase: TestCase = {
        id: "TC-022",
        name: "Check specify phase",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "phase-gate",
          featureDir: ".specify/specs/001-test",
          expectedPhase: "specify",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await phaseGateGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });
  });

  describe("section-present grader", () => {
    it("should pass when section content is present", async () => {
      const content = `# Feature

## Overview
This feature adds **user authentication** with OAuth2.

## Details
More information here.
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-030",
        name: "Check section content",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "section-present",
          file: "spec.md",
          section: "Overview",
          contains: "authentication",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await sectionPresentGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });

    it("should fail when expected content is missing", async () => {
      const content = `# Feature

## Overview
This is a simple overview.

## Details
More here.
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-031",
        name: "Check missing content",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "section-present",
          file: "spec.md",
          section: "Overview",
          contains: "authentication",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await sectionPresentGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("authentication");
    });

    it("should support regex patterns", async () => {
      const content = `# Feature

## Success Criteria
- SC-1: Response time < 200ms
- SC-2: Uptime > 99.9%
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-032",
        name: "Check regex pattern",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "section-present",
          file: "spec.md",
          section: "Success Criteria",
          pattern: "SC-\\d+:",
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await sectionPresentGrader.grade(testCase, context);

      expect(result.passed).toBe(true);
    });

    it("should check minimum content length", async () => {
      const content = `# Feature

## Overview
Short.

## Details
This is a much more detailed section with lots of content.
`;
      writeFileSync(join(TEST_DIR, "spec.md"), content);

      const testCase: TestCase = {
        id: "TC-033",
        name: "Check minimum length",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "section-present",
          file: "spec.md",
          section: "Overview",
          minLength: 50,
        },
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: TEST_DIR,
      };

      const result = await sectionPresentGrader.grade(testCase, context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("too short");
    });
  });
});
