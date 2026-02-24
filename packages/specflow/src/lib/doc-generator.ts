/**
 * Documentation Generator Module
 * Auto-generates CHANGELOG entries and docs.md during `specflow complete`.
 *
 * Responsibilities:
 * 1. Load config from .specify/config.yaml
 * 2. Detect user-facing changes from spec.md/tasks.md
 * 3. Generate CHANGELOG entry from spec description
 * 4. Generate docs.md summarizing documentation updates
 * 5. Optionally use AI (headless mode) for README update suggestions
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { runClaudeHeadless, isHeadlessMode } from "./headless";

// =============================================================================
// Types
// =============================================================================

export interface DocGenConfig {
  /** Whether to auto-append a CHANGELOG entry (default: true) */
  updateChangelog: boolean;
  /** Whether to detect user-facing changes for README (default: true) */
  updateReadme: boolean;
  /** Whether to generate additional docs for substantial features (default: false) */
  generateDocs: boolean;
}

export interface ChangeDetectionResult {
  /** Whether the feature has user-facing changes */
  hasUserFacingChanges: boolean;
  /** Detected CLI commands or options */
  cliChanges: string[];
  /** Detected API endpoints */
  apiChanges: string[];
  /** Other user-facing changes */
  otherChanges: string[];
}

export interface DocGenResult {
  /** Whether doc generation succeeded */
  success: boolean;
  /** CHANGELOG entry that was appended (if any) */
  changelogEntry: string | null;
  /** docs.md content that was written */
  docsContent: string | null;
  /** README suggestions (if any) */
  readmeSuggestions: string | null;
  /** Errors encountered */
  errors: string[];
}

// =============================================================================
// Config Loading
// =============================================================================

const DEFAULT_CONFIG: DocGenConfig = {
  updateChangelog: true,
  updateReadme: true,
  generateDocs: false,
};

/**
 * Load doc generation config from .specify/config.yaml.
 * Falls back to defaults if file doesn't exist or section is missing.
 */
export function loadDocGenConfig(projectPath: string): DocGenConfig {
  const configPath = join(projectPath, ".specify", "config.yaml");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(content);

    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_CONFIG };
    }

    const complete = parsed.complete;
    if (!complete || typeof complete !== "object") {
      return { ...DEFAULT_CONFIG };
    }

    return {
      updateChangelog: complete.update_changelog !== false,
      updateReadme: complete.update_readme !== false,
      generateDocs: complete.generate_docs === true,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// =============================================================================
// Change Detection
// =============================================================================

/** Keywords indicating CLI changes */
const CLI_PATTERNS = [
  /(?:new|add|added|creates?)\s+(?:CLI\s+)?command/i,
  /--[\w-]+/g,
  /(?:new|add|added)\s+(?:flag|option|argument)/i,
  /`specflow\s+[\w-]+`/g,
  /(?:new|add|added)\s+subcommand/i,
];

/** Keywords indicating API changes */
const API_PATTERNS = [
  /(?:new|add|added)\s+(?:API\s+)?endpoint/i,
  /(?:GET|POST|PUT|DELETE|PATCH)\s+\/[\w/-]+/g,
  /REST\s+API/i,
  /(?:new|add|added)\s+route/i,
];

/** Keywords indicating other user-facing changes */
const USER_FACING_PATTERNS = [
  /(?:new|add|added)\s+(?:feature|capability|functionality)/i,
  /(?:user-facing|user facing|visible to users)/i,
  /(?:new|add|added)\s+(?:output|display|format)/i,
  /(?:new|add|added)\s+(?:configuration|config|setting)/i,
];

/**
 * Detect user-facing changes by scanning spec.md and tasks.md content.
 */
export function detectUserFacingChanges(
  specContent: string | null,
  tasksContent: string | null
): ChangeDetectionResult {
  const result: ChangeDetectionResult = {
    hasUserFacingChanges: false,
    cliChanges: [],
    apiChanges: [],
    otherChanges: [],
  };

  const content = [specContent || "", tasksContent || ""].join("\n");

  // Detect CLI changes
  for (const pattern of CLI_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!result.cliChanges.includes(match)) {
          result.cliChanges.push(match);
        }
      }
    }
  }

  // Detect API changes
  for (const pattern of API_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!result.apiChanges.includes(match)) {
          result.apiChanges.push(match);
        }
      }
    }
  }

  // Detect other user-facing changes
  for (const pattern of USER_FACING_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!result.otherChanges.includes(match)) {
          result.otherChanges.push(match);
        }
      }
    }
  }

  result.hasUserFacingChanges =
    result.cliChanges.length > 0 ||
    result.apiChanges.length > 0 ||
    result.otherChanges.length > 0;

  return result;
}

