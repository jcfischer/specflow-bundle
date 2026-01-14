/**
 * Tests for eval runner
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import {
  runEvals,
  type EvalRunnerOptions,
  type EvalRunnerResult,
} from "../../src/lib/eval/runner";
import {
  initEvalDatabase,
  closeEvalDatabase,
  addTestCase,
  getEvalRun,
  getEvalResults,
} from "../../src/lib/eval/database";
import { registerCodeGraders } from "../../src/lib/eval/graders/code-based";

// Test directories
const TEST_DIR = "/tmp/specflow-runner-test";
const PROJECT_DIR = join(TEST_DIR, "project");
const DB_PATH = join(TEST_DIR, ".specflow", "evals.db");

describe("Eval Runner", () => {
  beforeEach(() => {
    // Clean up and recreate test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, ".specflow"), { recursive: true });
    mkdirSync(PROJECT_DIR, { recursive: true });

    // Initialize database
    initEvalDatabase(DB_PATH);

    // Register graders
    registerCodeGraders();
  });

  afterEach(() => {
    closeEvalDatabase();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("runEvals", () => {
    it("should run all test cases and return results", async () => {
      // Create a test file
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      // Add test case
      addTestCase({
        id: "TC-001",
        name: "Check spec exists",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      expect(result.totalTests).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.runId).toBeDefined();
    });

    it("should track failed tests", async () => {
      // Don't create the file - test should fail
      addTestCase({
        id: "TC-001",
        name: "Check missing file",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "missing.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      expect(result.totalTests).toBe(1);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("should save run to database", async () => {
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      addTestCase({
        id: "TC-001",
        name: "Test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      const savedRun = getEvalRun(result.runId);

      expect(savedRun).not.toBeNull();
      expect(savedRun?.totalTests).toBe(1);
      expect(savedRun?.passed).toBe(1);
    });

    it("should save individual results to database", async () => {
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      addTestCase({
        id: "TC-001",
        name: "Test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      const savedResults = getEvalResults(result.runId);

      expect(savedResults).toHaveLength(1);
      expect(savedResults[0].testCaseId).toBe("TC-001");
      expect(savedResults[0].passed).toBe(true);
    });

    it("should filter by suite", async () => {
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      addTestCase({
        id: "TC-001",
        name: "Workflow test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      addTestCase({
        id: "TC-002",
        name: "Quality test",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
        suites: ["workflow"],
      });

      expect(result.totalTests).toBe(1);
      expect(result.suites).toEqual(["workflow"]);
    });

    it("should run multiple suites", async () => {
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      addTestCase({
        id: "TC-001",
        name: "Workflow test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      addTestCase({
        id: "TC-002",
        name: "Quality test",
        suite: "spec-quality",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      addTestCase({
        id: "TC-003",
        name: "Other test",
        suite: "other",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
        suites: ["workflow", "spec-quality"],
      });

      expect(result.totalTests).toBe(2);
      expect(result.suites).toContain("workflow");
      expect(result.suites).toContain("spec-quality");
    });

    it("should return detailed results", async () => {
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      addTestCase({
        id: "TC-001",
        name: "Test 1",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      addTestCase({
        id: "TC-002",
        name: "Test 2",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "missing.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      expect(result.results).toHaveLength(2);
      expect(result.results.find(r => r.testCaseId === "TC-001")?.passed).toBe(true);
      expect(result.results.find(r => r.testCaseId === "TC-002")?.passed).toBe(false);
    });

    it("should handle negative test cases correctly", async () => {
      // Negative test: expects grader to FAIL
      // If grader fails -> test passes (expected behavior)
      // If grader passes -> test fails (unexpected behavior)

      addTestCase({
        id: "TC-001",
        name: "Missing file should fail",
        suite: "workflow",
        type: "negative", // Expect failure
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "should-not-exist.md",
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      // Grader fails (file doesn't exist) -> negative test passes
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it("should fail negative test when grader unexpectedly passes", async () => {
      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      addTestCase({
        id: "TC-001",
        name: "Should not find spec",
        suite: "workflow",
        type: "negative", // Expect failure
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md", // But it exists!
        },
      });

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      // Grader passes (file exists) -> negative test fails
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("should skip model graders when skipModel is true", async () => {
      addTestCase({
        id: "TC-001",
        name: "Code test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {
          grader: "file-exists",
          path: "spec.md",
        },
      });

      addTestCase({
        id: "TC-002",
        name: "Model test",
        suite: "spec-quality",
        type: "positive",
        graderType: "model",
        graderConfig: {
          grader: "model",
        },
      });

      writeFileSync(join(PROJECT_DIR, "spec.md"), "# Spec");

      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
        skipModel: true,
      });

      expect(result.totalTests).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it("should handle empty test suite", async () => {
      const result = await runEvals({
        projectPath: PROJECT_DIR,
        dbPath: DB_PATH,
      });

      expect(result.totalTests).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
