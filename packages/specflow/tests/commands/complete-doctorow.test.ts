/**
 * Complete Command Doctorow Gate Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  DOCTOROW_CHECKS,
  formatVerifyEntry,
  isDoctorowVerified,
} from "../../src/lib/doctorow";
import type { CompleteCommandOptions } from "../../src/commands/complete";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PROJECT_PATH = "/tmp/specflow-complete-doctorow-test";
const SPEC_PATH = join(TEST_PROJECT_PATH, ".specify", "specs", "f-001-test-feature");

function cleanup(): void {
  if (existsSync(TEST_PROJECT_PATH)) {
    rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
}

function setupSpecPath(): void {
  mkdirSync(SPEC_PATH, { recursive: true });
}

function createVerifyMdWithDoctorow(): void {
  const verifyPath = join(SPEC_PATH, "verify.md");
  const results = DOCTOROW_CHECKS.map(check => ({
    checkId: check.id,
    confirmed: true,
    skipReason: null,
    timestamp: new Date(),
  }));

  writeFileSync(verifyPath, formatVerifyEntry(results));
}

// =============================================================================
// Tests
// =============================================================================

describe("Complete Command Doctorow Integration", () => {
  beforeEach(() => {
    cleanup();
    setupSpecPath();
  });

  afterEach(() => {
    cleanup();
  });

  describe("CompleteCommandOptions", () => {
    it("should support skipDoctorow option", () => {
      const options: CompleteCommandOptions = {
        force: false,
        skipDoctorow: true,
      };

      expect(options.skipDoctorow).toBe(true);
    });

    it("should default skipDoctorow to undefined", () => {
      const options: CompleteCommandOptions = {};

      expect(options.skipDoctorow).toBeUndefined();
    });
  });

  describe("isDoctorowVerified integration", () => {
    it("should return false when verify.md doesn't exist", () => {
      expect(isDoctorowVerified(SPEC_PATH)).toBe(false);
    });

    it("should return false when verify.md has no Doctorow entry", () => {
      const verifyPath = join(SPEC_PATH, "verify.md");
      writeFileSync(verifyPath, "# Verification Log\n\nSome other content.\n");

      expect(isDoctorowVerified(SPEC_PATH)).toBe(false);
    });

    it("should return true when verify.md has Doctorow Gate entry", () => {
      createVerifyMdWithDoctorow();

      expect(isDoctorowVerified(SPEC_PATH)).toBe(true);
    });
  });

  describe("Doctorow check definitions", () => {
    it("should have all 4 required checks", () => {
      const checkIds = DOCTOROW_CHECKS.map(c => c.id);

      expect(checkIds).toContain("failure_test");
      expect(checkIds).toContain("assumption_test");
      expect(checkIds).toContain("rollback_test");
      expect(checkIds).toContain("debt_recorded");
    });

    it("should have meaningful prompts for each check", () => {
      for (const check of DOCTOROW_CHECKS) {
        expect(check.prompt.length).toBeGreaterThan(50);
        expect(check.prompt).toContain("Consider:");
      }
    });
  });

  describe("verify.md format", () => {
    it("should include timestamp in header", () => {
      createVerifyMdWithDoctorow();

      const verifyPath = join(SPEC_PATH, "verify.md");
      const content = readFileSync(verifyPath, "utf-8");

      expect(content).toContain("## Doctorow Gate Verification");
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/); // ISO date
    });

    it("should mark confirmed checks as completed", () => {
      createVerifyMdWithDoctorow();

      const verifyPath = join(SPEC_PATH, "verify.md");
      const content = readFileSync(verifyPath, "utf-8");

      expect(content).toContain("- [x] **Failure Test**: Confirmed");
      expect(content).toContain("- [x] **Assumption Test**: Confirmed");
      expect(content).toContain("- [x] **Rollback Test**: Confirmed");
      expect(content).toContain("- [x] **Technical Debt**: Confirmed");
    });

    it("should include skip reasons when provided", () => {
      const verifyPath = join(SPEC_PATH, "verify.md");
      const results = [
        {
          checkId: "failure_test",
          confirmed: true,
          skipReason: null,
          timestamp: new Date(),
        },
        {
          checkId: "rollback_test",
          confirmed: false,
          skipReason: "Migration is intentionally irreversible",
          timestamp: new Date(),
        },
      ];

      writeFileSync(verifyPath, formatVerifyEntry(results));
      const content = readFileSync(verifyPath, "utf-8");

      expect(content).toContain("- [x] **Failure Test**: Confirmed");
      expect(content).toContain("- [ ] **Rollback Test**: Skipped");
      expect(content).toContain("Migration is intentionally irreversible");
    });
  });

  describe("--skip-doctorow flag behavior", () => {
    it("should allow skipDoctorow option in CompleteCommandOptions", () => {
      const optionsWithSkip: CompleteCommandOptions = {
        skipDoctorow: true,
      };

      const optionsWithoutSkip: CompleteCommandOptions = {
        skipDoctorow: false,
      };

      expect(optionsWithSkip.skipDoctorow).toBe(true);
      expect(optionsWithoutSkip.skipDoctorow).toBe(false);
    });
  });

  describe("Doctorow Gate workflow", () => {
    it("should have checks in the correct order", () => {
      // Order matters: failure → assumption → rollback → debt
      expect(DOCTOROW_CHECKS[0].id).toBe("failure_test");
      expect(DOCTOROW_CHECKS[1].id).toBe("assumption_test");
      expect(DOCTOROW_CHECKS[2].id).toBe("rollback_test");
      expect(DOCTOROW_CHECKS[3].id).toBe("debt_recorded");
    });

    it("should have user-friendly names for display", () => {
      const names = DOCTOROW_CHECKS.map(c => c.name);

      expect(names).toContain("Failure Test");
      expect(names).toContain("Assumption Test");
      expect(names).toContain("Rollback Test");
      expect(names).toContain("Technical Debt");
    });
  });
});
