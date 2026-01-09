/**
 * Context Builder Module
 * Prepares context for feature implementation agents
 */

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import type { AppContext, Feature, FeatureContext } from "../types";

// =============================================================================
// App Context
// =============================================================================

/**
 * Build application-level context from project directory
 */
export function buildAppContext(projectPath: string): AppContext {
  const memoryPath = join(projectPath, ".specify/memory");
  const appSpecPath = findAppSpec(projectPath);

  // Extract stack and patterns from constitution if it exists
  const { stack, patterns } = loadConstitution(memoryPath);

  return {
    projectPath,
    appSpecPath,
    memoryPath,
    stack,
    patterns,
  };
}

/**
 * Find the app-level specification file
 */
function findAppSpec(projectPath: string): string {
  const candidates = [
    join(projectPath, ".specify/specs/app/spec.md"),
    join(projectPath, ".specify/app-spec.md"),
    join(projectPath, "spec.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

/**
 * Load constitution and extract stack/patterns
 */
function loadConstitution(memoryPath: string): { stack: string[]; patterns: string[] } {
  const constitutionPath = join(memoryPath, "constitution.md");

  if (!existsSync(constitutionPath)) {
    return { stack: [], patterns: [] };
  }

  const content = readFileSync(constitutionPath, "utf-8");

  // Extract stack items (lines starting with - under Stack section)
  const stack: string[] = [];
  const patterns: string[] = [];

  const lines = content.split("\n");
  let inStackSection = false;
  let inPatternsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.toLowerCase().includes("# stack") || trimmed.toLowerCase() === "stack") {
      inStackSection = true;
      inPatternsSection = false;
      continue;
    }
    if (trimmed.toLowerCase().includes("# pattern") || trimmed.toLowerCase() === "patterns") {
      inStackSection = false;
      inPatternsSection = true;
      continue;
    }
    if (trimmed.startsWith("#")) {
      inStackSection = false;
      inPatternsSection = false;
      continue;
    }

    // Extract list items
    if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const item = trimmed.slice(1).trim();
      if (inStackSection && item) {
        stack.push(item);
      }
      if (inPatternsSection && item) {
        patterns.push(item);
      }
    }
  }

  return { stack, patterns };
}

// =============================================================================
// Feature Context
// =============================================================================

/**
 * Build context for a specific feature
 */
export function buildFeatureContext(
  appContext: AppContext,
  feature: Feature
): FeatureContext {
  let specContent: string | null = null;
  let planContent: string | null = null;
  let tasksContent: string | null = null;

  // Load feature-specific files if specPath exists
  if (feature.specPath && existsSync(feature.specPath)) {
    const specFile = join(feature.specPath, "spec.md");
    const planFile = join(feature.specPath, "plan.md");
    const tasksFile = join(feature.specPath, "tasks.md");

    if (existsSync(specFile)) {
      specContent = readFileSync(specFile, "utf-8");
    }
    if (existsSync(planFile)) {
      planContent = readFileSync(planFile, "utf-8");
    }
    if (existsSync(tasksFile)) {
      tasksContent = readFileSync(tasksFile, "utf-8");
    }
  }

  return {
    app: appContext,
    feature,
    specContent,
    planContent,
    tasksContent,
  };
}

// =============================================================================
// Context Formatting
// =============================================================================

/**
 * Format context as a prompt for the implementation agent
 */
export function formatContextForAgent(context: FeatureContext): string {
  const { app, feature, specContent, planContent, tasksContent } = context;

  const parts: string[] = [];

  // Header
  parts.push("# Feature Implementation\n");
  parts.push(`You are implementing feature **${feature.id}: ${feature.name}**.\n`);

  // Feature description
  parts.push("## Feature\n");
  parts.push(`**ID:** ${feature.id}`);
  parts.push(`**Name:** ${feature.name}`);
  parts.push(`**Description:** ${feature.description}`);
  parts.push("");

  // App context
  if (app.stack.length > 0) {
    parts.push("## Technology Stack\n");
    for (const tech of app.stack) {
      parts.push(`- ${tech}`);
    }
    parts.push("");
  }

  if (app.patterns.length > 0) {
    parts.push("## Patterns\n");
    for (const pattern of app.patterns) {
      parts.push(`- ${pattern}`);
    }
    parts.push("");
  }

  // Feature specification
  if (specContent) {
    parts.push("## Specification\n");
    parts.push(specContent);
    parts.push("");
  }

  // Implementation plan
  if (planContent) {
    parts.push("## Plan\n");
    parts.push(planContent);
    parts.push("");
  }

  // Tasks
  if (tasksContent) {
    parts.push("## Tasks\n");
    parts.push(tasksContent);
    parts.push("");
  }

  // TDD Instructions
  parts.push("## Implementation Requirements\n");
  parts.push("### TDD Mandatory\n");
  parts.push("You MUST follow Test-Driven Development:\n");
  parts.push("1. **Write failing test first** - Create test that defines expected behavior");
  parts.push("2. **Run test to confirm it fails** - Verify the test is meaningful");
  parts.push("3. **Write minimal implementation** - Just enough code to pass the test");
  parts.push("4. **Run test to confirm it passes** - Verify implementation works");
  parts.push("5. **Run full test suite** - Ensure no regressions");
  parts.push("");

  // Completion markers
  parts.push("## Completion\n");
  parts.push("When done, output:\n");
  parts.push("```");
  parts.push("[FEATURE COMPLETE]");
  parts.push(`Feature: ${feature.id} - ${feature.name}`);
  parts.push("Tests: X passing");
  parts.push("Files: list of files created/modified");
  parts.push("```\n");

  parts.push("If blocked, output:\n");
  parts.push("```");
  parts.push("[FEATURE BLOCKED]");
  parts.push(`Feature: ${feature.id} - ${feature.name}`);
  parts.push("Reason: explanation");
  parts.push("```");

  return parts.join("\n");
}

// =============================================================================
// Memory Loading
// =============================================================================

/**
 * Load all memory files from .specify/memory/
 */
export function loadMemoryFiles(memoryPath: string): Map<string, string> {
  const files = new Map<string, string>();

  if (!existsSync(memoryPath)) {
    return files;
  }

  const { readdirSync } = require("fs");
  const entries = readdirSync(memoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const filePath = join(memoryPath, entry.name);
      files.set(entry.name, readFileSync(filePath, "utf-8"));
    }
  }

  return files;
}
