/**
 * Tests for eval database operations
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import {
  initEvalDatabase,
  closeEvalDatabase,
  getEvalDbPath,
  addTestCase,
  getTestCase,
  getTestCases,
  getTestCasesBySuite,
  deleteTestCase,
  addEvalRun,
  getEvalRun,
  getEvalRuns,
  addEvalResult,
  getEvalResults,
  getTestCaseBalance,
} from "../../src/lib/eval/database";
import type { TestCase, EvalResult, EvalRun } from "../../src/lib/eval/types";

// Test in a temporary directory
const TEST_DIR = "/tmp/specflow-eval-test";
const TEST_DB_PATH = join(TEST_DIR, ".specflow", "evals.db");

describe("Eval Database", () => {
  beforeEach(() => {
    // Clean up and recreate test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, ".specflow"), { recursive: true });

    // Initialize database
    initEvalDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    closeEvalDatabase();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("getEvalDbPath", () => {
    it("should return path in .specflow directory", () => {
      const path = getEvalDbPath(TEST_DIR);
      expect(path).toBe(join(TEST_DIR, ".specflow", "evals.db"));
    });
  });

  describe("Test Cases", () => {
    it("should add and retrieve a test case", () => {
      const input = {
        id: "TC-001",
        name: "Test workflow compliance",
        suite: "workflow",
        type: "positive" as const,
        graderType: "code" as const,
        graderConfig: { checkType: "file-exists" },
      };

      addTestCase(input);
      const result = getTestCase("TC-001");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("TC-001");
      expect(result?.name).toBe("Test workflow compliance");
      expect(result?.suite).toBe("workflow");
      expect(result?.type).toBe("positive");
      expect(result?.graderType).toBe("code");
      expect(result?.graderConfig).toEqual({ checkType: "file-exists" });
      expect(result?.createdAt).toBeInstanceOf(Date);
    });

    it("should add test case with optional fields", () => {
      const input = {
        id: "TC-002",
        name: "Phase gate violation",
        suite: "workflow",
        type: "negative" as const,
        graderType: "code" as const,
        prompt: "Skip to implementation",
        expectedBehavior: "Should fail with error",
        graderConfig: { checkType: "phase-gate" },
      };

      addTestCase(input);
      const result = getTestCase("TC-002");

      expect(result?.prompt).toBe("Skip to implementation");
      expect(result?.expectedBehavior).toBe("Should fail with error");
    });

    it("should get all test cases", () => {
      addTestCase({
        id: "TC-001",
        name: "Test 1",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {},
      });
      addTestCase({
        id: "TC-002",
        name: "Test 2",
        suite: "spec-quality",
        type: "positive",
        graderType: "model",
        graderConfig: {},
      });

      const results = getTestCases();

      expect(results).toHaveLength(2);
    });

    it("should get test cases by suite", () => {
      addTestCase({
        id: "TC-001",
        name: "Workflow test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {},
      });
      addTestCase({
        id: "TC-002",
        name: "Quality test",
        suite: "spec-quality",
        type: "positive",
        graderType: "model",
        graderConfig: {},
      });
      addTestCase({
        id: "TC-003",
        name: "Another workflow",
        suite: "workflow",
        type: "negative",
        graderType: "code",
        graderConfig: {},
      });

      const workflowTests = getTestCasesBySuite("workflow");

      expect(workflowTests).toHaveLength(2);
      expect(workflowTests.every(t => t.suite === "workflow")).toBe(true);
    });

    it("should delete a test case", () => {
      addTestCase({
        id: "TC-001",
        name: "To delete",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {},
      });

      expect(getTestCase("TC-001")).not.toBeNull();

      deleteTestCase("TC-001");

      expect(getTestCase("TC-001")).toBeNull();
    });

    it("should return null for non-existent test case", () => {
      const result = getTestCase("non-existent");
      expect(result).toBeNull();
    });

    it("should track positive/negative balance", () => {
      addTestCase({
        id: "TC-001",
        name: "Positive 1",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {},
      });
      addTestCase({
        id: "TC-002",
        name: "Positive 2",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {},
      });
      addTestCase({
        id: "TC-003",
        name: "Negative 1",
        suite: "workflow",
        type: "negative",
        graderType: "code",
        graderConfig: {},
      });

      const balance = getTestCaseBalance();

      expect(balance.positive).toBe(2);
      expect(balance.negative).toBe(1);
      expect(balance.total).toBe(3);
      expect(balance.ratio).toBeCloseTo(0.67, 1); // 2/3 positive
    });
  });

  describe("Eval Runs", () => {
    it("should add and retrieve an eval run", () => {
      const input = {
        id: "run-001",
        suites: ["workflow", "spec-quality"],
        totalTests: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        durationMs: 5000,
      };

      addEvalRun(input);
      const result = getEvalRun("run-001");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("run-001");
      expect(result?.suites).toEqual(["workflow", "spec-quality"]);
      expect(result?.totalTests).toBe(10);
      expect(result?.passed).toBe(8);
      expect(result?.failed).toBe(2);
      expect(result?.timestamp).toBeInstanceOf(Date);
    });

    it("should add run with pass@k metrics", () => {
      const input = {
        id: "run-002",
        suites: ["workflow"],
        totalTests: 5,
        passed: 4,
        failed: 1,
        skipped: 0,
        durationMs: 3000,
        passAtK: { 1: 0.8, 3: 0.95 },
        passCaretK: 0.75,
      };

      addEvalRun(input);
      const result = getEvalRun("run-002");

      expect(result?.passAtK).toEqual({ 1: 0.8, 3: 0.95 });
      expect(result?.passCaretK).toBe(0.75);
    });

    it("should get recent eval runs", () => {
      addEvalRun({
        id: "run-001",
        suites: ["workflow"],
        totalTests: 5,
        passed: 5,
        failed: 0,
        skipped: 0,
        durationMs: 1000,
      });
      addEvalRun({
        id: "run-002",
        suites: ["spec-quality"],
        totalTests: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        durationMs: 2000,
      });

      const runs = getEvalRuns(10);

      expect(runs).toHaveLength(2);
      // Should be ordered by timestamp desc (most recent first)
    });

    it("should return null for non-existent run", () => {
      const result = getEvalRun("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("Eval Results", () => {
    beforeEach(() => {
      // Add prerequisite test case and run
      addTestCase({
        id: "TC-001",
        name: "Test",
        suite: "workflow",
        type: "positive",
        graderType: "code",
        graderConfig: {},
      });
      addEvalRun({
        id: "run-001",
        suites: ["workflow"],
        totalTests: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        durationMs: 100,
      });
    });

    it("should add and retrieve eval results", () => {
      const input = {
        id: "result-001",
        runId: "run-001",
        testCaseId: "TC-001",
        passed: true,
        score: null,
        durationMs: 50,
        rawOutput: "File exists",
        error: null,
      };

      addEvalResult(input);
      const results = getEvalResults("run-001");

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("result-001");
      expect(results[0].passed).toBe(true);
      expect(results[0].rawOutput).toBe("File exists");
    });

    it("should add result with score (model grader)", () => {
      const input = {
        id: "result-002",
        runId: "run-001",
        testCaseId: "TC-001",
        passed: true,
        score: 0.85,
        durationMs: 2500,
        rawOutput: "Quality score: 0.85",
        error: null,
      };

      addEvalResult(input);
      const results = getEvalResults("run-001");

      expect(results[0].score).toBe(0.85);
    });

    it("should add failing result with error", () => {
      const input = {
        id: "result-003",
        runId: "run-001",
        testCaseId: "TC-001",
        passed: false,
        score: null,
        durationMs: 30,
        rawOutput: null,
        error: "File not found",
      };

      addEvalResult(input);
      const results = getEvalResults("run-001");

      expect(results[0].passed).toBe(false);
      expect(results[0].error).toBe("File not found");
    });

    it("should return empty array for run with no results", () => {
      const results = getEvalResults("run-001");
      expect(results).toHaveLength(0);
    });
  });
});
