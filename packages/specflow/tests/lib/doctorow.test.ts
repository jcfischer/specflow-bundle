/**
 * Doctorow Gate Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  DoctorowCheck,
  DoctorowCheckResult,
  DoctorowResult,
  DOCTOROW_CHECKS,
  DOCTOROW_RESPONSES,
  parseResponse,
  formatCheckResult,
  formatVerifyEntry,
  appendToVerifyMd,
  isDoctorowVerified,
} from "../../src/lib/doctorow";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PROJECT_PATH = "/tmp/specflow-doctorow-test";
const SPEC_PATH = join(TEST_PROJECT_PATH, ".specify", "specs", "f-001-test-feature");

function cleanup(): void {
  if (existsSync(TEST_PROJECT_PATH)) {
    rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
}

function setupSpecPath(): void {
  mkdirSync(SPEC_PATH, { recursive: true });
}

// =============================================================================
// Tests
// =============================================================================

describe("Doctorow Gate Module", () => {
  beforeEach(() => {
    cleanup();
    setupSpecPath();
  });

  afterEach(() => {
    cleanup();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe("DOCTOROW_CHECKS", () => {
    it("should have exactly 4 checks", () => {
      expect(DOCTOROW_CHECKS).toHaveLength(4);
    });

    it("should include failure_test check", () => {
      const check = DOCTOROW_CHECKS.find(c => c.id === "failure_test");
      expect(check).toBeDefined();
      expect(check?.name).toBe("Failure Test");
      expect(check?.question).toContain("fails");
    });

    it("should include assumption_test check", () => {
      const check = DOCTOROW_CHECKS.find(c => c.id === "assumption_test");
      expect(check).toBeDefined();
      expect(check?.name).toBe("Assumption Test");
      expect(check?.question).toContain("assumptions");
    });

    it("should include rollback_test check", () => {
      const check = DOCTOROW_CHECKS.find(c => c.id === "rollback_test");
      expect(check).toBeDefined();
      expect(check?.name).toBe("Rollback Test");
      expect(check?.question).toContain("rolled back");
    });

    it("should include debt_recorded check", () => {
      const check = DOCTOROW_CHECKS.find(c => c.id === "debt_recorded");
      expect(check).toBeDefined();
      expect(check?.name).toBe("Technical Debt");
      expect(check?.question).toContain("debt");
    });

    it("should have required fields for all checks", () => {
      for (const check of DOCTOROW_CHECKS) {
        expect(check.id).toBeTruthy();
        expect(check.name).toBeTruthy();
        expect(check.question).toBeTruthy();
        expect(check.prompt).toBeTruthy();
      }
    });
  });

  describe("DOCTOROW_RESPONSES", () => {
    it("should have YES responses", () => {
      expect(DOCTOROW_RESPONSES.YES).toContain("y");
      expect(DOCTOROW_RESPONSES.YES).toContain("yes");
    });

    it("should have NO responses", () => {
      expect(DOCTOROW_RESPONSES.NO).toContain("n");
      expect(DOCTOROW_RESPONSES.NO).toContain("no");
    });

    it("should have SKIP responses", () => {
      expect(DOCTOROW_RESPONSES.SKIP).toContain("s");
      expect(DOCTOROW_RESPONSES.SKIP).toContain("skip");
    });
  });

  // ===========================================================================
  // parseResponse Tests
  // ===========================================================================

  describe("parseResponse", () => {
    it("should parse 'y' as yes", () => {
      expect(parseResponse("y")).toBe("yes");
      expect(parseResponse("Y")).toBe("yes");
    });

    it("should parse 'yes' as yes", () => {
      expect(parseResponse("yes")).toBe("yes");
      expect(parseResponse("YES")).toBe("yes");
      expect(parseResponse("Yes")).toBe("yes");
    });

    it("should parse 'n' as no", () => {
      expect(parseResponse("n")).toBe("no");
      expect(parseResponse("N")).toBe("no");
    });

    it("should parse 'no' as no", () => {
      expect(parseResponse("no")).toBe("no");
      expect(parseResponse("NO")).toBe("no");
    });

    it("should parse 's' as skip", () => {
      expect(parseResponse("s")).toBe("skip");
      expect(parseResponse("S")).toBe("skip");
    });

    it("should parse 'skip' as skip", () => {
      expect(parseResponse("skip")).toBe("skip");
      expect(parseResponse("SKIP")).toBe("skip");
    });

    it("should return null for invalid input", () => {
      expect(parseResponse("maybe")).toBeNull();
      expect(parseResponse("")).toBeNull();
      expect(parseResponse("nope")).toBeNull();
      expect(parseResponse("yep")).toBeNull();
    });

    it("should trim whitespace", () => {
      expect(parseResponse("  y  ")).toBe("yes");
      expect(parseResponse("\tn\t")).toBe("no");
      expect(parseResponse(" skip ")).toBe("skip");
    });
  });

  // ===========================================================================
  // formatCheckResult Tests
  // ===========================================================================

  describe("formatCheckResult", () => {
    it("should format confirmed result", () => {
      const result: DoctorowCheckResult = {
        checkId: "failure_test",
        confirmed: true,
        skipReason: null,
        timestamp: new Date(),
      };

      const formatted = formatCheckResult(result);
      expect(formatted).toContain("✓");
      expect(formatted).toContain("Failure Test");
      expect(formatted).toContain("Confirmed");
    });

    it("should format skipped result with reason", () => {
      const result: DoctorowCheckResult = {
        checkId: "assumption_test",
        confirmed: false,
        skipReason: "Will address in next sprint",
        timestamp: new Date(),
      };

      const formatted = formatCheckResult(result);
      expect(formatted).toContain("⊘");
      expect(formatted).toContain("Assumption Test");
      expect(formatted).toContain("Skipped");
      expect(formatted).toContain("Will address in next sprint");
    });

    it("should format not confirmed result", () => {
      const result: DoctorowCheckResult = {
        checkId: "rollback_test",
        confirmed: false,
        skipReason: null,
        timestamp: new Date(),
      };

      const formatted = formatCheckResult(result);
      expect(formatted).toContain("✗");
      expect(formatted).toContain("Rollback Test");
      expect(formatted).toContain("Not confirmed");
    });

    it("should handle unknown check ID", () => {
      const result: DoctorowCheckResult = {
        checkId: "unknown_check",
        confirmed: true,
        skipReason: null,
        timestamp: new Date(),
      };

      const formatted = formatCheckResult(result);
      expect(formatted).toContain("unknown_check");
    });
  });

  // ===========================================================================
  // formatVerifyEntry Tests
  // ===========================================================================

  describe("formatVerifyEntry", () => {
    it("should format entry with timestamp header", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "failure_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
      ];

      const entry = formatVerifyEntry(results);
      expect(entry).toContain("## Doctorow Gate Verification");
      expect(entry).toMatch(/\d{4}-\d{2}-\d{2}/); // ISO date
    });

    it("should format confirmed checks as checked", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "failure_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
      ];

      const entry = formatVerifyEntry(results);
      expect(entry).toContain("- [x] **Failure Test**: Confirmed");
    });

    it("should format skipped checks with reason", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "assumption_test",
          confirmed: false,
          skipReason: "Time constraint",
          timestamp: new Date(),
        },
      ];

      const entry = formatVerifyEntry(results);
      expect(entry).toContain("- [ ] **Assumption Test**: Skipped");
      expect(entry).toContain("Reason: Time constraint");
    });

    it("should format not confirmed checks", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "rollback_test",
          confirmed: false,
          skipReason: null,
          timestamp: new Date(),
        },
      ];

      const entry = formatVerifyEntry(results);
      expect(entry).toContain("- [ ] **Rollback Test**: Not confirmed");
    });

    it("should format multiple results", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "failure_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
        {
          checkId: "assumption_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
        {
          checkId: "rollback_test",
          confirmed: false,
          skipReason: "DB migration not reversible",
          timestamp: new Date(),
        },
        {
          checkId: "debt_recorded",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
      ];

      const entry = formatVerifyEntry(results);
      expect(entry).toContain("Failure Test");
      expect(entry).toContain("Assumption Test");
      expect(entry).toContain("Rollback Test");
      expect(entry).toContain("Technical Debt");
      expect(entry).toContain("DB migration not reversible");
    });
  });

  // ===========================================================================
  // appendToVerifyMd Tests
  // ===========================================================================

  describe("appendToVerifyMd", () => {
    it("should create verify.md if it doesn't exist", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "failure_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
      ];

      appendToVerifyMd(SPEC_PATH, results);

      const verifyPath = join(SPEC_PATH, "verify.md");
      expect(existsSync(verifyPath)).toBe(true);
    });

    it("should append to existing verify.md", () => {
      const verifyPath = join(SPEC_PATH, "verify.md");
      writeFileSync(verifyPath, "# Existing Content\n\nSome text here.\n");

      const results: DoctorowCheckResult[] = [
        {
          checkId: "failure_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
      ];

      appendToVerifyMd(SPEC_PATH, results);

      const content = readFileSync(verifyPath, "utf-8");
      expect(content).toContain("Existing Content");
      expect(content).toContain("Doctorow Gate Verification");
    });

    it("should include skipped check reasons", () => {
      const results: DoctorowCheckResult[] = [
        {
          checkId: "rollback_test",
          confirmed: false,
          skipReason: "Migration is one-way",
          timestamp: new Date(),
        },
      ];

      appendToVerifyMd(SPEC_PATH, results);

      const verifyPath = join(SPEC_PATH, "verify.md");
      const content = readFileSync(verifyPath, "utf-8");
      expect(content).toContain("Migration is one-way");
    });
  });

  // ===========================================================================
  // isDoctorowVerified Tests
  // ===========================================================================

  describe("isDoctorowVerified", () => {
    it("should return false if verify.md doesn't exist", () => {
      expect(isDoctorowVerified(SPEC_PATH)).toBe(false);
    });

    it("should return false if verify.md exists but has no Doctorow entry", () => {
      const verifyPath = join(SPEC_PATH, "verify.md");
      writeFileSync(verifyPath, "# Verification Log\n\nNo Doctorow here.\n");

      expect(isDoctorowVerified(SPEC_PATH)).toBe(false);
    });

    it("should return true if verify.md has Doctorow Gate entry", () => {
      const verifyPath = join(SPEC_PATH, "verify.md");
      writeFileSync(verifyPath, "# Verification Log\n\n## Doctorow Gate Verification - 2026-01-16\n\n- [x] Confirmed\n");

      expect(isDoctorowVerified(SPEC_PATH)).toBe(true);
    });
  });

  // ===========================================================================
  // Type Checking Tests
  // ===========================================================================

  describe("Type Definitions", () => {
    it("should allow creating DoctorowCheck objects", () => {
      const check: DoctorowCheck = {
        id: "custom_check",
        name: "Custom Check",
        question: "Did you do the thing?",
        prompt: "Consider: The thing is important.",
      };

      expect(check.id).toBe("custom_check");
    });

    it("should allow creating DoctorowCheckResult objects", () => {
      const result: DoctorowCheckResult = {
        checkId: "failure_test",
        confirmed: true,
        skipReason: null,
        timestamp: new Date(),
      };

      expect(result.confirmed).toBe(true);
    });

    it("should allow creating DoctorowResult objects", () => {
      const result: DoctorowResult = {
        passed: true,
        skipped: false,
        results: [],
      };

      expect(result.passed).toBe(true);
    });

    it("should allow creating failed DoctorowResult with failedCheck", () => {
      const result: DoctorowResult = {
        passed: false,
        skipped: false,
        failedCheck: "rollback_test",
        results: [
          {
            checkId: "failure_test",
            confirmed: true,
            skipReason: null,
            timestamp: new Date(),
          },
          {
            checkId: "rollback_test",
            confirmed: false,
            skipReason: null,
            timestamp: new Date(),
          },
        ],
      };

      expect(result.passed).toBe(false);
      expect(result.failedCheck).toBe("rollback_test");
    });
  });
});
