/**
 * Tasks Command Auto-Chain Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  getAutoChainConfig,
  getAutoChainDescription,
  DEFAULT_AUTOCHAIN_CONFIG,
} from "../../src/lib/autochain";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PROJECT_PATH = "/tmp/specflow-tasks-autochain-test";
const SPECIFY_DIR = join(TEST_PROJECT_PATH, ".specify");
const MEMORY_DIR = join(SPECIFY_DIR, "memory");
const CONSTITUTION_PATH = join(MEMORY_DIR, "constitution.md");

function createConstitution(content: string): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  writeFileSync(CONSTITUTION_PATH, content);
}

function cleanup(): void {
  if (existsSync(TEST_PROJECT_PATH)) {
    rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Tasks Command Auto-Chain Integration", () => {
  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  });

  afterEach(() => {
    cleanup();
  });

  describe("CLI flag handling", () => {
    it("--auto-chain flag should set mode to always", () => {
      const config = getAutoChainConfig("always", TEST_PROJECT_PATH);
      expect(config.mode).toBe("always");
      expect(config.source).toBe("cli");
    });

    it("--no-auto-chain flag should set mode to never", () => {
      const config = getAutoChainConfig("never", TEST_PROJECT_PATH);
      expect(config.mode).toBe("never");
      expect(config.source).toBe("cli");
    });

    it("CLI flag should override constitution setting", () => {
      createConstitution(`---
autoChain: always
---
# Constitution`);

      const config = getAutoChainConfig("never", TEST_PROJECT_PATH);
      expect(config.mode).toBe("never");
      expect(config.source).toBe("cli");
    });
  });

  describe("constitution.md integration", () => {
    it("should load autoChain: always from constitution", () => {
      createConstitution(`---
project: "Test Project"
autoChain: always
quality-thresholds:
  spec-quality: 80
---
# Project Constitution`);

      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe("always");
      expect(config.source).toBe("constitution");
    });

    it("should load autoChain: never from constitution", () => {
      createConstitution(`---
project: "Test Project"
autoChain: never
---
# Project Constitution`);

      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe("never");
      expect(config.source).toBe("constitution");
    });

    it("should load autoChain: prompt from constitution", () => {
      createConstitution(`---
autoChain: prompt
---
# Constitution`);

      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe("prompt");
      expect(config.source).toBe("constitution");
    });

    it("should use default when constitution has no autoChain", () => {
      createConstitution(`---
project: "Test Project"
quality-thresholds:
  spec-quality: 80
---
# Project Constitution`);

      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe("prompt");
      expect(config.source).toBe("default");
    });
  });

  describe("default behavior", () => {
    it("should use prompt mode by default", () => {
      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe("prompt");
      expect(config.source).toBe("default");
    });

    it("default config should match DEFAULT_AUTOCHAIN_CONFIG", () => {
      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe(DEFAULT_AUTOCHAIN_CONFIG.mode);
      expect(config.source).toBe(DEFAULT_AUTOCHAIN_CONFIG.source);
    });
  });

  describe("description generation", () => {
    it("should describe always mode correctly", () => {
      const desc = getAutoChainDescription({ mode: "always", source: "cli" });
      expect(desc).toContain("automatically");
      expect(desc).toContain("CLI");
    });

    it("should describe never mode correctly", () => {
      const desc = getAutoChainDescription({ mode: "never", source: "constitution" });
      expect(desc).toContain("not auto-chain");
      expect(desc).toContain("constitution");
    });

    it("should describe prompt mode correctly", () => {
      const desc = getAutoChainDescription({ mode: "prompt", source: "default" });
      expect(desc).toContain("ask");
      expect(desc).toContain("default");
    });
  });

  describe("priority order", () => {
    it("should follow CLI > constitution > default priority", () => {
      // Set up constitution with 'always'
      createConstitution(`---
autoChain: always
---
# Constitution`);

      // CLI 'never' should override constitution 'always'
      const withCli = getAutoChainConfig("never", TEST_PROJECT_PATH);
      expect(withCli.mode).toBe("never");
      expect(withCli.source).toBe("cli");

      // Without CLI, constitution should be used
      const withoutCli = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(withoutCli.mode).toBe("always");
      expect(withoutCli.source).toBe("constitution");
    });

    it("should fall back to default when constitution invalid", () => {
      createConstitution(`---
autoChain: invalid-value
---
# Constitution`);

      const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
      expect(config.mode).toBe("prompt");
      expect(config.source).toBe("default");
    });
  });
});
