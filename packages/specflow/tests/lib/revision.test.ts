/**
 * Revision Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  ArtifactType,
  RevisionReason,
  RevisionHistory,
  RevisionResult,
  RevisionOptions,
  ARTIFACT_FILES,
  ARTIFACT_DESCRIPTIONS,
  clearRevisionHistory,
  createRevisionId,
  getArtifactPath,
  artifactExists,
  readArtifact,
  writeArtifact,
  saveRevisionHistory,
  getRevisionHistory,
  getAllRevisionHistory,
  getRevisionById,
  buildRevisionPrompt,
  buildRevisionSummary,
  createRevisionEntry,
  restoreFromRevision,
  formatRevisionHistory,
} from "../../src/lib/revision";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PROJECT_PATH = "/tmp/specflow-revision-test";
const SPEC_PATH = join(TEST_PROJECT_PATH, ".specify", "specs", "f-001-test-feature");

const SAMPLE_SPEC = `# Feature: Test Feature

## Overview
This is a test feature.

## User Scenarios
- User can do X

## Functional Requirements
- FR-1: System shall do Y
`;

const SAMPLE_PLAN = `# Technical Plan

## Architecture
Component A -> Component B

## Tasks
1. Create component A
2. Create component B
`;

function cleanup(): void {
  if (existsSync(TEST_PROJECT_PATH)) {
    rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
  clearRevisionHistory();
}

function setupSpecPath(): void {
  mkdirSync(SPEC_PATH, { recursive: true });
}

function createArtifact(type: ArtifactType, content: string): void {
  const path = getArtifactPath(SPEC_PATH, type);
  writeFileSync(path, content);
}

// =============================================================================
// Tests
// =============================================================================

describe("Revision Module", () => {
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

  describe("ARTIFACT_FILES", () => {
    it("should have spec mapping", () => {
      expect(ARTIFACT_FILES.spec).toBe("spec.md");
    });

    it("should have plan mapping", () => {
      expect(ARTIFACT_FILES.plan).toBe("plan.md");
    });

    it("should have tasks mapping", () => {
      expect(ARTIFACT_FILES.tasks).toBe("tasks.md");
    });
  });

  describe("ARTIFACT_DESCRIPTIONS", () => {
    it("should have spec description", () => {
      expect(ARTIFACT_DESCRIPTIONS.spec).toContain("specification");
    });

    it("should have plan description", () => {
      expect(ARTIFACT_DESCRIPTIONS.plan).toContain("plan");
    });

    it("should have tasks description", () => {
      expect(ARTIFACT_DESCRIPTIONS.tasks).toContain("task");
    });
  });

  // ===========================================================================
  // Helper Functions Tests
  // ===========================================================================

  describe("createRevisionId", () => {
    it("should create unique IDs", () => {
      const id1 = createRevisionId();
      const id2 = createRevisionId();

      expect(id1).not.toBe(id2);
    });

    it("should create UUID format", () => {
      const id = createRevisionId();

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });
  });

  describe("getArtifactPath", () => {
    it("should return correct path for spec", () => {
      const path = getArtifactPath(SPEC_PATH, "spec");
      expect(path).toBe(`${SPEC_PATH}/spec.md`);
    });

    it("should return correct path for plan", () => {
      const path = getArtifactPath(SPEC_PATH, "plan");
      expect(path).toBe(`${SPEC_PATH}/plan.md`);
    });

    it("should return correct path for tasks", () => {
      const path = getArtifactPath(SPEC_PATH, "tasks");
      expect(path).toBe(`${SPEC_PATH}/tasks.md`);
    });
  });

  describe("artifactExists", () => {
    it("should return false when artifact doesn't exist", () => {
      expect(artifactExists(SPEC_PATH, "spec")).toBe(false);
    });

    it("should return true when artifact exists", () => {
      createArtifact("spec", SAMPLE_SPEC);
      expect(artifactExists(SPEC_PATH, "spec")).toBe(true);
    });
  });

  describe("readArtifact", () => {
    it("should return null for non-existent artifact", () => {
      const content = readArtifact(SPEC_PATH, "spec");
      expect(content).toBeNull();
    });

    it("should return content for existing artifact", () => {
      createArtifact("spec", SAMPLE_SPEC);
      const content = readArtifact(SPEC_PATH, "spec");
      expect(content).toBe(SAMPLE_SPEC);
    });
  });

  describe("writeArtifact", () => {
    it("should write artifact content", () => {
      writeArtifact(SPEC_PATH, "plan", SAMPLE_PLAN);

      const path = getArtifactPath(SPEC_PATH, "plan");
      const content = readFileSync(path, "utf-8");
      expect(content).toBe(SAMPLE_PLAN);
    });

    it("should overwrite existing artifact", () => {
      writeArtifact(SPEC_PATH, "spec", "Original content");
      writeArtifact(SPEC_PATH, "spec", "New content");

      const content = readArtifact(SPEC_PATH, "spec");
      expect(content).toBe("New content");
    });
  });

  // ===========================================================================
  // Revision History Tests
  // ===========================================================================

  describe("saveRevisionHistory", () => {
    it("should save revision entry", () => {
      const entry: RevisionHistory = {
        id: createRevisionId(),
        artifactPath: `${SPEC_PATH}/spec.md`,
        previousContent: SAMPLE_SPEC,
        timestamp: new Date(),
        reason: "user_request",
      };

      saveRevisionHistory(entry);

      const history = getAllRevisionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(entry.id);
    });
  });

  describe("getRevisionHistory", () => {
    it("should return empty array for no history", () => {
      const history = getRevisionHistory(`${SPEC_PATH}/spec.md`);
      expect(history).toHaveLength(0);
    });

    it("should return history for specific artifact", () => {
      const specEntry: RevisionHistory = {
        id: createRevisionId(),
        artifactPath: `${SPEC_PATH}/spec.md`,
        previousContent: "spec content",
        timestamp: new Date(),
        reason: "eval_feedback",
      };

      const planEntry: RevisionHistory = {
        id: createRevisionId(),
        artifactPath: `${SPEC_PATH}/plan.md`,
        previousContent: "plan content",
        timestamp: new Date(),
        reason: "user_request",
      };

      saveRevisionHistory(specEntry);
      saveRevisionHistory(planEntry);

      const specHistory = getRevisionHistory(`${SPEC_PATH}/spec.md`);
      expect(specHistory).toHaveLength(1);
      expect(specHistory[0].id).toBe(specEntry.id);
    });
  });

  describe("getRevisionById", () => {
    it("should return undefined for non-existent ID", () => {
      const revision = getRevisionById("non-existent-id");
      expect(revision).toBeUndefined();
    });

    it("should return revision by ID", () => {
      const entry: RevisionHistory = {
        id: createRevisionId(),
        artifactPath: `${SPEC_PATH}/spec.md`,
        previousContent: SAMPLE_SPEC,
        timestamp: new Date(),
        reason: "user_request",
      };

      saveRevisionHistory(entry);

      const revision = getRevisionById(entry.id);
      expect(revision).toBeDefined();
      expect(revision?.id).toBe(entry.id);
    });
  });

  // ===========================================================================
  // Prompt Building Tests
  // ===========================================================================

  describe("buildRevisionPrompt", () => {
    it("should include content in prompt", () => {
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, "Fix the issues", "spec");
      expect(prompt).toContain(SAMPLE_SPEC);
    });

    it("should include feedback in prompt", () => {
      const feedback = "FR-1 lacks testable criteria";
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, feedback, "spec");
      expect(prompt).toContain(feedback);
    });

    it("should include artifact type description", () => {
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, "Fix it", "spec");
      expect(prompt).toContain("specification");
    });

    it("should include preservation instructions", () => {
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, "Fix it", "spec");
      expect(prompt).toContain("Preserve");
      expect(prompt).toContain("Improve");
      expect(prompt).toContain("Maintain");
    });
  });

  describe("buildRevisionSummary", () => {
    it("should show line counts", () => {
      const original = "Line 1\nLine 2\nLine 3";
      const revised = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";

      const summary = buildRevisionSummary(original, revised, "spec");

      expect(summary).toContain("3 lines");
      expect(summary).toContain("5 lines");
    });

    it("should show positive diff", () => {
      const original = "Line 1";
      const revised = "Line 1\nLine 2\nLine 3";

      const summary = buildRevisionSummary(original, revised, "spec");

      expect(summary).toContain("+2");
    });

    it("should show negative diff", () => {
      const original = "Line 1\nLine 2\nLine 3";
      const revised = "Line 1";

      const summary = buildRevisionSummary(original, revised, "spec");

      expect(summary).toContain("-2");
    });
  });

  // ===========================================================================
  // Main Functions Tests
  // ===========================================================================

  describe("createRevisionEntry", () => {
    it("should return null for non-existent artifact", () => {
      const entry = createRevisionEntry(SPEC_PATH, "spec", "user_request");
      expect(entry).toBeNull();
    });

    it("should create entry for existing artifact", () => {
      createArtifact("spec", SAMPLE_SPEC);

      const entry = createRevisionEntry(SPEC_PATH, "spec", "eval_feedback", "Fix issues");

      expect(entry).not.toBeNull();
      expect(entry?.previousContent).toBe(SAMPLE_SPEC);
      expect(entry?.reason).toBe("eval_feedback");
      expect(entry?.feedback).toBe("Fix issues");
    });

    it("should save entry to history", () => {
      createArtifact("spec", SAMPLE_SPEC);

      const entry = createRevisionEntry(SPEC_PATH, "spec", "user_request");

      const history = getAllRevisionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(entry!.id);
    });
  });

  describe("restoreFromRevision", () => {
    it("should return false for non-existent revision", () => {
      const result = restoreFromRevision("non-existent-id");
      expect(result).toBe(false);
    });

    it("should restore content from revision", () => {
      createArtifact("spec", SAMPLE_SPEC);
      const entry = createRevisionEntry(SPEC_PATH, "spec", "user_request");

      // Modify the artifact
      writeArtifact(SPEC_PATH, "spec", "Modified content");

      // Restore from revision
      const result = restoreFromRevision(entry!.id);

      expect(result).toBe(true);
      const content = readArtifact(SPEC_PATH, "spec");
      expect(content).toBe(SAMPLE_SPEC);
    });
  });

  describe("formatRevisionHistory", () => {
    it("should return message for empty history", () => {
      const formatted = formatRevisionHistory([]);
      expect(formatted).toContain("No revision history");
    });

    it("should format history entries", () => {
      const entry: RevisionHistory = {
        id: "12345678-1234-1234-1234-123456789012",
        artifactPath: `${SPEC_PATH}/spec.md`,
        previousContent: SAMPLE_SPEC,
        timestamp: new Date("2026-01-15T10:30:00Z"),
        reason: "eval_feedback",
        feedback: "Fix the acceptance criteria to be more specific",
      };

      const formatted = formatRevisionHistory([entry]);

      expect(formatted).toContain("Revision History:");
      expect(formatted).toContain("12345678");
      expect(formatted).toContain("2026-01-15");
      expect(formatted).toContain("Eval feedback");
      expect(formatted).toContain("acceptance criteria");
    });
  });

  // ===========================================================================
  // Type Tests
  // ===========================================================================

  describe("Type Definitions", () => {
    it("should allow valid ArtifactType values", () => {
      const types: ArtifactType[] = ["spec", "plan", "tasks"];
      expect(types).toHaveLength(3);
    });

    it("should allow valid RevisionReason values", () => {
      const reasons: RevisionReason[] = ["eval_feedback", "user_request"];
      expect(reasons).toHaveLength(2);
    });

    it("should allow creating RevisionHistory objects", () => {
      const history: RevisionHistory = {
        id: "test-id",
        artifactPath: "/path/to/spec.md",
        previousContent: "content",
        timestamp: new Date(),
        reason: "user_request",
        feedback: "optional feedback",
      };

      expect(history.id).toBe("test-id");
      expect(history.feedback ?? "").toBe("optional feedback");
    });

    it("should allow creating RevisionResult objects", () => {
      const result: RevisionResult = {
        success: true,
        artifactPath: "/path/to/spec.md",
        evalScore: 0.85,
        evalPassed: true,
        revisionId: "rev-123",
      };

      expect(result.success).toBe(true);
      expect(result.evalScore).toBe(0.85);
    });

    it("should allow creating RevisionOptions objects", () => {
      const options: RevisionOptions = {
        feedback: "Custom feedback",
        runEval: true,
        dryRun: false,
      };

      expect(options.feedback).toBe("Custom feedback");
      expect(options.runEval).toBe(true);
    });
  });
});