// =============================================================================
// CHANGELOG Generation
// =============================================================================

/**
 * Extract a short summary from spec.md for the CHANGELOG entry.
 * Looks for the Problem Statement or description section.
 */
export function extractSpecSummary(specContent: string): string {
  // Try to extract from "## Problem" or "## Problem Statement" section
  const problemMatch = specContent.match(
    /##\s*Problem(?:\s+Statement)?\s*\n+([\s\S]*?)(?=\n##|\n---|\Z)/i
  );
  if (problemMatch) {
    const text = problemMatch[1].trim();
    // Take the first paragraph (up to first blank line)
    const firstParagraph = text.split(/\n\s*\n/)[0].trim();
    if (firstParagraph.length > 0 && firstParagraph.length <= 200) {
      return firstParagraph;
    }
    // Truncate long paragraphs
    if (firstParagraph.length > 200) {
      return firstParagraph.slice(0, 197) + "...";
    }
  }

  // Try "## Description" section
  const descMatch = specContent.match(
    /##\s*Description\s*\n+([\s\S]*?)(?=\n##|\n---|\Z)/i
  );
  if (descMatch) {
    const firstParagraph = descMatch[1].trim().split(/\n\s*\n/)[0].trim();
    if (firstParagraph.length > 0) {
      return firstParagraph.slice(0, 200);
    }
  }

  // Fallback: first non-heading, non-empty line
  const lines = specContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      return trimmed.slice(0, 200);
    }
  }

  return "Feature completed";
}

/**
 * Determine the change type for CHANGELOG (Added, Changed, Fixed, etc.)
 * based on feature name/description patterns.
 */
export function determineChangeType(featureName: string): string {
  const lower = featureName.toLowerCase();
  if (lower.includes("fix") || lower.includes("bug")) return "Fixed";
  if (lower.includes("remov") || lower.includes("deprecat")) return "Removed";
  if (lower.includes("chang") || lower.includes("updat") || lower.includes("refactor")) return "Changed";
  if (lower.includes("secur")) return "Security";
  return "Added";
}

/**
 * Generate and append a CHANGELOG entry.
 * Appends under the `## [Unreleased]` section. Creates the section if missing.
 */
