/**
 * Revise Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import type { ReviseCommandOptions } from "../../src/commands/revise";
import {
  ARTIFACT_FILES,
  ARTIFACT_DESCRIPTIONS,
  clearRevisionHistory,
  readArtifact,
  writeArtifact,
  createRevisionEntry,
  getRevisionHistory,
  buildRevisionPrompt,
  buildRevisionSummary,
} from "../../src/lib/revision";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PROJECT_PATH = "/tmp/specflow-revise-test";
const SPEC_PATH = join(TEST_PROJECT_PATH, ".specify", "specs", "f-001-test-feature");

const SAMPLE_SPEC = `# Feature: Test Feature

## Overview
This is a test feature.

## User Scenarios
- User can do X

## Functional Requirements
- FR-1: System shall do Y
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

// =============================================================================
// Tests
// =============================================================================

describe("Revise Command", () => {
  beforeEach(() => {
    cleanup();
    setupSpecPath();
  });

  afterEach(() => {
    cleanup();
  });

  // ===========================================================================
  // Options Tests
  // ===========================================================================

  describe("ReviseCommandOptions", () => {
    it("should support --spec flag", () => {
      const options: ReviseCommandOptions = { spec: true };
      expect(options.spec).toBe(true);
    });

    it("should support --plan flag", () => {
      const options: ReviseCommandOptions = { plan: true };
      expect(options.plan).toBe(true);
    });

    it("should support --tasks flag", () => {
      const options: ReviseCommandOptions = { tasks: true };
      expect(options.tasks).toBe(true);
    });

    it("should support --feedback option", () => {
      const options: ReviseCommandOptions = {
        spec: true,
        feedback: "Fix the acceptance criteria",
      };
      expect(options.feedback).toBe("Fix the acceptance criteria");
    });

    it("should support --dry-run flag", () => {
      const options: ReviseCommandOptions = {
        spec: true,
        dryRun: true,
      };
      expect(options.dryRun).toBe(true);
    });

    it("should support --history flag", () => {
      const options: ReviseCommandOptions = {
        history: true,
      };
      expect(options.history).toBe(true);
    });
  });

  // ===========================================================================
  // Artifact Integration Tests
  // ===========================================================================

  describe("Artifact reading", () => {
    it("should read spec artifact", () => {
      writeArtifact(SPEC_PATH, "spec", SAMPLE_SPEC);
      const content = readArtifact(SPEC_PATH, "spec");
      expect(content).toBe(SAMPLE_SPEC);
    });

    it("should read plan artifact", () => {
      const planContent = "# Technical Plan\n\nSome content";
      writeArtifact(SPEC_PATH, "plan", planContent);
      const content = readArtifact(SPEC_PATH, "plan");
      expect(content).toBe(planContent);
    });

    it("should read tasks artifact", () => {
      const tasksContent = "# Implementation Tasks\n\nTask list";
      writeArtifact(SPEC_PATH, "tasks", tasksContent);
      const content = readArtifact(SPEC_PATH, "tasks");
      expect(content).toBe(tasksContent);
    });
  });

  // ===========================================================================
  // Revision Entry Tests
  // ===========================================================================

  describe("Revision entry creation", () => {
    it("should create revision entry before modification", () => {
      writeArtifact(SPEC_PATH, "spec", SAMPLE_SPEC);

      const entry = createRevisionEntry(
        SPEC_PATH,
        "spec",
        "user_request",
        "Fix issues"
      );

      expect(entry).not.toBeNull();
      expect(entry?.previousContent).toBe(SAMPLE_SPEC);
      expect(entry?.reason).toBe("user_request");
    });

    it("should track multiple revisions", () => {
      writeArtifact(SPEC_PATH, "spec", SAMPLE_SPEC);

      createRevisionEntry(SPEC_PATH, "spec", "user_request", "First revision");
      writeArtifact(SPEC_PATH, "spec", "Modified content v1");

      createRevisionEntry(SPEC_PATH, "spec", "eval_feedback", "Second revision");
      writeArtifact(SPEC_PATH, "spec", "Modified content v2");

      const artifactPath = join(SPEC_PATH, ARTIFACT_FILES.spec);
      const history = getRevisionHistory(artifactPath);

      expect(history).toHaveLength(2);
      expect(history[0].previousContent).toBe(SAMPLE_SPEC);
      expect(history[1].previousContent).toBe("Modified content v1");
    });
  });

  // ===========================================================================
  // Prompt Building Tests
  // ===========================================================================

  describe("Revision prompt building", () => {
    it("should build prompt for spec revision", () => {
      const prompt = buildRevisionPrompt(
        SAMPLE_SPEC,
        "Add more specific acceptance criteria",
        "spec"
      );

      expect(prompt).toContain("specification");
      expect(prompt).toContain(SAMPLE_SPEC);
      expect(prompt).toContain("acceptance criteria");
    });

    it("should build prompt for plan revision", () => {
      const planContent = "# Technical Plan\n\nArchitecture here";
      const prompt = buildRevisionPrompt(
        planContent,
        "Add error handling strategy",
        "plan"
      );

      expect(prompt).toContain("plan");
      expect(prompt).toContain(planContent);
      expect(prompt).toContain("error handling");
    });

    it("should include preservation instructions", () => {
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, "Fix it", "spec");

      expect(prompt).toContain("Preserve");
      expect(prompt).toContain("core content");
    });

    it("should include improvement instructions", () => {
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, "Fix it", "spec");

      expect(prompt).toContain("Improve");
      expect(prompt).toContain("weak sections");
    });
  });

  // ===========================================================================
  // Summary Building Tests
  // ===========================================================================

  describe("Revision summary building", () => {
    it("should show line count changes", () => {
      const original = "Line 1\nLine 2";
      const revised = "Line 1\nLine 2\nLine 3\nLine 4";

      const summary = buildRevisionSummary(original, revised, "spec");

      expect(summary).toContain("2 lines");
      expect(summary).toContain("4 lines");
      expect(summary).toContain("+2");
    });

    it("should handle reductions", () => {
      const original = "Line 1\nLine 2\nLine 3\nLine 4";
      const revised = "Line 1\nLine 2";

      const summary = buildRevisionSummary(original, revised, "spec");

      expect(summary).toContain("-2");
    });

    it("should include artifact type", () => {
      const summary = buildRevisionSummary("content", "content", "plan");
      expect(summary).toContain("plan");
    });
  });

  // ===========================================================================
  // ARTIFACT_FILES Mapping Tests
  // ===========================================================================

  describe("Artifact file mapping", () => {
    it("should map spec to spec.md", () => {
      expect(ARTIFACT_FILES.spec).toBe("spec.md");
    });

    it("should map plan to plan.md", () => {
      expect(ARTIFACT_FILES.plan).toBe("plan.md");
    });

    it("should map tasks to tasks.md", () => {
      expect(ARTIFACT_FILES.tasks).toBe("tasks.md");
    });
  });

  // ===========================================================================
  // ARTIFACT_DESCRIPTIONS Tests
  // ===========================================================================

  describe("Artifact descriptions", () => {
    it("should describe spec as specification", () => {
      expect(ARTIFACT_DESCRIPTIONS.spec).toContain("specification");
    });

    it("should describe plan as implementation plan", () => {
      expect(ARTIFACT_DESCRIPTIONS.plan).toContain("plan");
    });

    it("should describe tasks as task breakdown", () => {
      expect(ARTIFACT_DESCRIPTIONS.tasks).toContain("task");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle empty feedback", () => {
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, "", "spec");
      expect(prompt).toContain(SAMPLE_SPEC);
    });

    it("should handle very long feedback", () => {
      const longFeedback = "Fix this issue. ".repeat(100);
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, longFeedback, "spec");
      expect(prompt).toContain(longFeedback);
    });

    it("should handle special characters in feedback", () => {
      const specialFeedback = "Fix: `code`, *bold*, <tag>";
      const prompt = buildRevisionPrompt(SAMPLE_SPEC, specialFeedback, "spec");
      expect(prompt).toContain(specialFeedback);
    });

    it("should return null entry for non-existent artifact", () => {
      const entry = createRevisionEntry(SPEC_PATH, "spec", "user_request");
      expect(entry).toBeNull();
    });
  });
});
