/**
 * Tests for documentation auto-generation in the complete command.
 *
 * Tests cover:
 * - Config loading from .specify/config.yaml
 * - User-facing change detection from spec.md/tasks.md
 * - CHANGELOG entry generation and appending
 * - docs.md auto-generation
 * - Spec summary extraction
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  loadDocGenConfig,
  detectUserFacingChanges,
  extractSpecSummary,
  determineChangeType,
  appendChangelogEntry,
  generateDocsContent,
  generateDocs,
} from "../../src/lib/doc-generator";

// =============================================================================
// Helpers
// =============================================================================

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "specflow-docs-test-"));
}

function createProjectWithSpec(dir: string): string {
  const specPath = join(dir, ".specify", "specs", "f-001-test");
  mkdirSync(specPath, { recursive: true });
  writeFileSync(
    join(specPath, "spec.md"),
    `# Specification: F-001 Test Feature

## Problem Statement

Users cannot auto-generate documentation when completing features.
This leads to stale README and CHANGELOG files.

## Requirements

- Auto-generate CHANGELOG entry
- Detect user-facing changes
- Create docs.md automatically
`
  );
  writeFileSync(
    join(specPath, "tasks.md"),
    `# Tasks

- [x] Add new CLI command \`specflow complete --skip-docs\`
- [x] Add --verbose flag for detailed output
- [x] Implement CHANGELOG generation
`
  );
  writeFileSync(join(specPath, "plan.md"), "# Plan\nSome plan content");
  return specPath;
}

// =============================================================================
// Config Loading Tests
// =============================================================================

describe("loadDocGenConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns defaults when no config file exists", () => {
    const config = loadDocGenConfig(dir);

    expect(config.updateChangelog).toBe(true);
    expect(config.updateReadme).toBe(true);
    expect(config.generateDocs).toBe(false);
  });

  test("reads config from .specify/config.yaml", () => {
    mkdirSync(join(dir, ".specify"), { recursive: true });
    writeFileSync(
      join(dir, ".specify", "config.yaml"),
      `complete:
  update_changelog: false
  update_readme: true
  generate_docs: true
`
    );

    const config = loadDocGenConfig(dir);

    expect(config.updateChangelog).toBe(false);
    expect(config.updateReadme).toBe(true);
    expect(config.generateDocs).toBe(true);
  });

  test("falls back to defaults for missing fields", () => {
    mkdirSync(join(dir, ".specify"), { recursive: true });
    writeFileSync(
      join(dir, ".specify", "config.yaml"),
      `complete:
  update_changelog: false
`
    );

    const config = loadDocGenConfig(dir);

    expect(config.updateChangelog).toBe(false);
    expect(config.updateReadme).toBe(true); // default
    expect(config.generateDocs).toBe(false); // default
  });

  test("handles invalid YAML gracefully", () => {
    mkdirSync(join(dir, ".specify"), { recursive: true });
    writeFileSync(join(dir, ".specify", "config.yaml"), "not: [valid: yaml:");

    const config = loadDocGenConfig(dir);

    expect(config.updateChangelog).toBe(true);
    expect(config.updateReadme).toBe(true);
  });

  test("handles missing complete section", () => {
    mkdirSync(join(dir, ".specify"), { recursive: true });
    writeFileSync(
      join(dir, ".specify", "config.yaml"),
      `other:
  key: value
`
    );

    const config = loadDocGenConfig(dir);

    expect(config.updateChangelog).toBe(true);
    expect(config.updateReadme).toBe(true);
  });
});

// =============================================================================
// Change Detection Tests
// =============================================================================

describe("detectUserFacingChanges", () => {
  test("detects CLI command additions", () => {
    const result = detectUserFacingChanges(
      "This adds a new CLI command for documentation generation.",
      null
    );

    expect(result.hasUserFacingChanges).toBe(true);
    expect(result.cliChanges.length).toBeGreaterThan(0);
  });

  test("detects CLI flags in tasks", () => {
    const result = detectUserFacingChanges(
      null,
      "- Add --skip-docs flag\n- Add --verbose option"
    );

    expect(result.hasUserFacingChanges).toBe(true);
    expect(result.cliChanges).toContain("--skip-docs");
    expect(result.cliChanges).toContain("--verbose");
  });

  test("detects API endpoint changes", () => {
    const result = detectUserFacingChanges(
      "This adds a new API endpoint GET /api/docs for documentation.",
      null
    );

    expect(result.hasUserFacingChanges).toBe(true);
    expect(result.apiChanges.length).toBeGreaterThan(0);
  });

  test("detects specflow command references", () => {
    const result = detectUserFacingChanges(
      "Users can run `specflow docs` to generate documentation.",
      null
    );

    expect(result.hasUserFacingChanges).toBe(true);
    expect(result.cliChanges.some((c) => c.includes("specflow"))).toBe(true);
  });

  test("returns no changes for internal features", () => {
    const result = detectUserFacingChanges(
      "Refactored internal database module for better performance.",
      "- Optimized SQL queries\n- Cleaned up dead code"
    );

    expect(result.hasUserFacingChanges).toBe(false);
    expect(result.cliChanges).toHaveLength(0);
    expect(result.apiChanges).toHaveLength(0);
  });

  test("handles null inputs", () => {
    const result = detectUserFacingChanges(null, null);

    expect(result.hasUserFacingChanges).toBe(false);
  });
});

// =============================================================================
// Spec Summary Extraction Tests
// =============================================================================

describe("extractSpecSummary", () => {
  test("extracts from Problem Statement section", () => {
    const summary = extractSpecSummary(
      `# Spec

## Problem Statement

Users cannot auto-generate docs.

## Requirements
- Thing
`
    );

    expect(summary).toBe("Users cannot auto-generate docs.");
  });

  test("extracts from Problem section", () => {
    const summary = extractSpecSummary(
      `# Spec

## Problem

The CHANGELOG is always stale after completing features.

## Solution
- Fix it
`
    );

    expect(summary).toBe(
      "The CHANGELOG is always stale after completing features."
    );
  });

  test("extracts from Description section as fallback", () => {
    const summary = extractSpecSummary(
      `# Spec

## Description

Auto-documentation generation for SpecFlow.

## Other
- Stuff
`
    );

    expect(summary).toBe("Auto-documentation generation for SpecFlow.");
  });

  test("truncates long summaries", () => {
    const longText = "A".repeat(300);
    const summary = extractSpecSummary(
      `# Spec

## Problem Statement

${longText}

## Other
`
    );

    expect(summary.length).toBeLessThanOrEqual(200);
  });

  test("falls back to first non-heading line", () => {
    const summary = extractSpecSummary(
      `# Spec
Some feature description here.
`
    );

    expect(summary).toBe("Some feature description here.");
  });

  test("returns default for empty spec", () => {
    const summary = extractSpecSummary("# Spec\n---\n");

    expect(summary).toBe("Feature completed");
  });
});

// =============================================================================
// Change Type Determination Tests
// =============================================================================

describe("determineChangeType", () => {
  test("detects fix changes", () => {
    expect(determineChangeType("Fix broken CHANGELOG")).toBe("Fixed");
    expect(determineChangeType("Bug fix for docs")).toBe("Fixed");
  });

  test("detects removal changes", () => {
    expect(determineChangeType("Remove deprecated command")).toBe("Removed");
    expect(determineChangeType("Deprecate old API")).toBe("Removed");
  });

  test("detects update changes", () => {
    expect(determineChangeType("Change output format")).toBe("Changed");
    expect(determineChangeType("Update CLI help text")).toBe("Changed");
    expect(determineChangeType("Refactor docs module")).toBe("Changed");
  });

  test("detects security changes", () => {
    expect(determineChangeType("Security patch for auth")).toBe("Security");
  });

  test("defaults to Added for new features", () => {
    expect(determineChangeType("Auto-documentation generation")).toBe("Added");
    expect(determineChangeType("New CLI command")).toBe("Added");
  });
});

// =============================================================================
// CHANGELOG Generation Tests
// =============================================================================

describe("appendChangelogEntry", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("creates new CHANGELOG when none exists", () => {
    const entry = appendChangelogEntry(
      dir,
      "F-001",
      "Auto-docs",
      "Auto-generate documentation"
    );

    const content = readFileSync(join(dir, "CHANGELOG.md"), "utf-8");

    expect(entry).toContain("F-001 Auto-docs");
    expect(content).toContain("## [Unreleased]");
    expect(content).toContain("### Added");
    expect(content).toContain("Auto-generate documentation");
  });

  test("appends to existing Unreleased section", () => {
    writeFileSync(
      join(dir, "CHANGELOG.md"),
      `# Changelog

## [Unreleased]

### Added
- **F-000 Initial**: Initial setup

## [0.1.0] - 2024-01-01

### Added
- First release
`
    );

    appendChangelogEntry(dir, "F-001", "Auto-docs", "Auto-generate documentation");

    const content = readFileSync(join(dir, "CHANGELOG.md"), "utf-8");

    expect(content).toContain("F-001 Auto-docs");
    expect(content).toContain("F-000 Initial");
    // Should be under the same ### Added section
    expect(content.indexOf("F-001 Auto-docs")).toBeGreaterThan(
      content.indexOf("### Added")
    );
  });

  test("creates Unreleased section if missing", () => {
    writeFileSync(
      join(dir, "CHANGELOG.md"),
      `# Changelog

## [0.1.0] - 2024-01-01

### Added
- First release
`
    );

    appendChangelogEntry(dir, "F-001", "Auto-docs", "Auto-generate documentation");

    const content = readFileSync(join(dir, "CHANGELOG.md"), "utf-8");

    expect(content).toContain("## [Unreleased]");
    expect(content.indexOf("## [Unreleased]")).toBeLessThan(
      content.indexOf("## [0.1.0]")
    );
  });

  test("uses correct change type for fixes", () => {
    appendChangelogEntry(
      dir,
      "F-002",
      "Fix broken output",
      "Fixed output formatting"
    );

    const content = readFileSync(join(dir, "CHANGELOG.md"), "utf-8");

    expect(content).toContain("### Fixed");
  });
});

// =============================================================================
// docs.md Generation Tests
// =============================================================================

describe("generateDocsContent", () => {
  test("generates complete docs.md with changelog and changes", () => {
    const content = generateDocsContent(
      "F-001",
      "Auto-docs",
      "- **F-001 Auto-docs**: Generate docs automatically",
      {
        hasUserFacingChanges: true,
        cliChanges: ["--skip-docs", "`specflow complete`"],
        apiChanges: [],
        otherChanges: ["new feature"],
      },
      null
    );

    expect(content).toContain("# Documentation Updates — F-001: Auto-docs");
    expect(content).toContain("## CHANGELOG");
    expect(content).toContain("F-001 Auto-docs");
    expect(content).toContain("## User-Facing Changes");
    expect(content).toContain("### CLI Changes");
    expect(content).toContain("--skip-docs");
  });

  test("generates docs.md for internal feature", () => {
    const content = generateDocsContent(
      "F-002",
      "Internal refactor",
      "- **F-002 Internal refactor**: Cleaned up code",
      {
        hasUserFacingChanges: false,
        cliChanges: [],
        apiChanges: [],
        otherChanges: [],
      },
      null
    );

    expect(content).toContain(
      "No user-facing changes detected (internal/backend feature)"
    );
    expect(content).toContain(
      "No README update needed (no user-facing changes detected)"
    );
  });

  test("includes README suggestions when provided", () => {
    const content = generateDocsContent(
      "F-001",
      "Auto-docs",
      null,
      {
        hasUserFacingChanges: true,
        cliChanges: ["--skip-docs"],
        apiChanges: [],
        otherChanges: [],
      },
      "Add `--skip-docs` to the CLI reference section."
    );

    expect(content).toContain("The following README updates are suggested");
    expect(content).toContain("--skip-docs");
  });
});

// =============================================================================
// Integration: generateDocs
// =============================================================================

describe("generateDocs", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("generates docs.md and CHANGELOG entry", async () => {
    const specPath = createProjectWithSpec(dir);

    // Disable README AI suggestions to avoid spawning claude in tests
    const result = await generateDocs(dir, "F-001", "Test Feature", specPath, {
      updateChangelog: true,
      updateReadme: false,
      generateDocs: false,
    });

    expect(result.success).toBe(true);
    expect(result.changelogEntry).toBeTruthy();
    expect(result.docsContent).toBeTruthy();

    // docs.md was created
    expect(existsSync(join(specPath, "docs.md"))).toBe(true);

    // CHANGELOG.md was created
    expect(existsSync(join(dir, "CHANGELOG.md"))).toBe(true);
    const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("F-001 Test Feature");
  });

  test("does not overwrite existing docs.md", async () => {
    const specPath = createProjectWithSpec(dir);
    const existingContent = "# My custom docs\nManually written.";
    writeFileSync(join(specPath, "docs.md"), existingContent);

    const result = await generateDocs(dir, "F-001", "Test Feature", specPath, {
      updateChangelog: true,
      updateReadme: false,
      generateDocs: false,
    });

    expect(result.success).toBe(true);
    // docs.md should NOT be overwritten
    const actual = readFileSync(join(specPath, "docs.md"), "utf-8");
    expect(actual).toBe(existingContent);
  });

  test("respects config to disable changelog", async () => {
    const specPath = createProjectWithSpec(dir);

    const result = await generateDocs(dir, "F-001", "Test Feature", specPath, {
      updateChangelog: false,
      updateReadme: false,
      generateDocs: false,
    });

    expect(result.success).toBe(true);
    expect(result.changelogEntry).toBeNull();
    // CHANGELOG should not exist
    expect(existsSync(join(dir, "CHANGELOG.md"))).toBe(false);
  });

  test("handles missing spec.md gracefully", async () => {
    const specPath = join(dir, ".specify", "specs", "f-001-test");
    mkdirSync(specPath, { recursive: true });
    // No spec.md created

    const result = await generateDocs(dir, "F-001", "Test Feature", specPath, {
      updateChangelog: true,
      updateReadme: false,
      generateDocs: false,
    });

    expect(result.success).toBe(true);
    expect(result.changelogEntry).toBeNull();
    // docs.md still created (with "no changes" content)
    expect(existsSync(join(specPath, "docs.md"))).toBe(true);
  });

  test("detects CLI changes from spec content", async () => {
    const specPath = createProjectWithSpec(dir);

    const result = await generateDocs(dir, "F-001", "Test Feature", specPath, {
      updateChangelog: true,
      updateReadme: false,
      generateDocs: false,
    });

    // The test spec has CLI-related content
    expect(result.docsContent).toBeTruthy();
    const docsContent = readFileSync(join(specPath, "docs.md"), "utf-8");
    expect(docsContent).toContain("CLI Changes");
  });
});