export function appendChangelogEntry(
  projectPath: string,
  featureId: string,
  featureName: string,
  summary: string
): string {
  const changelogPath = join(projectPath, "CHANGELOG.md");
  const changeType = determineChangeType(featureName);
  const entry = `- **${featureId} ${featureName}**: ${summary}`;

  if (!existsSync(changelogPath)) {
    // Create new CHANGELOG
    const content = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### ${changeType}
${entry}
`;
    writeFileSync(changelogPath, content);
    return entry;
  }

  let content = readFileSync(changelogPath, "utf-8");

  // Find or create [Unreleased] section
  const unreleasedIndex = content.indexOf("## [Unreleased]");

  if (unreleasedIndex === -1) {
    // Insert [Unreleased] section after the first heading (# Changelog)
    const firstHeadingEnd = content.indexOf("\n", content.indexOf("# "));
    if (firstHeadingEnd !== -1) {
      const before = content.slice(0, firstHeadingEnd + 1);
      const after = content.slice(firstHeadingEnd + 1);
      content = `${before}\n## [Unreleased]\n\n### ${changeType}\n${entry}\n\n${after}`;
    } else {
      content = `## [Unreleased]\n\n### ${changeType}\n${entry}\n\n${content}`;
    }
  } else {
    // Find the change type subsection under [Unreleased]
    const afterUnreleased = content.slice(unreleasedIndex);
    const nextVersionIndex = afterUnreleased.search(/\n## \[(?!Unreleased)/);
    const unreleasedSection =
      nextVersionIndex !== -1
        ? afterUnreleased.slice(0, nextVersionIndex)
        : afterUnreleased;

    const changeTypeHeader = `### ${changeType}`;
    const changeTypeIndex = unreleasedSection.indexOf(changeTypeHeader);

    if (changeTypeIndex !== -1) {
      // Append under existing change type section
      const insertPos = unreleasedIndex + changeTypeIndex + changeTypeHeader.length;
      const lineEnd = content.indexOf("\n", insertPos);
      content =
        content.slice(0, lineEnd + 1) + entry + "\n" + content.slice(lineEnd + 1);
    } else {
      // Add new change type section under [Unreleased]
      const unreleasedEnd = content.indexOf("\n", unreleasedIndex);
      content =
        content.slice(0, unreleasedEnd + 1) +
        `\n### ${changeType}\n${entry}\n` +
        content.slice(unreleasedEnd + 1);
    }
  }

  writeFileSync(changelogPath, content);
  return entry;
}

// =============================================================================
// docs.md Generation
// =============================================================================

/**
 * Generate docs.md content summarizing documentation updates.
 */
export function generateDocsContent(
  featureId: string,
  featureName: string,
  changelogEntry: string | null,
  changeDetection: ChangeDetectionResult,
  readmeSuggestions: string | null
): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString().split("T")[0];

  lines.push(`# Documentation Updates — ${featureId}: ${featureName}`);
  lines.push("");
  lines.push(`Generated: ${timestamp}`);
  lines.push("");

  // CHANGELOG section
  lines.push("## CHANGELOG");
  lines.push("");
  if (changelogEntry) {
    lines.push(`Entry added to CHANGELOG.md:`);
    lines.push(`> ${changelogEntry}`);
  } else {
    lines.push("No CHANGELOG entry generated (disabled in config).");
  }
  lines.push("");

  // User-facing changes section
  lines.push("## User-Facing Changes");
  lines.push("");
  if (changeDetection.hasUserFacingChanges) {
    if (changeDetection.cliChanges.length > 0) {
      lines.push("### CLI Changes");
      for (const change of changeDetection.cliChanges) {
        lines.push(`- ${change}`);
      }
      lines.push("");
    }
    if (changeDetection.apiChanges.length > 0) {
      lines.push("### API Changes");
      for (const change of changeDetection.apiChanges) {
        lines.push(`- ${change}`);
      }
      lines.push("");
    }
    if (changeDetection.otherChanges.length > 0) {
      lines.push("### Other Changes");
      for (const change of changeDetection.otherChanges) {
        lines.push(`- ${change}`);
      }
      lines.push("");
    }
  } else {
    lines.push("No user-facing changes detected (internal/backend feature).");
    lines.push("");
  }

  // README suggestions
  lines.push("## README Update");
  lines.push("");
  if (readmeSuggestions) {
    lines.push("The following README updates are suggested:");
    lines.push("");
    lines.push(readmeSuggestions);
  } else if (changeDetection.hasUserFacingChanges) {
    lines.push("User-facing changes detected. Consider updating README.md with:");
    lines.push("");
    if (changeDetection.cliChanges.length > 0) {
      lines.push("- New CLI commands/options in the Usage section");
    }
    if (changeDetection.apiChanges.length > 0) {
      lines.push("- New API endpoints in the API Reference section");
    }
  } else {
    lines.push("No README update needed (no user-facing changes detected).");
  }
  lines.push("");

  return lines.join("\n");
}

// =============================================================================
// AI-Powered README Suggestions (Headless)
// =============================================================================

/**
 * Generate README update suggestions using AI in headless mode.
 * Returns null if not in headless mode or if AI generation fails.
 */
