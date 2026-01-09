/**
 * Registry Tests - TDD for spec numbering system
 *
 * RED PHASE: These tests should FAIL until implementation is complete
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createRegistry,
  loadRegistry,
  saveRegistry,
  getNextId,
  assignSpec,
  listSpecs,
  findSpecById,
  findSpecByFeature,
  formatId,
  updateStatus,
  scanSpecs,
} from "../src/registry";
import type { SpecRegistry, SpecEntry } from "../src/types";

const TEST_DIR = join(import.meta.dir, "fixtures", "temp");
const TEST_REGISTRY = join(TEST_DIR, "spec-registry.json");

describe("Registry Management", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("formatId", () => {
    it("should format single digit as 3-digit padded string", () => {
      expect(formatId(1)).toBe("001");
    });

    it("should format double digit as 3-digit padded string", () => {
      expect(formatId(42)).toBe("042");
    });

    it("should format triple digit as-is", () => {
      expect(formatId(123)).toBe("123");
    });

    it("should handle zero", () => {
      expect(formatId(0)).toBe("000");
    });
  });

  describe("createRegistry", () => {
    it("should create a new empty registry", () => {
      const registry = createRegistry();
      expect(registry.version).toBe("1.0.0");
      expect(registry.lastId).toBe(0);
      expect(registry.specs).toEqual([]);
    });
  });

  describe("loadRegistry", () => {
    it("should load existing registry from file", async () => {
      const existingRegistry: SpecRegistry = {
        version: "1.0.0",
        lastId: 3,
        specs: [
          {
            id: "001",
            feature: "test-feature",
            skill: "test-skill",
            path: "test-skill/.specify/specs/test-feature",
            status: "draft",
            created: "2025-12-19",
          },
        ],
      };
      await writeFile(TEST_REGISTRY, JSON.stringify(existingRegistry, null, 2));

      const loaded = await loadRegistry(TEST_REGISTRY);
      expect(loaded.success).toBe(true);
      expect(loaded.data?.lastId).toBe(3);
      expect(loaded.data?.specs).toHaveLength(1);
      expect(loaded.data?.specs[0].feature).toBe("test-feature");
    });

    it("should return error for non-existent file", async () => {
      const result = await loadRegistry(join(TEST_DIR, "missing.json"));
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return error for invalid JSON", async () => {
      await writeFile(TEST_REGISTRY, "{ invalid json }");
      const result = await loadRegistry(TEST_REGISTRY);
      expect(result.success).toBe(false);
      expect(result.error).toContain("parse");
    });
  });

  describe("saveRegistry", () => {
    it("should save registry to file", async () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 5,
        specs: [],
      };

      const result = await saveRegistry(TEST_REGISTRY, registry);
      expect(result.success).toBe(true);

      const content = await readFile(TEST_REGISTRY, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.lastId).toBe(5);
    });

    it("should create parent directories if needed", async () => {
      const nestedPath = join(TEST_DIR, "nested", "deep", "registry.json");
      const registry = createRegistry();

      const result = await saveRegistry(nestedPath, registry);
      expect(result.success).toBe(true);

      const content = await readFile(nestedPath, "utf-8");
      expect(JSON.parse(content)).toBeDefined();
    });
  });

  describe("getNextId", () => {
    it("should return 1 for empty registry", () => {
      const registry = createRegistry();
      expect(getNextId(registry)).toBe(1);
    });

    it("should return lastId + 1", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 42,
        specs: [],
      };
      expect(getNextId(registry)).toBe(43);
    });
  });

  describe("assignSpec", () => {
    it("should assign new ID and add spec to registry", () => {
      const registry = createRegistry();

      const result = assignSpec(registry, {
        feature: "clean-inbox",
        skill: "email",
        path: "email/.specify/specs/clean-inbox",
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe("001");
      expect(registry.lastId).toBe(1);
      expect(registry.specs).toHaveLength(1);
      expect(registry.specs[0].feature).toBe("clean-inbox");
    });

    it("should increment ID for subsequent specs", () => {
      const registry = createRegistry();

      assignSpec(registry, {
        feature: "spec-1",
        skill: "skill-a",
        path: "skill-a/.specify/specs/spec-1",
      });

      const result = assignSpec(registry, {
        feature: "spec-2",
        skill: "skill-b",
        path: "skill-b/.specify/specs/spec-2",
      });

      expect(result.data?.id).toBe("002");
      expect(registry.lastId).toBe(2);
      expect(registry.specs).toHaveLength(2);
    });

    it("should reject duplicate feature in same skill", () => {
      const registry = createRegistry();

      assignSpec(registry, {
        feature: "same-feature",
        skill: "email",
        path: "email/.specify/specs/same-feature",
      });

      const result = assignSpec(registry, {
        feature: "same-feature",
        skill: "email",
        path: "email/.specify/specs/same-feature",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("should allow same feature name in different skills", () => {
      const registry = createRegistry();

      assignSpec(registry, {
        feature: "migration",
        skill: "email",
        path: "email/.specify/specs/migration",
      });

      const result = assignSpec(registry, {
        feature: "migration",
        skill: "tana",
        path: "tana/.specify/specs/migration",
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe("002");
    });

    it("should use provided status and created date", () => {
      const registry = createRegistry();

      const result = assignSpec(registry, {
        feature: "test",
        skill: "test-skill",
        path: "test-skill/.specify/specs/test",
        status: "in-progress",
        created: "2025-01-15",
      });

      expect(result.data?.status).toBe("in-progress");
      expect(registry.specs[0].created).toBe("2025-01-15");
    });
  });

  describe("listSpecs", () => {
    it("should return all specs", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 2,
        specs: [
          {
            id: "001",
            feature: "feat-1",
            skill: "skill-a",
            path: "skill-a/.specify/specs/feat-1",
            status: "draft",
            created: "2025-12-01",
          },
          {
            id: "002",
            feature: "feat-2",
            skill: "skill-b",
            path: "skill-b/.specify/specs/feat-2",
            status: "completed",
            created: "2025-12-02",
          },
        ],
      };

      const specs = listSpecs(registry);
      expect(specs).toHaveLength(2);
    });

    it("should filter by skill", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 2,
        specs: [
          {
            id: "001",
            feature: "feat-1",
            skill: "email",
            path: "email/.specify/specs/feat-1",
            status: "draft",
            created: "2025-12-01",
          },
          {
            id: "002",
            feature: "feat-2",
            skill: "tana",
            path: "tana/.specify/specs/feat-2",
            status: "draft",
            created: "2025-12-02",
          },
        ],
      };

      const specs = listSpecs(registry, { skill: "email" });
      expect(specs).toHaveLength(1);
      expect(specs[0].skill).toBe("email");
    });

    it("should filter by status", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 2,
        specs: [
          {
            id: "001",
            feature: "feat-1",
            skill: "skill-a",
            path: "skill-a/.specify/specs/feat-1",
            status: "draft",
            created: "2025-12-01",
          },
          {
            id: "002",
            feature: "feat-2",
            skill: "skill-b",
            path: "skill-b/.specify/specs/feat-2",
            status: "completed",
            created: "2025-12-02",
          },
        ],
      };

      const specs = listSpecs(registry, { status: "completed" });
      expect(specs).toHaveLength(1);
      expect(specs[0].status).toBe("completed");
    });
  });

  describe("findSpecById", () => {
    it("should find spec by ID", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 2,
        specs: [
          {
            id: "001",
            feature: "feat-1",
            skill: "skill-a",
            path: "skill-a/.specify/specs/feat-1",
            status: "draft",
            created: "2025-12-01",
          },
          {
            id: "002",
            feature: "feat-2",
            skill: "skill-b",
            path: "skill-b/.specify/specs/feat-2",
            status: "draft",
            created: "2025-12-02",
          },
        ],
      };

      const spec = findSpecById(registry, "002");
      expect(spec?.feature).toBe("feat-2");
    });

    it("should return undefined for non-existent ID", () => {
      const registry = createRegistry();
      const spec = findSpecById(registry, "999");
      expect(spec).toBeUndefined();
    });
  });

  describe("findSpecByFeature", () => {
    it("should find spec by feature and skill", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 1,
        specs: [
          {
            id: "001",
            feature: "clean-inbox",
            skill: "email",
            path: "email/.specify/specs/clean-inbox",
            status: "draft",
            created: "2025-12-01",
          },
        ],
      };

      const spec = findSpecByFeature(registry, "clean-inbox", "email");
      expect(spec?.id).toBe("001");
    });

    it("should return undefined when skill doesn't match", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 1,
        specs: [
          {
            id: "001",
            feature: "clean-inbox",
            skill: "email",
            path: "email/.specify/specs/clean-inbox",
            status: "draft",
            created: "2025-12-01",
          },
        ],
      };

      const spec = findSpecByFeature(registry, "clean-inbox", "tana");
      expect(spec).toBeUndefined();
    });
  });

  describe("updateStatus", () => {
    it("should update status of existing spec by ID", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 1,
        specs: [
          {
            id: "001",
            feature: "clean-inbox",
            skill: "email",
            path: "email/.specify/specs/clean-inbox",
            status: "draft",
            created: "2025-12-01",
          },
        ],
      };

      const result = updateStatus(registry, "001", "completed");
      expect(result.success).toBe(true);
      expect(registry.specs[0].status).toBe("completed");
    });

    it("should update status from draft to in-progress", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 1,
        specs: [
          {
            id: "001",
            feature: "test",
            skill: "test-skill",
            path: "test-skill/.specify/specs/test",
            status: "draft",
            created: "2025-12-01",
          },
        ],
      };

      const result = updateStatus(registry, "001", "in-progress");
      expect(result.success).toBe(true);
      expect(registry.specs[0].status).toBe("in-progress");
    });

    it("should return error for non-existent ID", () => {
      const registry = createRegistry();
      const result = updateStatus(registry, "999", "completed");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return the updated spec entry", () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 1,
        specs: [
          {
            id: "001",
            feature: "test",
            skill: "email",
            path: "email/.specify/specs/test",
            status: "draft",
            created: "2025-12-01",
          },
        ],
      };

      const result = updateStatus(registry, "001", "completed");
      expect(result.data?.id).toBe("001");
      expect(result.data?.status).toBe("completed");
    });
  });

  describe("scanSpecs", () => {
    const SCAN_DIR = join(import.meta.dir, "fixtures", "scan-test");

    beforeEach(async () => {
      // Create test directory structure mimicking skills
      await mkdir(join(SCAN_DIR, "email", ".specify", "specs", "feature-a"), {
        recursive: true,
      });
      await mkdir(join(SCAN_DIR, "email", ".specify", "specs", "feature-b"), {
        recursive: true,
      });
      await mkdir(join(SCAN_DIR, "tana", ".specify", "specs", "feature-c"), {
        recursive: true,
      });

      // Create spec.md files with frontmatter
      await writeFile(
        join(SCAN_DIR, "email", ".specify", "specs", "feature-a", "spec.md"),
        `---
id: "001"
feature: "feature-a"
status: "draft"
created: "2025-12-01"
---

# Specification: Feature A
`
      );

      await writeFile(
        join(SCAN_DIR, "email", ".specify", "specs", "feature-b", "spec.md"),
        `---
feature: "feature-b"
status: "in-progress"
created: "2025-12-02"
---

# Specification: Feature B
`
      );

      await writeFile(
        join(SCAN_DIR, "tana", ".specify", "specs", "feature-c", "spec.md"),
        `# Specification: Feature C

**Status**: Draft
**Created**: 2025-12-03
`
      );
    });

    afterEach(async () => {
      await rm(SCAN_DIR, { recursive: true, force: true });
    });

    it("should find all spec.md files in .specify/specs directories", async () => {
      const registry = createRegistry();
      const result = await scanSpecs(SCAN_DIR, registry);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it("should filter out already registered specs", async () => {
      const registry: SpecRegistry = {
        version: "1.0.0",
        lastId: 1,
        specs: [
          {
            id: "001",
            feature: "feature-a",
            skill: "email",
            path: "email/.specify/specs/feature-a",
            status: "draft",
            created: "2025-12-01",
          },
        ],
      };

      const result = await scanSpecs(SCAN_DIR, registry);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data!.find((s) => s.feature === "feature-a")).toBeUndefined();
    });

    it("should extract feature name from directory path", async () => {
      const registry = createRegistry();
      const result = await scanSpecs(SCAN_DIR, registry);

      expect(result.success).toBe(true);
      const features = result.data!.map((s) => s.feature);
      expect(features).toContain("feature-a");
      expect(features).toContain("feature-b");
      expect(features).toContain("feature-c");
    });

    it("should extract skill name from directory path", async () => {
      const registry = createRegistry();
      const result = await scanSpecs(SCAN_DIR, registry);

      expect(result.success).toBe(true);
      const emailSpecs = result.data!.filter((s) => s.skill === "email");
      const tanaSpecs = result.data!.filter((s) => s.skill === "tana");

      expect(emailSpecs).toHaveLength(2);
      expect(tanaSpecs).toHaveLength(1);
    });

    it("should parse frontmatter for status and created date", async () => {
      const registry = createRegistry();
      const result = await scanSpecs(SCAN_DIR, registry);

      expect(result.success).toBe(true);

      const featureB = result.data!.find((s) => s.feature === "feature-b");
      expect(featureB?.status).toBe("in-progress");
      expect(featureB?.created).toBe("2025-12-02");
    });

    it("should return empty array for directory with no specs", async () => {
      const emptyDir = join(SCAN_DIR, "empty-skill");
      await mkdir(emptyDir, { recursive: true });

      const registry = createRegistry();
      const result = await scanSpecs(emptyDir, registry);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it("should construct correct relative path", async () => {
      const registry = createRegistry();
      const result = await scanSpecs(SCAN_DIR, registry);

      expect(result.success).toBe(true);

      const featureA = result.data!.find((s) => s.feature === "feature-a");
      expect(featureA?.path).toBe("email/.specify/specs/feature-a");
    });
  });
});
