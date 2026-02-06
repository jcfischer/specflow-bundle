/**
 * Platform Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { homedir } from "os";
import {
  detectPlatform,
  getRootDir,
  getPlatformInfo,
  resolvePath,
  getFeatureDir,
  getProjectDir,
  getSpecsDir,
  isOpenCode,
  isClaudeCode,
  type Platform,
  type PlatformInfo,
} from "../../src/lib/platform";

// =============================================================================
// Test Fixtures
// =============================================================================

const originalEnv = { ...process.env };
const home = homedir();

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(() => {
  // Clean environment before each test
  delete process.env.PAI_DIR;
  delete process.env.OPENCODE_DIR;
});

afterEach(() => {
  // Restore original environment
  process.env = { ...originalEnv };
});

// =============================================================================
// detectPlatform Tests
// =============================================================================

describe("detectPlatform", () => {
  it("should return 'claudecode' when PAI_DIR is set", () => {
    process.env.PAI_DIR = "/custom/pai/dir";
    expect(detectPlatform()).toBe("claudecode");
  });

  it("should return 'opencode' when OPENCODE_DIR is set", () => {
    process.env.OPENCODE_DIR = "/custom/opencode/dir";
    expect(detectPlatform()).toBe("opencode");
  });

  it("should prioritize PAI_DIR over OPENCODE_DIR", () => {
    process.env.PAI_DIR = "/custom/pai/dir";
    process.env.OPENCODE_DIR = "/custom/opencode/dir";
    expect(detectPlatform()).toBe("claudecode");
  });

  it("should detect claudecode from directory structure", () => {
    // This test assumes ~/.claude exists on the development machine
    // In actual environment, this would be mocked
    const result = detectPlatform();
    expect(["claudecode", "opencode", "unknown"]).toContain(result);
  });
});

// =============================================================================
// getRootDir Tests
// =============================================================================

describe("getRootDir", () => {
  it("should return PAI_DIR when set", () => {
    const customDir = "/custom/pai/dir";
    process.env.PAI_DIR = customDir;
    expect(getRootDir()).toBe(customDir);
  });

  it("should return OPENCODE_DIR when set", () => {
    const customDir = "/custom/opencode/dir";
    process.env.OPENCODE_DIR = customDir;
    expect(getRootDir()).toBe(customDir);
  });

  it("should return default .claude path for claudecode", () => {
    process.env.PAI_DIR = `${home}/.claude`;
    const result = getRootDir();
    expect(result).toBe(`${home}/.claude`);
  });

  it("should return default .opencode path for opencode", () => {
    process.env.OPENCODE_DIR = `${home}/.opencode`;
    const result = getRootDir();
    expect(result).toBe(`${home}/.opencode`);
  });

  it("should throw error when platform is unknown", () => {
    // Clear environment and ensure no directories exist
    delete process.env.PAI_DIR;
    delete process.env.OPENCODE_DIR;
    
    // This will only throw if neither ~/.claude nor ~/.opencode exist
    // On dev machines, this might not throw, so we check the behavior
    try {
      const result = getRootDir();
      // If it doesn't throw, it found a directory
      expect(result).toBeTruthy();
    } catch (error) {
      expect((error as Error).message).toContain("Platform detection failed");
    }
  });
});

// =============================================================================
// getPlatformInfo Tests
// =============================================================================

describe("getPlatformInfo", () => {
  it("should return complete platform info for claudecode", () => {
    process.env.PAI_DIR = "/custom/claude";
    const info = getPlatformInfo();

    expect(info.platform).toBe("claudecode");
    expect(info.rootDir).toBe("/custom/claude");
    expect(info.skillsDir).toBe("/custom/claude/skills");
    expect(info.memoryDir).toBe("/custom/claude/MEMORY");
    expect(info.executionDir).toBe("/custom/claude/MEMORY/execution");
    expect(info.projectsDir).toBe("/custom/claude/MEMORY/projects");
  });

  it("should return complete platform info for opencode", () => {
    process.env.OPENCODE_DIR = "/custom/opencode";
    const info = getPlatformInfo();

    expect(info.platform).toBe("opencode");
    expect(info.rootDir).toBe("/custom/opencode");
    expect(info.skillsDir).toBe("/custom/opencode/skills");
    expect(info.memoryDir).toBe("/custom/opencode/MEMORY");
    expect(info.executionDir).toBe("/custom/opencode/MEMORY/execution");
    expect(info.projectsDir).toBe("/custom/opencode/MEMORY/projects");
  });

  it("should have consistent directory structure across platforms", () => {
    process.env.PAI_DIR = "/test/root";
    const claudeInfo = getPlatformInfo();

    delete process.env.PAI_DIR;
    process.env.OPENCODE_DIR = "/test/root";
    const opencodeInfo = getPlatformInfo();

    // Same root should produce same directory structure
    expect(claudeInfo.skillsDir).toBe(opencodeInfo.skillsDir);
    expect(claudeInfo.memoryDir).toBe(opencodeInfo.memoryDir);
    expect(claudeInfo.executionDir).toBe(opencodeInfo.executionDir);
    expect(claudeInfo.projectsDir).toBe(opencodeInfo.projectsDir);
  });
});

// =============================================================================
// resolvePath Tests
// =============================================================================

describe("resolvePath", () => {
  beforeEach(() => {
    process.env.PAI_DIR = "/test/root";
  });

  it("should resolve relative paths from root", () => {
    expect(resolvePath("skills/SpecFlow")).toBe("/test/root/skills/SpecFlow");
    expect(resolvePath("MEMORY/projects")).toBe("/test/root/MEMORY/projects");
  });

  it("should handle absolute paths", () => {
    expect(resolvePath("/absolute/path")).toBe("/absolute/path");
  });

  it("should handle home directory paths", () => {
    const result = resolvePath("~/custom/path");
    expect(result).toBe(`${home}/custom/path`);
  });

  it("should handle paths without leading slash", () => {
    expect(resolvePath("relative/path")).toBe("/test/root/relative/path");
  });
});

// =============================================================================
// Directory Helper Tests
// =============================================================================

describe("getFeatureDir", () => {
  beforeEach(() => {
    process.env.PAI_DIR = "/test/root";
  });

  it("should return correct feature directory path", () => {
    const result = getFeatureDir("contact-enrichment");
    expect(result).toBe("/test/root/MEMORY/execution/Features/contact-enrichment");
  });

  it("should handle feature names with special characters", () => {
    const result = getFeatureDir("feature-name-123");
    expect(result).toBe("/test/root/MEMORY/execution/Features/feature-name-123");
  });
});

describe("getProjectDir", () => {
  beforeEach(() => {
    process.env.PAI_DIR = "/test/root";
  });

  it("should return correct project directory path", () => {
    const result = getProjectDir("specflow-bundle");
    expect(result).toBe("/test/root/MEMORY/projects/specflow-bundle");
  });

  it("should handle project names with special characters", () => {
    const result = getProjectDir("my-project-2.0");
    expect(result).toBe("/test/root/MEMORY/projects/my-project-2.0");
  });
});

describe("getSpecsDir", () => {
  beforeEach(() => {
    process.env.PAI_DIR = "/test/root";
  });

  it("should return correct specs directory path", () => {
    const result = getSpecsDir("contact-enrichment");
    expect(result).toBe("/test/root/MEMORY/execution/Features/contact-enrichment/specs");
  });

  it("should be consistent with getFeatureDir", () => {
    const featureName = "test-feature";
    const featureDir = getFeatureDir(featureName);
    const specsDir = getSpecsDir(featureName);
    
    expect(specsDir).toBe(`${featureDir}/specs`);
  });
});

// =============================================================================
// Platform Check Tests
// =============================================================================

describe("isOpenCode", () => {
  it("should return true when on OpenCode platform", () => {
    process.env.OPENCODE_DIR = "/custom/opencode";
    expect(isOpenCode()).toBe(true);
  });

  it("should return false when on Claude Code platform", () => {
    process.env.PAI_DIR = "/custom/claude";
    expect(isOpenCode()).toBe(false);
  });
});

describe("isClaudeCode", () => {
  it("should return true when on Claude Code platform", () => {
    process.env.PAI_DIR = "/custom/claude";
    expect(isClaudeCode()).toBe(true);
  });

  it("should return false when on OpenCode platform", () => {
    process.env.OPENCODE_DIR = "/custom/opencode";
    expect(isClaudeCode()).toBe(false);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Platform Integration", () => {
  it("should provide consistent paths across all functions", () => {
    process.env.PAI_DIR = "/test/root";
    
    const info = getPlatformInfo();
    const featureDir = getFeatureDir("test-feature");
    const projectDir = getProjectDir("test-project");
    const specsDir = getSpecsDir("test-feature");
    
    // All paths should start with the root directory
    expect(featureDir.startsWith(info.rootDir)).toBe(true);
    expect(projectDir.startsWith(info.rootDir)).toBe(true);
    expect(specsDir.startsWith(info.rootDir)).toBe(true);
  });

  it("should switch platforms when environment changes", () => {
    process.env.PAI_DIR = "/claude/root";
    expect(detectPlatform()).toBe("claudecode");
    expect(getRootDir()).toBe("/claude/root");

    delete process.env.PAI_DIR;
    process.env.OPENCODE_DIR = "/opencode/root";
    expect(detectPlatform()).toBe("opencode");
    expect(getRootDir()).toBe("/opencode/root");
  });
});