export async function generateReadmeSuggestions(
  projectPath: string,
  featureId: string,
  featureName: string,
  specContent: string,
  changeDetection: ChangeDetectionResult
): Promise<string | null> {
  if (!isHeadlessMode()) {
    return null;
  }

  if (!changeDetection.hasUserFacingChanges) {
    return null;
  }

  const readmePath = join(projectPath, "README.md");
  let currentReadme = "";
  if (existsSync(readmePath)) {
    currentReadme = readFileSync(readmePath, "utf-8");
    // Truncate to avoid token limit issues
    if (currentReadme.length > 4000) {
      currentReadme = currentReadme.slice(0, 4000) + "\n...(truncated)";
    }
  }

  const prompt = `You are updating documentation for a CLI tool called SpecFlow.

Feature: ${featureId} - ${featureName}

Detected user-facing changes:
- CLI changes: ${changeDetection.cliChanges.join(", ") || "none"}
- API changes: ${changeDetection.apiChanges.join(", ") || "none"}
- Other changes: ${changeDetection.otherChanges.join(", ") || "none"}

Feature spec excerpt:
${specContent.slice(0, 2000)}

Current README (excerpt):
${currentReadme}

Generate ONLY the markdown sections that should be added or updated in the README.
Do NOT include the full README. Only output the new/changed sections.
Keep it concise and match the existing README style.`;

  try {
    const result = await runClaudeHeadless(prompt, {
      systemPrompt:
        "You are a technical writer. Output only markdown content for README updates. Be concise.",
      timeout: 30000,
    });

    if (result.success && result.output.trim().length > 20) {
      return result.output.trim();
    }
  } catch {
    // AI generation is best-effort
  }

  return null;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run documentation generation for a completed feature.
 * Called by `specflow complete` after validation passes.
 */
export async function generateDocs(
  projectPath: string,
  featureId: string,
  featureName: string,
  specPath: string,
  config?: DocGenConfig
): Promise<DocGenResult> {
  const docConfig = config || loadDocGenConfig(projectPath);
  const result: DocGenResult = {
    success: true,
    changelogEntry: null,
    docsContent: null,
    readmeSuggestions: null,
    errors: [],
  };

  // Read spec and tasks content
  const specFile = join(specPath, "spec.md");
  const tasksFile = join(specPath, "tasks.md");
  const docsFile = join(specPath, "docs.md");

  const specContent = existsSync(specFile) ? readFileSync(specFile, "utf-8") : null;
  const tasksContent = existsSync(tasksFile) ? readFileSync(tasksFile, "utf-8") : null;

  // 1. Detect user-facing changes
  const changeDetection = detectUserFacingChanges(specContent, tasksContent);

  // 2. Generate CHANGELOG entry
  if (docConfig.updateChangelog && specContent) {
    try {
      const summary = extractSpecSummary(specContent);
      result.changelogEntry = appendChangelogEntry(
        projectPath,
        featureId,
        featureName,
        summary
      );
    } catch (error) {
      result.errors.push(`CHANGELOG update failed: ${error}`);
    }
  }

  // 3. Generate README suggestions (headless only)
  if (docConfig.updateReadme && specContent && changeDetection.hasUserFacingChanges) {
    try {
      result.readmeSuggestions = await generateReadmeSuggestions(
        projectPath,
        featureId,
        featureName,
        specContent,
        changeDetection
      );
    } catch (error) {
      // Best-effort, don't fail
      result.errors.push(`README suggestion generation failed: ${error}`);
    }
  }

  // 4. Generate docs.md
  try {
    // Don't overwrite if docs.md already exists (user may have manually written it)
    if (existsSync(docsFile)) {
      result.docsContent = readFileSync(docsFile, "utf-8");
    } else {
      result.docsContent = generateDocsContent(
        featureId,
        featureName,
        result.changelogEntry,
        changeDetection,
        result.readmeSuggestions
      );
      writeFileSync(docsFile, result.docsContent);
    }
  } catch (error) {
    result.success = false;
    result.errors.push(`docs.md generation failed: ${error}`);
  }

  return result;
}
