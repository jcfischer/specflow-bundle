/**
 * Threshold Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  QualityThresholds,
  DEFAULT_THRESHOLDS,
  validateThreshold,
  extractFrontmatter,
  loadThresholds,
  toDecimal,
  formatThreshold,
} from "../../src/lib/threshold";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = join(import.meta.dir, "..", ".test-threshold");

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// =============================================================================
// Default Thresholds Tests
// =============================================================================

describe("DEFAULT_THRESHOLDS", () => {
  it("should have correct default values", () => {
    expect(DEFAULT_THRESHOLDS.specQuality).toBe(80);
    expect(DEFAULT_THRESHOLDS.planQuality).toBe(80);
    expect(DEFAULT_THRESHOLDS.quickStartQuality).toBe(60);
    expect(DEFAULT_THRESHOLDS.source).toBe("default");
  });
});

// =============================================================================
// validateThreshold Tests
// =============================================================================

describe("validateThreshold", () => {
  it("should return default for non-number values", () => {
    expect(validateThreshold("80", 80)).toBe(80);
    expect(validateThreshold(null, 80)).toBe(80);
    expect(validateThreshold(undefined, 80)).toBe(80);
    expect(validateThreshold({}, 80)).toBe(80);
  });

  it("should accept valid percentage values", () => {
    expect(validateThreshold(50, 80)).toBe(50);
    expect(validateThreshold(75, 80)).toBe(75);
    expect(validateThreshold(100, 80)).toBe(100);
  });

  it("should normalize decimal values to percentage", () => {
    expect(validateThreshold(0.8, 80)).toBe(80);
    expect(validateThreshold(0.6, 80)).toBe(60);
    expect(validateThreshold(0.95, 80)).toBe(95);
  });

  it("should reject out-of-range values and use default", () => {
    expect(validateThreshold(49, 80)).toBe(80);
    expect(validateThreshold(101, 80)).toBe(80);
    expect(validateThreshold(0, 80)).toBe(80);
    expect(validateThreshold(0.4, 80)).toBe(80); // 40% is out of range
  });

  it("should round to integer", () => {
    expect(validateThreshold(75.5, 80)).toBe(76);
    expect(validateThreshold(0.756, 80)).toBe(76);
  });
});

// =============================================================================
// extractFrontmatter Tests
// =============================================================================

describe("extractFrontmatter", () => {
  it("should extract valid YAML frontmatter", () => {
    const content = `---
project: "Test"
quality-thresholds:
  spec-quality: 90
---

# Content here
`;
    const result = extractFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.project).toBe("Test");
    expect(result?.["quality-thresholds"]).toEqual({ "spec-quality": 90 });
  });

  it("should return null for content without frontmatter", () => {
    const content = "# Just a heading\n\nSome content";
    expect(extractFrontmatter(content)).toBeNull();
  });

  it("should return null for invalid YAML", () => {
    const content = `---
invalid: [unclosed
---

Content
`;
    expect(extractFrontmatter(content)).toBeNull();
  });

  it("should handle Windows line endings", () => {
    const content = "---\r\nproject: Test\r\n---\r\n\r\nContent";
    const result = extractFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.project).toBe("Test");
  });

  it("should return null for empty frontmatter", () => {
    const content = `---
---

Content
`;
    expect(extractFrontmatter(content)).toBeNull();
  });
});

// =============================================================================
// loadThresholds Tests
// =============================================================================

describe("loadThresholds", () => {
  it("should return defaults when no constitution exists", () => {
    const result = loadThresholds(TEST_DIR);
    expect(result).toEqual(DEFAULT_THRESHOLDS);
  });

  it("should return defaults when constitution has no frontmatter", () => {
    const constitutionDir = join(TEST_DIR, ".specify", "memory");
    mkdirSync(constitutionDir, { recursive: true });
    writeFileSync(
      join(constitutionDir, "constitution.md"),
      "# Constitution\n\nNo frontmatter here."
    );

    const result = loadThresholds(TEST_DIR);
    expect(result.source).toBe("default");
    expect(result.specQuality).toBe(80);
  });

  it("should return defaults when frontmatter has no thresholds", () => {
    const constitutionDir = join(TEST_DIR, ".specify", "memory");
    mkdirSync(constitutionDir, { recursive: true });
    writeFileSync(
      join(constitutionDir, "constitution.md"),
      `---
project: "Test"
---

# Constitution
`
    );

    const result = loadThresholds(TEST_DIR);
    expect(result.source).toBe("default");
  });

  it("should load custom thresholds from constitution", () => {
    const constitutionDir = join(TEST_DIR, ".specify", "memory");
    mkdirSync(constitutionDir, { recursive: true });
    writeFileSync(
      join(constitutionDir, "constitution.md"),
      `---
project: "Test"
quality-thresholds:
  spec-quality: 90
  plan-quality: 85
  quick-start-quality: 70
---

# Constitution
`
    );

    const result = loadThresholds(TEST_DIR);
    expect(result.source).toBe("constitution");
    expect(result.specQuality).toBe(90);
    expect(result.planQuality).toBe(85);
    expect(result.quickStartQuality).toBe(70);
  });

  it("should use defaults for missing threshold values", () => {
    const constitutionDir = join(TEST_DIR, ".specify", "memory");
    mkdirSync(constitutionDir, { recursive: true });
    writeFileSync(
      join(constitutionDir, "constitution.md"),
      `---
project: "Test"
quality-thresholds:
  spec-quality: 90
---

# Constitution
`
    );

    const result = loadThresholds(TEST_DIR);
    expect(result.source).toBe("constitution");
    expect(result.specQuality).toBe(90);
    expect(result.planQuality).toBe(80); // default
    expect(result.quickStartQuality).toBe(60); // default
  });

  it("should handle decimal threshold values", () => {
    const constitutionDir = join(TEST_DIR, ".specify", "memory");
    mkdirSync(constitutionDir, { recursive: true });
    writeFileSync(
      join(constitutionDir, "constitution.md"),
      `---
quality-thresholds:
  spec-quality: 0.85
  plan-quality: 0.9
---

# Constitution
`
    );

    const result = loadThresholds(TEST_DIR);
    expect(result.specQuality).toBe(85);
    expect(result.planQuality).toBe(90);
  });

  it("should reject invalid threshold values and use defaults", () => {
    const constitutionDir = join(TEST_DIR, ".specify", "memory");
    mkdirSync(constitutionDir, { recursive: true });
    writeFileSync(
      join(constitutionDir, "constitution.md"),
      `---
quality-thresholds:
  spec-quality: 120
  plan-quality: "high"
---

# Constitution
`
    );

    const result = loadThresholds(TEST_DIR);
    expect(result.specQuality).toBe(80); // default (120 out of range)
    expect(result.planQuality).toBe(80); // default (not a number)
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("toDecimal", () => {
  it("should convert percentage to decimal", () => {
    expect(toDecimal(80)).toBe(0.8);
    expect(toDecimal(100)).toBe(1);
    expect(toDecimal(60)).toBe(0.6);
    expect(toDecimal(75)).toBe(0.75);
  });
});

describe("formatThreshold", () => {
  it("should format threshold as percentage string", () => {
    expect(formatThreshold(80)).toBe("80%");
    expect(formatThreshold(100)).toBe("100%");
    expect(formatThreshold(60)).toBe("60%");
  });
});
