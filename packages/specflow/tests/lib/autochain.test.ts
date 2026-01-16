/**
 * Auto-Chain Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  AutoChainMode,
  AutoChainConfig,
  DEFAULT_AUTOCHAIN_CONFIG,
  VALID_AUTOCHAIN_MODES,
  isValidAutoChainMode,
  getAutoChainConfig,
  getAutoChainDescription,
} from "../../src/lib/autochain";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PROJECT_PATH = "/tmp/specflow-autochain-test";
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

describe("AutoChain Module", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  // ===========================================================================
  // Types and Constants
  // ===========================================================================

  describe("DEFAULT_AUTOCHAIN_CONFIG", () => {
    it("should have prompt as default mode", () => {
      expect(DEFAULT_AUTOCHAIN_CONFIG.mode).toBe("prompt");
    });

    it("should have default as source", () => {
      expect(DEFAULT_AUTOCHAIN_CONFIG.source).toBe("default");
    });
  });

  describe("VALID_AUTOCHAIN_MODES", () => {
    it("should contain prompt, always, and never", () => {
      expect(VALID_AUTOCHAIN_MODES).toContain("prompt");
      expect(VALID_AUTOCHAIN_MODES).toContain("always");
      expect(VALID_AUTOCHAIN_MODES).toContain("never");
    });

    it("should have exactly 3 modes", () => {
      expect(VALID_AUTOCHAIN_MODES).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe("isValidAutoChainMode", () => {
    it("should return true for valid modes", () => {
      expect(isValidAutoChainMode("prompt")).toBe(true);
      expect(isValidAutoChainMode("always")).toBe(true);
      expect(isValidAutoChainMode("never")).toBe(true);
    });

    it("should return false for invalid modes", () => {
      expect(isValidAutoChainMode("invalid")).toBe(false);
      expect(isValidAutoChainMode("")).toBe(false);
      expect(isValidAutoChainMode("PROMPT")).toBe(false);
      expect(isValidAutoChainMode("Always")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidAutoChainMode(null)).toBe(false);
      expect(isValidAutoChainMode(undefined)).toBe(false);
      expect(isValidAutoChainMode(123)).toBe(false);
      expect(isValidAutoChainMode(true)).toBe(false);
      expect(isValidAutoChainMode({})).toBe(false);
    });
  });

  // ===========================================================================
  // Configuration Loader
  // ===========================================================================

  describe("getAutoChainConfig", () => {
    describe("with CLI flag", () => {
      it("should prioritize CLI flag over everything", () => {
        createConstitution(`---
autoChain: always
---
# Constitution`);

        const config = getAutoChainConfig("never", TEST_PROJECT_PATH);
        expect(config.mode).toBe("never");
        expect(config.source).toBe("cli");
      });

      it("should accept 'always' from CLI", () => {
        const config = getAutoChainConfig("always", TEST_PROJECT_PATH);
        expect(config.mode).toBe("always");
        expect(config.source).toBe("cli");
      });

      it("should accept 'never' from CLI", () => {
        const config = getAutoChainConfig("never", TEST_PROJECT_PATH);
        expect(config.mode).toBe("never");
        expect(config.source).toBe("cli");
      });

      it("should accept 'prompt' from CLI", () => {
        const config = getAutoChainConfig("prompt", TEST_PROJECT_PATH);
        expect(config.mode).toBe("prompt");
        expect(config.source).toBe("cli");
      });

      it("should fall back to default for invalid CLI value", () => {
        const config = getAutoChainConfig("invalid", TEST_PROJECT_PATH);
        expect(config.mode).toBe("prompt");
        expect(config.source).toBe("default");
      });
    });

    describe("with constitution.md", () => {
      it("should load autoChain from constitution", () => {
        createConstitution(`---
project: "Test"
autoChain: always
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("always");
        expect(config.source).toBe("constitution");
      });

      it("should load auto-chain (hyphenated) from constitution", () => {
        createConstitution(`---
project: "Test"
auto-chain: never
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("never");
        expect(config.source).toBe("constitution");
      });

      it("should prefer autoChain over auto-chain", () => {
        createConstitution(`---
autoChain: always
auto-chain: never
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("always");
        expect(config.source).toBe("constitution");
      });

      it("should fall back to default for invalid constitution value", () => {
        createConstitution(`---
autoChain: invalid
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("prompt");
        expect(config.source).toBe("default");
      });

      it("should handle quoted values", () => {
        createConstitution(`---
autoChain: "always"
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("always");
        expect(config.source).toBe("constitution");
      });

      it("should handle single-quoted values", () => {
        createConstitution(`---
autoChain: 'never'
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("never");
        expect(config.source).toBe("constitution");
      });
    });

    describe("with default fallback", () => {
      it("should return default when no CLI flag and no constitution", () => {
        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("prompt");
        expect(config.source).toBe("default");
      });

      it("should return default when constitution exists but no autoChain", () => {
        createConstitution(`---
project: "Test"
---
# Constitution`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("prompt");
        expect(config.source).toBe("default");
      });

      it("should return default when constitution has no frontmatter", () => {
        createConstitution(`# Constitution

No frontmatter here.`);

        const config = getAutoChainConfig(undefined, TEST_PROJECT_PATH);
        expect(config.mode).toBe("prompt");
        expect(config.source).toBe("default");
      });
    });
  });

  // ===========================================================================
  // Description
  // ===========================================================================

  describe("getAutoChainDescription", () => {
    it("should describe prompt mode from default", () => {
      const desc = getAutoChainDescription({ mode: "prompt", source: "default" });
      expect(desc).toContain("ask before starting");
      expect(desc).toContain("default");
    });

    it("should describe always mode from CLI", () => {
      const desc = getAutoChainDescription({ mode: "always", source: "cli" });
      expect(desc).toContain("automatically start");
      expect(desc).toContain("CLI flag");
    });

    it("should describe never mode from constitution", () => {
      const desc = getAutoChainDescription({ mode: "never", source: "constitution" });
      expect(desc).toContain("not auto-chain");
      expect(desc).toContain("constitution.md");
    });
  });
});
