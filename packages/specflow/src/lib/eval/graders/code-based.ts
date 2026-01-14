/**
 * Code-Based Graders
 * Deterministic graders for evaluating workflow compliance and spec structure
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Glob } from "bun";
import type { Grader } from "./index";
import type { GradeContext, GradeResult, TestCase } from "../types";

// =============================================================================
// File Exists Grader
// =============================================================================

/**
 * Grader that checks if specified files exist
 *
 * Config options:
 * - path: Single file path to check
 * - paths: Array of file paths to check (all must exist)
 * - pattern: Glob pattern to match (at least one match required)
 */
export const fileExistsGrader: Grader = {
  name: "file-exists",
  type: "code",

  async grade(testCase: TestCase, context: GradeContext): Promise<GradeResult> {
    const config = testCase.graderConfig;
    const projectPath = context.projectPath;

    // Handle glob pattern
    if (config.pattern) {
      const pattern = config.pattern as string;
      const glob = new Glob(pattern);
      const matches: string[] = [];

      for await (const file of glob.scan({ cwd: projectPath, onlyFiles: true, dot: true })) {
        matches.push(file);
      }

      if (matches.length > 0) {
        return {
          passed: true,
          score: null,
          output: `Pattern "${pattern}" matched ${matches.length} file(s): ${matches.join(", ")}`,
        };
      } else {
        return {
          passed: false,
          score: null,
          output: `No files matched pattern "${pattern}"`,
          error: `Pattern "${pattern}" not found in ${projectPath}`,
        };
      }
    }

    // Handle multiple paths
    if (config.paths) {
      const paths = config.paths as string[];
      const missing: string[] = [];
      const found: string[] = [];

      for (const path of paths) {
        const fullPath = join(projectPath, path);
        if (existsSync(fullPath)) {
          found.push(path);
        } else {
          missing.push(path);
        }
      }

      if (missing.length === 0) {
        return {
          passed: true,
          score: null,
          output: `All ${found.length} files exist: ${found.join(", ")}`,
        };
      } else {
        return {
          passed: false,
          score: null,
          output: `Missing ${missing.length} of ${paths.length} files`,
          error: `Files not found: ${missing.join(", ")}`,
        };
      }
    }

    // Handle single path
    const path = config.path as string;
    const fullPath = join(projectPath, path);

    if (existsSync(fullPath)) {
      return {
        passed: true,
        score: null,
        output: `File "${path}" exists at ${fullPath}`,
      };
    } else {
      return {
        passed: false,
        score: null,
        output: `File "${path}" does not exist`,
        error: `File not found: ${path}`,
      };
    }
  },
};

// =============================================================================
// Schema Valid Grader
// =============================================================================

/**
 * Grader that validates markdown file has required sections
 *
 * Config options:
 * - file: Path to markdown file
 * - requiredSections: Array of section headings that must exist
 */
export const schemaValidGrader: Grader = {
  name: "schema-valid",
  type: "code",

  async grade(testCase: TestCase, context: GradeContext): Promise<GradeResult> {
    const config = testCase.graderConfig;
    const projectPath = context.projectPath;
    const file = config.file as string;
    const requiredSections = config.requiredSections as string[];

    const fullPath = join(projectPath, file);

    if (!existsSync(fullPath)) {
      return {
        passed: false,
        score: null,
        output: `File "${file}" does not exist`,
        error: `File not found: ${file}`,
      };
    }

    const content = readFileSync(fullPath, "utf-8");
    const contentLower = content.toLowerCase();

    const missingSections: string[] = [];
    const foundSections: string[] = [];

    for (const section of requiredSections) {
      // Look for ## Section or # Section (case insensitive)
      const patterns = [
        `## ${section.toLowerCase()}`,
        `# ${section.toLowerCase()}`,
        `### ${section.toLowerCase()}`,
      ];

      const found = patterns.some((pattern) => contentLower.includes(pattern));

      if (found) {
        foundSections.push(section);
      } else {
        missingSections.push(section);
      }
    }

    if (missingSections.length === 0) {
      return {
        passed: true,
        score: null,
        output: `All ${foundSections.length} required sections found: ${foundSections.join(", ")}`,
      };
    } else {
      return {
        passed: false,
        score: null,
        output: `Missing ${missingSections.length} of ${requiredSections.length} sections`,
        error: `Missing sections: ${missingSections.join(", ")}`,
      };
    }
  },
};

// =============================================================================
// Phase Gate Grader
// =============================================================================

/**
 * Phase order definition
 */
const PHASE_ORDER = ["specify", "plan", "tasks", "implement"] as const;
type Phase = (typeof PHASE_ORDER)[number];

/**
 * Phase prerequisites (files that must exist before entering phase)
 */
const PHASE_PREREQUISITES: Record<Phase, string[]> = {
  specify: [], // No prerequisites for specify
  plan: ["spec.md"],
  tasks: ["spec.md", "plan.md"],
  implement: ["spec.md", "plan.md", "tasks.md"],
};

/**
 * Grader that validates SpecFlow phase gates
 *
 * Config options:
 * - featureDir: Path to feature directory (e.g., ".specify/specs/001-feature")
 * - expectedPhase: The phase being entered (specify, plan, tasks, implement)
 */
