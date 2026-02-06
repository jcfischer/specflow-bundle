/**
 * Platform Detection Module
 * 
 * Detects the current AI platform (Claude Code vs OpenCode) and provides
 * platform-agnostic path resolution.
 * 
 * Priority Order:
 * 1. PAI_DIR environment variable (explicit override)
 * 2. OPENCODE_DIR environment variable (OpenCode specific)
 * 3. Directory structure detection (~/.claude vs ~/.opencode)
 * 4. Manual fallback with error
 * 
 * @module lib/platform
 */

import { homedir } from "os";
import { existsSync } from "fs";

export type Platform = "claudecode" | "opencode" | "unknown";

export interface PlatformInfo {
  platform: Platform;
  rootDir: string;
  skillsDir: string;
  memoryDir: string;
  executionDir: string;
  projectsDir: string;
}

/**
 * Detects the current platform based on environment variables and directory structure.
 * 
 * @returns Platform identifier
 */
export function detectPlatform(): Platform {
  // Priority 1: PAI_DIR environment variable (legacy Claude Code)
  if (process.env.PAI_DIR) {
    return "claudecode";
  }
  
  // Priority 2: OPENCODE_DIR environment variable
  if (process.env.OPENCODE_DIR) {
    return "opencode";
  }
  
  // Priority 3: Directory structure detection
  const home = homedir();
  const claudeDir = `${home}/.claude`;
  const opencodeDir = `${home}/.opencode`;
  
  // Check which directory exists
  if (existsSync(claudeDir)) {
    return "claudecode";
  }
  if (existsSync(opencodeDir)) {
    return "opencode";
  }
  
  return "unknown";
}

/**
 * Gets the root directory for the current platform.
 * 
 * @returns Absolute path to platform root directory
 * @throws Error if platform cannot be detected
 */
export function getRootDir(): string {
  const platform = detectPlatform();
  const home = homedir();
  
  switch (platform) {
    case "claudecode":
      return process.env.PAI_DIR || `${home}/.claude`;
    case "opencode":
      return process.env.OPENCODE_DIR || `${home}/.opencode`;
    case "unknown":
      throw new Error(
        "Platform detection failed. Set PAI_DIR or OPENCODE_DIR environment variable, " +
        "or ensure ~/.claude or ~/.opencode directory exists."
      );
  }
}

/**
 * Gets complete platform information including all standard directories.
 * 
 * @returns PlatformInfo object with all resolved paths
 */
export function getPlatformInfo(): PlatformInfo {
  const platform = detectPlatform();
  const rootDir = getRootDir();
  
  return {
    platform,
    rootDir,
    skillsDir: `${rootDir}/skills`,
    memoryDir: `${rootDir}/MEMORY`,
    executionDir: `${rootDir}/MEMORY/execution`,
    projectsDir: `${rootDir}/MEMORY/projects`,
  };
}

/**
 * Resolves a relative path to an absolute path based on platform root.
 * 
 * @param relativePath - Path relative to platform root (e.g., "skills/SpecFlow")
 * @returns Absolute path
 */
export function resolvePath(relativePath: string): string {
  const rootDir = getRootDir();
  
  // Handle paths that already start with /
  if (relativePath.startsWith("/")) {
    return relativePath;
  }
  
  // Handle paths that start with ~/
  if (relativePath.startsWith("~/")) {
    const home = homedir();
    return `${home}/${relativePath.slice(2)}`;
  }
  
  return `${rootDir}/${relativePath}`;
}

/**
 * Gets the feature execution directory for a given feature name.
 * 
 * @param featureName - Name of the feature (e.g., "contact-enrichment")
 * @returns Absolute path to feature execution directory
 */
export function getFeatureDir(featureName: string): string {
  const { executionDir } = getPlatformInfo();
  return `${executionDir}/Features/${featureName}`;
}

/**
 * Gets the project directory for a given project name.
 * 
 * @param projectName - Name of the project (e.g., "specflow-bundle")
 * @returns Absolute path to project directory
 */
export function getProjectDir(projectName: string): string {
  const { projectsDir } = getPlatformInfo();
  return `${projectsDir}/${projectName}`;
}

/**
 * Gets the specs directory for a given feature.
 * 
 * @param featureName - Name of the feature
 * @returns Absolute path to specs directory
 */
export function getSpecsDir(featureName: string): string {
  return `${getFeatureDir(featureName)}/specs`;
}

/**
 * Checks if running on OpenCode platform.
 */
export function isOpenCode(): boolean {
  return detectPlatform() === "opencode";
}

/**
 * Checks if running on Claude Code platform.
 */
export function isClaudeCode(): boolean {
  return detectPlatform() === "claudecode";
}
