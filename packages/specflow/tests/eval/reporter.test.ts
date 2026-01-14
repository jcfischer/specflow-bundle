/**
 * Tests for eval reporter and metrics
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  calculatePassAtK,
  calculatePassCaretK,
  generateMarkdownReport,
  generateJsonReport,
  type ReportData,
} from "../../src/lib/eval/reporter";
import {
  initEvalDatabase,
  closeEvalDatabase,
  addEvalRun,
  addEvalResult,
  addTestCase,
} from "../../src/lib/eval/database";

// Test directory
const TEST_DIR = "/tmp/specflow-reporter-test";
const DB_PATH = join(TEST_DIR, ".specflow", "evals.db");

describe("Eval Reporter", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, ".specflow"), { recursive: true });
    initEvalDatabase(DB_PATH);
  });

  afterEach(() => {
    closeEvalDatabase();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("calculatePassAtK", () => {
    it("should return 1.0 for all passing results", () => {
      // 3 runs, all passed
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
      ];

      const passAt1 = calculatePassAtK(results, 1);
      const passAt3 = calculatePassAtK(results, 3);

      expect(passAt1).toBe(1.0);
      expect(passAt3).toBe(1.0);
    });

    it("should return 0.0 for all failing results", () => {
      const results = [
        { passed: false },
        { passed: false },
        { passed: false },
      ];

      const passAt1 = calculatePassAtK(results, 1);
      const passAt3 = calculatePassAtK(results, 3);

      expect(passAt1).toBe(0.0);
      expect(passAt3).toBe(0.0);
    });

    it("should calculate probability correctly for mixed results", () => {
      // 2 pass, 1 fail out of 3 runs
      const results = [
        { passed: true },
        { passed: false },
        { passed: true },
      ];

      // pass@1 = 2/3 = 0.667
      const passAt1 = calculatePassAtK(results, 1);
      expect(passAt1).toBeCloseTo(0.667, 2);

      // pass@3 with 2/3 success rate
      // P(at least 1 success in 3 tries) = 1 - P(all fail)
      // = 1 - (1/3)^3 = 1 - 1/27 ≈ 0.963
      const passAt3 = calculatePassAtK(results, 3);
      expect(passAt3).toBeCloseTo(0.963, 2);
    });

    it("should handle k larger than sample size", () => {
      const results = [
        { passed: true },
        { passed: false },
      ];

      // With 50% success rate, pass@5 = 1 - 0.5^5 = 0.96875
      const passAt5 = calculatePassAtK(results, 5);
      expect(passAt5).toBeCloseTo(0.969, 2);
    });

    it("should return 0 for empty results", () => {
      const passAt1 = calculatePassAtK([], 1);
      expect(passAt1).toBe(0);
    });
  });

  describe("calculatePassCaretK", () => {
    it("should return 1.0 for all passing results", () => {
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
      ];

      const passCaret3 = calculatePassCaretK(results, 3);
      expect(passCaret3).toBe(1.0);
    });

    it("should return 0.0 for any failing result", () => {
      const results = [
        { passed: true },
        { passed: false },
        { passed: true },
      ];

      // pass^3 requires ALL 3 to pass
      // With 2/3 success rate: (2/3)^3 = 8/27 ≈ 0.296
      const passCaret3 = calculatePassCaretK(results, 3);
      expect(passCaret3).toBeCloseTo(0.296, 2);
    });

    it("should calculate consistency correctly", () => {
      // 4 pass, 1 fail = 80% success rate
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: false },
      ];

      // pass^5 = 0.8^5 = 0.32768
      const passCaret5 = calculatePassCaretK(results, 5);
      expect(passCaret5).toBeCloseTo(0.328, 2);
    });

    it("should return 0 for all failing results", () => {
      const results = [
        { passed: false },
        { passed: false },
      ];

      const passCaret2 = calculatePassCaretK(results, 2);
      expect(passCaret2).toBe(0);
    });
  });

  describe("generateMarkdownReport", () => {
    it("should generate valid markdown", () => {
      const data: ReportData = {
        runId: "run-001",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        suites: ["workflow"],
        totalTests: 5,
        passed: 4,
        failed: 1,
        skipped: 0,
        durationMs: 1500,
        passRate: 0.8,
        results: [
          {
            testCaseId: "TC-001",
            testCaseName: "Test 1",
            suite: "workflow",
            type: "positive",
            passed: true,
            score: null,
            durationMs: 100,
            output: "Passed",
            error: null,
          },
          {
            testCaseId: "TC-002",
            testCaseName: "Test 2",
            suite: "workflow",
            type: "positive",
            passed: false,
            score: null,
            durationMs: 50,
            output: null,
            error: "File not found",
          },
        ],
      };

      const markdown = generateMarkdownReport(data);

      expect(markdown).toContain("# Eval Report");
      expect(markdown).toContain("run-001");
      expect(markdown).toContain("80.0%");
      expect(markdown).toContain("TC-001");
      expect(markdown).toContain("TC-002");
      expect(markdown).toContain("✓"); // Passing indicator
      expect(markdown).toContain("✗"); // Failing indicator
    });

    it("should include pass@k metrics when provided", () => {
      const data: ReportData = {
        runId: "run-002",
        timestamp: new Date(),
        suites: ["workflow"],
        totalTests: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        durationMs: 1000,
        passRate: 0.667,
        passAtK: { 1: 0.667, 3: 0.963 },
        passCaretK: 0.296,
        results: [],
      };

      const markdown = generateMarkdownReport(data);

      expect(markdown).toContain("pass@1");
      expect(markdown).toContain("66.7%");
      expect(markdown).toContain("pass@3");
      expect(markdown).toContain("96.3%");
      expect(markdown).toContain("pass^3");
      expect(markdown).toContain("29.6%");
    });
  });

  describe("generateJsonReport", () => {
    it("should generate valid JSON", () => {
      const data: ReportData = {
        runId: "run-001",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        suites: ["workflow"],
        totalTests: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        durationMs: 500,
        passRate: 1.0,
        results: [],
      };

      const json = generateJsonReport(data);
      const parsed = JSON.parse(json);

      expect(parsed.runId).toBe("run-001");
      expect(parsed.summary.totalTests).toBe(2);
      expect(parsed.summary.passed).toBe(2);
      expect(parsed.summary.passRate).toBe(1.0);
    });

    it("should include exit code based on pass rate", () => {
      const passingData: ReportData = {
        runId: "run-pass",
        timestamp: new Date(),
        suites: [],
        totalTests: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        durationMs: 100,
        passRate: 1.0,
        results: [],
      };

      const failingData: ReportData = {
        runId: "run-fail",
        timestamp: new Date(),
        suites: [],
        totalTests: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        durationMs: 100,
        passRate: 0.5,
        results: [],
      };

      const passingJson = JSON.parse(generateJsonReport(passingData));
      const failingJson = JSON.parse(generateJsonReport(failingData));

      expect(passingJson.exitCode).toBe(0);
      expect(failingJson.exitCode).toBe(1);
    });
  });
});
