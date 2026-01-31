import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { existsSync, mkdirSync, rmSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../../src/lib/database";
import {
  getContribState,
  createContribState,
  updateContribGate,
  updateContribInventory,
  updateContribSanitization,
  updateContribTag,
  updateContribBranch,
  updateContribVerification,
  deleteContribState,
} from "../../../src/lib/contrib-prep";

const TEST_PROJECT_DIR = "/tmp/specflow-contrib-state-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

describe("contrib-prep state", () => {
  beforeEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
    initDatabase(TEST_DB_PATH);
    addFeature({
      id: "F-1",
      name: "Test Feature",
      description: "A test feature",
      priority: 1,
    });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  describe("createContribState", () => {
    it("should create initial state with defaults", () => {
      const state = createContribState("F-1");

      expect(state.featureId).toBe("F-1");
      expect(state.gate).toBe(0);
      expect(state.inventoryIncluded).toBe(0);
      expect(state.inventoryExcluded).toBe(0);
      expect(state.sanitizationPass).toBeNull();
      expect(state.sanitizationFindings).toBe(0);
      expect(state.tagName).toBeNull();
      expect(state.tagHash).toBeNull();
      expect(state.contribBranch).toBeNull();
      expect(state.verificationPass).toBeNull();
      expect(state.baseBranch).toBe("main");
      expect(state.createdAt).toBeInstanceOf(Date);
      expect(state.updatedAt).toBeInstanceOf(Date);
    });

    it("should accept custom base branch", () => {
      const state = createContribState("F-1", "develop");

      expect(state.baseBranch).toBe("develop");
    });
  });

  describe("getContribState", () => {
    it("should return null for unknown feature", () => {
      const state = getContribState("F-999");
      expect(state).toBeNull();
    });

    it("should return state after creation", () => {
      createContribState("F-1");
      const state = getContribState("F-1");

      expect(state).not.toBeNull();
      expect(state!.featureId).toBe("F-1");
    });
  });

  describe("updateContribGate", () => {
    it("should advance gate forward", () => {
      createContribState("F-1");

      const result = updateContribGate("F-1", 1);
      expect(result.success).toBe(true);

      const state = getContribState("F-1");
      expect(state!.gate).toBe(1);
    });

    it("should allow advancing through all gates", () => {
      createContribState("F-1");

      for (let gate = 1; gate <= 5; gate++) {
        const result = updateContribGate("F-1", gate);
        expect(result.success).toBe(true);
      }

      const state = getContribState("F-1");
      expect(state!.gate).toBe(5);
    });

    it("should not allow moving gate backward", () => {
      createContribState("F-1");
      updateContribGate("F-1", 3);

      const result = updateContribGate("F-1", 2);
      expect(result.success).toBe(false);
      expect(result.error).toContain("backward");
    });

    it("should not allow same gate", () => {
      createContribState("F-1");
      updateContribGate("F-1", 2);

      const result = updateContribGate("F-1", 2);
      expect(result.success).toBe(false);
    });

    it("should not allow gate above 5", () => {
      createContribState("F-1");

      const result = updateContribGate("F-1", 6);
      expect(result.success).toBe(false);
      expect(result.error).toContain("exceed 5");
    });

    it("should error for unknown feature", () => {
      const result = updateContribGate("F-999", 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("No contrib state");
    });
  });

  describe("updateContribInventory", () => {
    it("should update inventory counts", () => {
      createContribState("F-1");

      updateContribInventory("F-1", 47, 12);

      const state = getContribState("F-1");
      expect(state!.inventoryIncluded).toBe(47);
      expect(state!.inventoryExcluded).toBe(12);
    });

    it("should update the updatedAt timestamp", () => {
      createContribState("F-1");
      const before = getContribState("F-1")!.updatedAt;

      // Small delay to ensure timestamp differs
      Bun.sleepSync(10);
      updateContribInventory("F-1", 10, 5);

      const after = getContribState("F-1")!.updatedAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe("updateContribSanitization", () => {
    it("should record passing sanitization", () => {
      createContribState("F-1");

      updateContribSanitization("F-1", true, 0);

      const state = getContribState("F-1");
      expect(state!.sanitizationPass).toBe(true);
      expect(state!.sanitizationFindings).toBe(0);
    });

    it("should record failing sanitization with findings", () => {
      createContribState("F-1");

      updateContribSanitization("F-1", false, 3);

      const state = getContribState("F-1");
      expect(state!.sanitizationPass).toBe(false);
      expect(state!.sanitizationFindings).toBe(3);
    });
  });

  describe("updateContribTag", () => {
    it("should store tag name and hash", () => {
      createContribState("F-1");

      updateContribTag("F-1", "myproject-v1.0.0", "abc123def456");

      const state = getContribState("F-1");
      expect(state!.tagName).toBe("myproject-v1.0.0");
      expect(state!.tagHash).toBe("abc123def456");
    });
  });

  describe("updateContribBranch", () => {
    it("should store contrib branch name", () => {
      createContribState("F-1");

      updateContribBranch("F-1", "contrib/F-1");

      const state = getContribState("F-1");
      expect(state!.contribBranch).toBe("contrib/F-1");
    });
  });

  describe("updateContribVerification", () => {
    it("should record passing verification", () => {
      createContribState("F-1");

      updateContribVerification("F-1", true);

      const state = getContribState("F-1");
      expect(state!.verificationPass).toBe(true);
    });

    it("should record failing verification", () => {
      createContribState("F-1");

      updateContribVerification("F-1", false);

      const state = getContribState("F-1");
      expect(state!.verificationPass).toBe(false);
    });
  });

  describe("deleteContribState", () => {
    it("should remove state entirely", () => {
      createContribState("F-1");
      expect(getContribState("F-1")).not.toBeNull();

      deleteContribState("F-1");
      expect(getContribState("F-1")).toBeNull();
    });

    it("should not error for non-existent state", () => {
      expect(() => deleteContribState("F-999")).not.toThrow();
    });
  });

  describe("resume workflow", () => {
    it("should preserve full state across reads", () => {
      createContribState("F-1", "develop");
      updateContribGate("F-1", 2);
      updateContribInventory("F-1", 30, 8);
      updateContribSanitization("F-1", true, 0);

      const state = getContribState("F-1");
      expect(state!.gate).toBe(2);
      expect(state!.inventoryIncluded).toBe(30);
      expect(state!.inventoryExcluded).toBe(8);
      expect(state!.sanitizationPass).toBe(true);
      expect(state!.baseBranch).toBe("develop");
    });
  });
});
