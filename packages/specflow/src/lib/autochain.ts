/**
 * Auto-Chain Module
 * Opt-in auto-chaining from tasks to implement phase
 *
 * Council Design Decision (F-093):
 * - Default mode is 'prompt' (ask user before chaining)
 * - Can be configured via CLI flag or constitution.md
 * - Priority: CLI flag > constitution.md > default (prompt)
 */

import { join } from "path";
import { existsSync, readFileSync } from "fs";

// =============================================================================
// Types
// =============================================================================

/**
 * Auto-chain mode for transitioning from tasks to implement
 */
export type AutoChainMode = "prompt" | "always" | "never";

/**
 * Auto-chain configuration with source tracking
 */
export interface AutoChainConfig {
  /** The auto-chain mode */
  mode: AutoChainMode;
  /** Where this configuration came from */
  source: "cli" | "constitution" | "default";
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default auto-chain configuration
 */
export const DEFAULT_AUTOCHAIN_CONFIG: AutoChainConfig = {
  mode: "prompt",
  source: "default",
};

/**
 * Valid auto-chain modes
 */
export const VALID_AUTOCHAIN_MODES: AutoChainMode[] = ["prompt", "always", "never"];

// =============================================================================
// Validation
// =============================================================================

/**
 * Check if a value is a valid auto-chain mode
 */
export function isValidAutoChainMode(value: unknown): value is AutoChainMode {
  return typeof value === "string" && VALID_AUTOCHAIN_MODES.includes(value as AutoChainMode);
}

// =============================================================================
// Configuration Loader
// =============================================================================

/**
 * Extract YAML frontmatter from markdown content
 */
function extractFrontmatter(content: string): Record<string, unknown> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const yaml = frontmatterMatch[1];
  const result: Record<string, unknown> = {};

  // Simple YAML parsing for key: value pairs
  for (const line of yaml.split("\n")) {
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, "").trim();
      result[key] = cleanValue;
    }
  }

  return result;
}

/**
 * Load auto-chain mode from constitution.md
 */
function loadFromConstitution(projectPath: string): AutoChainMode | null {
  const constitutionPath = join(projectPath, ".specify", "memory", "constitution.md");

  if (!existsSync(constitutionPath)) {
    return null;
  }

  try {
    const content = readFileSync(constitutionPath, "utf-8");
    const frontmatter = extractFrontmatter(content);

    const autoChainValue = frontmatter["autoChain"] ?? frontmatter["auto-chain"];

    if (autoChainValue === undefined) {
      return null;
    }

    if (isValidAutoChainMode(autoChainValue)) {
      return autoChainValue;
    }

    // Warn about invalid value
    console.warn(
      `⚠ Invalid autoChain value in constitution.md: "${autoChainValue}". ` +
      `Valid values: ${VALID_AUTOCHAIN_MODES.join(", ")}. Using default: prompt`
    );
    return null;
  } catch {
    return null;
  }
}

/**
 * Get auto-chain configuration with priority resolution
 *
 * Priority order:
 * 1. CLI flag (--auto-chain or --no-auto-chain)
 * 2. constitution.md autoChain setting
 * 3. Default (prompt)
 *
 * @param cliFlag - CLI flag value: "always", "never", or undefined
 * @param projectPath - Path to project root
 * @returns Auto-chain configuration with source
 */
export function getAutoChainConfig(
  cliFlag: string | undefined,
  projectPath: string
): AutoChainConfig {
  // Priority 1: CLI flag
  if (cliFlag !== undefined) {
    if (isValidAutoChainMode(cliFlag)) {
      return { mode: cliFlag, source: "cli" };
    }
    console.warn(
      `⚠ Invalid CLI auto-chain value: "${cliFlag}". ` +
      `Valid values: ${VALID_AUTOCHAIN_MODES.join(", ")}. Using default: prompt`
    );
  }

  // Priority 2: constitution.md
  const constitutionMode = loadFromConstitution(projectPath);
  if (constitutionMode !== null) {
    return { mode: constitutionMode, source: "constitution" };
  }

  // Priority 3: Default
  return DEFAULT_AUTOCHAIN_CONFIG;
}

/**
 * Get a human-readable description of the auto-chain mode
 */
export function getAutoChainDescription(config: AutoChainConfig): string {
  const modeDescriptions: Record<AutoChainMode, string> = {
    prompt: "Will ask before starting implementation",
    always: "Will automatically start implementation",
    never: "Will not auto-chain to implementation",
  };

  const sourceDescriptions: Record<AutoChainConfig["source"], string> = {
    cli: "from CLI flag",
    constitution: "from constitution.md",
    default: "default",
  };

  return `${modeDescriptions[config.mode]} (${sourceDescriptions[config.source]})`;
}
