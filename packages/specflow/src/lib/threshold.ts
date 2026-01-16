/**
 * Configurable Quality Thresholds
 * Load quality gate thresholds from project constitution or use defaults
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

// =============================================================================
// Types
// =============================================================================

/**
 * Quality thresholds for different artifact types
 * All values are percentages (0-100) that get converted to decimals (0-1) for rubrics
 */
export interface QualityThresholds {
  /** Threshold for spec quality evaluation (default: 80) */
  specQuality: number;
  /** Threshold for plan quality evaluation (default: 80) */
  planQuality: number;
  /** Threshold for quick-start specs (default: 60) */
  quickStartQuality: number;
  /** Where these thresholds came from */
  source: "default" | "constitution";
}

/**
 * Default quality thresholds
 */
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  specQuality: 80,
  planQuality: 80,
  quickStartQuality: 60,
  source: "default",
};

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate and normalize a threshold value
 * @param value - The value to validate
 * @param defaultVal - Default value if invalid
 * @param name - Name for warning messages
 * @returns Validated threshold (50-100)
 */
export function validateThreshold(
  value: unknown,
  defaultVal: number,
  name?: string
): number {
  if (typeof value !== "number") {
    if (value !== undefined && name) {
      console.warn(
        `⚠ Invalid ${name} threshold: expected number, got ${typeof value}. Using default: ${defaultVal}`
      );
    }
    return defaultVal;
  }

  // Normalize percentage vs decimal
  const normalized = value > 1 ? value : value * 100;

  // Validate range
  if (normalized < 50 || normalized > 100) {
    if (name) {
      console.warn(
        `⚠ ${name} threshold ${normalized}% out of range (50-100). Using default: ${defaultVal}`
      );
    }
    return defaultVal;
  }

  return Math.round(normalized);
}

// =============================================================================
// Loader
// =============================================================================

/**
 * Extract YAML frontmatter from markdown content
 * @param content - Markdown content with optional frontmatter
 * @returns Parsed frontmatter object or null
 */
export function extractFrontmatter(content: string): Record<string, unknown> | null {
  // Match YAML frontmatter between --- markers
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }

  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid YAML, return null
  }

  return null;
}

/**
 * Load quality thresholds from project constitution
 * @param projectPath - Path to project root
 * @returns Quality thresholds (from constitution or defaults)
 */
export function loadThresholds(projectPath: string): QualityThresholds {
  // Check for constitution file
  const constitutionPath = join(projectPath, ".specify", "memory", "constitution.md");

  if (!existsSync(constitutionPath)) {
    return { ...DEFAULT_THRESHOLDS };
  }

  try {
    const content = readFileSync(constitutionPath, "utf-8");
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      return { ...DEFAULT_THRESHOLDS };
    }

    // Look for quality-thresholds in frontmatter
    const thresholds = frontmatter["quality-thresholds"] as Record<string, unknown> | undefined;

    if (!thresholds || typeof thresholds !== "object") {
      return { ...DEFAULT_THRESHOLDS };
    }

    return {
      specQuality: validateThreshold(
        thresholds["spec-quality"],
        DEFAULT_THRESHOLDS.specQuality,
        "spec-quality"
      ),
      planQuality: validateThreshold(
        thresholds["plan-quality"],
        DEFAULT_THRESHOLDS.planQuality,
        "plan-quality"
      ),
      quickStartQuality: validateThreshold(
        thresholds["quick-start-quality"],
        DEFAULT_THRESHOLDS.quickStartQuality,
        "quick-start-quality"
      ),
      source: "constitution",
    };
  } catch (error) {
    console.warn(
      `⚠ Error reading constitution: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ...DEFAULT_THRESHOLDS };
  }
}

/**
 * Convert percentage threshold to decimal for rubric comparison
 * @param percentage - Threshold as percentage (0-100)
 * @returns Threshold as decimal (0-1)
 */
export function toDecimal(percentage: number): number {
  return percentage / 100;
}

/**
 * Format threshold for display
 * @param percentage - Threshold as percentage (0-100)
 * @returns Formatted string like "80%"
 */
export function formatThreshold(percentage: number): string {
  return `${percentage}%`;
}
