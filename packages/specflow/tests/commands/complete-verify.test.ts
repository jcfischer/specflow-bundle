/**
 * Tests for verify.md N/A section support in complete command validation.
 *
 * The validateVerifyFile function should accept sections marked as
 * "N/A", "Not applicable", "Not required", or "CLI only" as valid,
 * while still requiring section headings to exist and rejecting
 * unfilled placeholders in active sections.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We need to test validateVerifyFile which is not exported directly.
// We'll test through validateFeatureCompletion which is exported,
// but that requires a full setup. Instead, let's test the behavior
// by creating verify.md files and importing the module internals.

// Since validateVerifyFile is not exported, we test via a small wrapper
// that mimics its logic using the exported validateFeatureCompletion.
// However, validateFeatureCompletion needs spec.md, plan.md, etc.
// So we'll create a minimal spec directory with all required files.

function createSpecDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "specflow-verify-test-"));
  // Create all required files so only verify.md validation matters
  writeFileSync(join(dir, "spec.md"), "# Spec\nSome spec content");
  writeFileSync(join(dir, "plan.md"), "# Plan\nSome plan content");
  writeFileSync(join(dir, "tasks.md"), "# Tasks\nSome tasks content");
  writeFileSync(join(dir, "docs.md"), "# Docs\nSome docs content");
  return dir;
}

// Direct test of the file validation by reading the source
// We'll use a dynamic import approach to access the module
// Actually, let's just test the exported validateFeatureCompletion
// and filter for verify-related errors.

import { validateFeatureCompletion } from "../../src/commands/complete";

function getVerifyErrors(specDir: string): string[] {
  // Save and mock cwd to avoid test-related checks
  const originalCwd = process.cwd;
  process.cwd = () => specDir;

  const result = validateFeatureCompletion(specDir);

  process.cwd = originalCwd;

  // Filter to only verify.md related errors
  return result.errors.filter(
    (e) => e.includes("verify.md") || e.includes("verification")
  );
}

describe("verify.md N/A section validation", () => {
  let specDir: string;

  beforeEach(() => {
    specDir = createSpecDir();
  });

  afterEach(() => {
    rmSync(specDir, { recursive: true, force: true });
  });

  test("all sections filled passes validation", () => {
    writeFileSync(
      join(specDir, "verify.md"),
      `# Verification

## Pre-Verification Checklist
- [x] All tests pass
- [x] Code reviewed

## Smoke Test Results
All smoke tests passed successfully.

## Browser Verification
Tested in Chrome, Firefox, Safari. All pages render correctly.

## API Verification
All API endpoints return expected responses.
`
    );

    const errors = getVerifyErrors(specDir);
    expect(errors).toEqual([]);
  });

  test("Browser Verification containing N/A passes", () => {
    writeFileSync(
      join(specDir, "verify.md"),
      `# Verification

## Pre-Verification Checklist
- [x] All tests pass

## Smoke Test Results
All smoke tests passed.

## Browser Verification
N/A

## API Verification
All API endpoints return expected responses.
`
    );

    const errors = getVerifyErrors(specDir);
    expect(errors).toEqual([]);
  });

  test("API Verification containing 'Not applicable - CLI only' passes", () => {
    writeFileSync(
      join(specDir, "verify.md"),
      `# Verification

## Pre-Verification Checklist
- [x] All tests pass

## Smoke Test Results
All smoke tests passed.

## Browser Verification
Not required - CLI only tool

## API Verification
Not applicable - CLI only feature, no API endpoints.
`
    );

    const errors = getVerifyErrors(specDir);
    expect(errors).toEqual([]);
  });

  test("missing section heading entirely still fails", () => {
    writeFileSync(
      join(specDir, "verify.md"),
      `# Verification

## Pre-Verification Checklist
- [x] All tests pass

## Smoke Test Results
All smoke tests passed.

## Browser Verification
Looks good.
`
    );
    // Missing "## API Verification" heading

    const errors = getVerifyErrors(specDir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("API Verification"))).toBe(true);
  });

  test("unfilled placeholders in active sections still fails", () => {
    writeFileSync(
      join(specDir, "verify.md"),
      `# Verification

## Pre-Verification Checklist
- [x] All tests pass

## Smoke Test Results
[paste actual output]

## Browser Verification
Tested and working.

## API Verification
All endpoints verified.
`
    );

    const errors = getVerifyErrors(specDir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("placeholder"))).toBe(true);
  });
});