export const phaseGateGrader: Grader = {
  name: "phase-gate",
  type: "code",

  async grade(testCase: TestCase, context: GradeContext): Promise<GradeResult> {
    const config = testCase.graderConfig;
    const projectPath = context.projectPath;
    const featureDir = config.featureDir as string;
    const expectedPhase = config.expectedPhase as Phase;

    const fullFeatureDir = join(projectPath, featureDir);

    if (!existsSync(fullFeatureDir)) {
      // For specify phase, directory not existing is OK (will be created)
      if (expectedPhase === "specify") {
        return {
          passed: true,
          score: null,
          output: `Phase "specify" can start - no prerequisites required`,
        };
      }

      return {
        passed: false,
        score: null,
        output: `Feature directory does not exist`,
        error: `Directory not found: ${featureDir}`,
      };
    }

    const prerequisites = PHASE_PREREQUISITES[expectedPhase];
    const missingFiles: string[] = [];
    const foundFiles: string[] = [];

    for (const file of prerequisites) {
      const filePath = join(fullFeatureDir, file);
      if (existsSync(filePath)) {
        foundFiles.push(file);
      } else {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length === 0) {
      return {
        passed: true,
        score: null,
        output: `Phase "${expectedPhase}" prerequisites met: ${foundFiles.length > 0 ? foundFiles.join(", ") : "none required"}`,
      };
    } else {
      return {
        passed: false,
        score: null,
        output: `Cannot enter phase "${expectedPhase}" - missing prerequisites`,
        error: `Missing files: ${missingFiles.join(", ")}`,
      };
    }
  },
};

// =============================================================================
// Section Present Grader
// =============================================================================

/**
 * Extract section content from markdown
 */
function extractSection(content: string, sectionName: string): string | null {
  const lines = content.split("\n");
  const sectionLower = sectionName.toLowerCase();
  let inSection = false;
  let sectionContent: string[] = [];
  let sectionLevel = 0;

  for (const line of lines) {
    // Check if this is a heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2].toLowerCase();

      if (heading === sectionLower || heading.includes(sectionLower)) {
        // Found the section
        inSection = true;
        sectionLevel = level;
        continue;
      } else if (inSection && level <= sectionLevel) {
        // Hit next section at same or higher level, stop
        break;
      }
    }

    if (inSection) {
      sectionContent.push(line);
    }
  }

  return inSection ? sectionContent.join("\n").trim() : null;
}

/**
 * Grader that checks for specific content in a markdown section
 *
 * Config options:
 * - file: Path to markdown file
 * - section: Section heading to look in
 * - contains: Text that must be present (case insensitive)
 * - pattern: Regex pattern that must match
 * - minLength: Minimum character count for section content
 */
export const sectionPresentGrader: Grader = {
  name: "section-present",
  type: "code",

  async grade(testCase: TestCase, context: GradeContext): Promise<GradeResult> {
    const config = testCase.graderConfig;
    const projectPath = context.projectPath;
    const file = config.file as string;
    const section = config.section as string;

    const fullPath = join(projectPath, file);

    if (!existsSync(fullPath)) {
      return {
        passed: false,
        score: null,
        output: `File "${file}" does not exist`,
        error: `File not found: ${file}`,
      };
    }

    const content = readFileSync(fullPath, "utf-8");
    const sectionContent = extractSection(content, section);

    if (sectionContent === null) {
      return {
        passed: false,
        score: null,
        output: `Section "${section}" not found in ${file}`,
        error: `Section "${section}" not found`,
      };
    }

    // Check minimum length
    if (config.minLength !== undefined) {
      const minLength = config.minLength as number;
      if (sectionContent.length < minLength) {
        return {
          passed: false,
          score: null,
          output: `Section "${section}" has ${sectionContent.length} characters (minimum: ${minLength})`,
          error: `Section "${section}" too short (${sectionContent.length} < ${minLength})`,
        };
      }
    }

    // Check contains (case insensitive)
    if (config.contains !== undefined) {
      const needle = (config.contains as string).toLowerCase();
      if (!sectionContent.toLowerCase().includes(needle)) {
        return {
          passed: false,
          score: null,
          output: `Section "${section}" does not contain "${config.contains}"`,
          error: `Text "${config.contains}" not found in section "${section}"`,
        };
      }
    }

    // Check regex pattern
    if (config.pattern !== undefined) {
      const pattern = new RegExp(config.pattern as string);
      if (!pattern.test(sectionContent)) {
        return {
          passed: false,
          score: null,
          output: `Section "${section}" does not match pattern "${config.pattern}"`,
          error: `Pattern "${config.pattern}" not found in section "${section}"`,
        };
      }
    }

    return {
      passed: true,
      score: null,
      output: `Section "${section}" validation passed (${sectionContent.length} chars)`,
    };
  },
};

// =============================================================================
// Register All Code-Based Graders
// =============================================================================

import { registerGrader } from "./index";

/**
 * Register all code-based graders with the global registry
 */
export function registerCodeGraders(): void {
  registerGrader({
    name: "file-exists",
    create: () => fileExistsGrader,
  });

  registerGrader({
    name: "schema-valid",
    create: () => schemaValidGrader,
  });

  registerGrader({
    name: "phase-gate",
    create: () => phaseGateGrader,
  });

  registerGrader({
    name: "section-present",
    create: () => sectionPresentGrader,
  });
}
