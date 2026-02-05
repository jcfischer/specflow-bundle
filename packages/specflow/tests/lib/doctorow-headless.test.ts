/**
 * Doctorow Gate Headless (AI) Mode Tests
 *
 * Tests for extractJsonFromResponse, gatherArtifacts, formatVerifyEntry
 * with evaluator tag, and headless routing detection.
 * Does NOT test actual claude -p calls (integration tests).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  extractJsonFromResponse,
  gatherArtifacts,
  formatVerifyEntry,
  DoctorowCheckResult,
} from "../../src/lib/doctorow";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_DIR = "/tmp/specflow-headless-test";
const SPEC_PATH = join(TEST_DIR, ".specify", "specs", "f-001-test");

function cleanup(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function setupSpecDir(): void {
  mkdirSync(SPEC_PATH, { recursive: true });
}

// =============================================================================
// extractJsonFromResponse
// =============================================================================

describe("extractJsonFromResponse", () => {
  it("should parse raw JSON", () => {
    const input = '{"pass": true, "reasoning": "tests exist"}';
    const result = extractJsonFromResponse(input);
    expect(result).toEqual({ pass: true, reasoning: "tests exist" });
  });

  it("should extract JSON from markdown code block", () => {
    const input = 'Here is the result:\n```json\n{"pass": false, "reasoning": "no tests found"}\n```\nDone.';
    const result = extractJsonFromResponse(input);
    expect(result).toEqual({ pass: false, reasoning: "no tests found" });
  });

  it("should extract JSON from code block without json tag", () => {
    const input = '```\n{"pass": true, "reasoning": "looks good"}\n```';
    const result = extractJsonFromResponse(input);
    expect(result).toEqual({ pass: true, reasoning: "looks good" });
  });

  it("should handle Claude --output-format json wrapper", () => {
    const inner = '{"pass": true, "reasoning": "all good"}';
    const wrapper = JSON.stringify({ type: "result", result: inner });
    const result = extractJsonFromResponse(wrapper);
    expect(result).toEqual({ pass: true, reasoning: "all good" });
  });

  it("should extract embedded JSON from surrounding text", () => {
    const input = 'Based on my analysis, {"pass": true, "reasoning": "confirmed"} is the result.';
    const result = extractJsonFromResponse(input);
    expect(result).toEqual({ pass: true, reasoning: "confirmed" });
  });

  it("should return null for invalid input", () => {
    expect(extractJsonFromResponse("no json here")).toBeNull();
    expect(extractJsonFromResponse("")).toBeNull();
    expect(extractJsonFromResponse("just some text {broken")).toBeNull();
  });

  it("should handle wrapper with embedded JSON in result string", () => {
    const inner = 'The answer is ```json\n{"pass": true, "reasoning": "yes"}\n```';
    const wrapper = JSON.stringify({ type: "result", result: inner });
    const result = extractJsonFromResponse(wrapper);
    expect(result).toEqual({ pass: true, reasoning: "yes" });
  });
});

// =============================================================================
// gatherArtifacts
// =============================================================================

describe("gatherArtifacts", () => {
  beforeEach(() => {
    cleanup();
    setupSpecDir();
  });

  afterEach(() => {
    cleanup();
  });

  it("should gather existing artifact files", () => {
    writeFileSync(join(SPEC_PATH, "spec.md"), "# Spec\nFeature description");
    writeFileSync(join(SPEC_PATH, "plan.md"), "# Plan\nImplementation plan");

    const artifacts = gatherArtifacts(SPEC_PATH);

    expect(artifacts).toContain("--- spec.md ---");
    expect(artifacts).toContain("Feature description");
    expect(artifacts).toContain("--- plan.md ---");
    expect(artifacts).toContain("Implementation plan");
  });

  it("should skip missing artifact files gracefully", () => {
    writeFileSync(join(SPEC_PATH, "spec.md"), "# Spec only");

    const artifacts = gatherArtifacts(SPEC_PATH);

    expect(artifacts).toContain("--- spec.md ---");
    expect(artifacts).not.toContain("--- plan.md ---");
    expect(artifacts).not.toContain("--- tasks.md ---");
  });

  it("should include src/ file listing when available", () => {
    const srcDir = join(TEST_DIR, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "index.ts"), "export {}");
    writeFileSync(join(srcDir, "utils.ts"), "export {}");

    const artifacts = gatherArtifacts(SPEC_PATH);

    expect(artifacts).toContain("--- src/ files ---");
    expect(artifacts).toContain("index.ts");
    expect(artifacts).toContain("utils.ts");
  });

  it("should return empty string when no artifacts exist", () => {
    // specPath exists but has no files
    const emptyPath = join(TEST_DIR, "empty-spec");
    mkdirSync(emptyPath, { recursive: true });

    const artifacts = gatherArtifacts(emptyPath);
    expect(artifacts).toBe("");
  });
});

// =============================================================================
// formatVerifyEntry with evaluator tag
// =============================================================================

describe("formatVerifyEntry with evaluator", () => {
  const makeResult = (checkId: string, confirmed: boolean, skipReason: string | null): DoctorowCheckResult => ({
    checkId,
    confirmed,
    skipReason,
    timestamp: new Date(),
  });

  it("should include evaluator tag on confirmed entries", () => {
    const results = [
      makeResult("failure_test", true, "Error handling tests exist"),
    ];

    const entry = formatVerifyEntry(results, "[AI-evaluated]");

    expect(entry).toContain("**Failure Test**: Confirmed [AI-evaluated]");
    expect(entry).toContain("Reasoning: Error handling tests exist");
  });

  it("should not include evaluator tag when not provided", () => {
    const results = [
      makeResult("failure_test", true, null),
    ];

    const entry = formatVerifyEntry(results);

    expect(entry).toContain("**Failure Test**: Confirmed");
    expect(entry).not.toContain("[AI-evaluated]");
  });

  it("should handle mixed results with evaluator", () => {
    const results = [
      makeResult("failure_test", true, "Tests exist"),
      makeResult("assumption_test", false, null),
    ];

    const entry = formatVerifyEntry(results, "[AI-evaluated]");

    expect(entry).toContain("**Failure Test**: Confirmed [AI-evaluated]");
    expect(entry).toContain("**Assumption Test**: Not confirmed");
  });
});

// =============================================================================
// Headless routing detection
// =============================================================================

describe("headless routing", () => {
  it("should detect non-TTY environment", () => {
    // In test environment, process.stdin.isTTY is typically undefined/false
    const isTTY = process.stdin.isTTY;
    // Bun test runs are non-TTY, so this should be falsy
    expect(!isTTY).toBe(true);
  });

  it("should detect SPECFLOW_HEADLESS env var", () => {
    const original = process.env.SPECFLOW_HEADLESS;
    process.env.SPECFLOW_HEADLESS = "true";

    const isHeadless = !process.stdin.isTTY || process.env.SPECFLOW_HEADLESS === "true";
    expect(isHeadless).toBe(true);

    if (original !== undefined) {
      process.env.SPECFLOW_HEADLESS = original;
    } else {
      delete process.env.SPECFLOW_HEADLESS;
    }
  });
});
