/**
 * CLI Tests - TDD for spec registry CLI commands
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const TEST_DIR = join(import.meta.dir, "fixtures", "cli-temp");
const CLI_PATH = join(import.meta.dir, "..", "src", "index.ts");

describe("SpecKit CLI", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    // Create empty registry
    await writeFile(
      join(TEST_DIR, "spec-registry.json"),
      JSON.stringify({ version: "1.0.0", lastId: 0, specs: [] }, null, 2)
    );
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("registry list", () => {
    it("should list all specs", async () => {
      // Create registry with specs
      await writeFile(
        join(TEST_DIR, "spec-registry.json"),
        JSON.stringify(
          {
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
                status: "completed",
                created: "2025-12-02",
              },
            ],
          },
          null,
          2
        )
      );

      const result =
        await $`bun ${CLI_PATH} registry list --registry ${join(TEST_DIR, "spec-registry.json")}`.text();
      expect(result).toContain("001");
      expect(result).toContain("feat-1");
      expect(result).toContain("002");
      expect(result).toContain("feat-2");
    });

    it("should filter by skill", async () => {
      await writeFile(
        join(TEST_DIR, "spec-registry.json"),
        JSON.stringify(
          {
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
          },
          null,
          2
        )
      );

      const result =
        await $`bun ${CLI_PATH} registry list --registry ${join(TEST_DIR, "spec-registry.json")} --skill email`.text();
      expect(result).toContain("001");
      expect(result).toContain("email");
      expect(result).not.toContain("tana");
    });

    it("should output JSON format", async () => {
      await writeFile(
        join(TEST_DIR, "spec-registry.json"),
        JSON.stringify(
          {
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
          },
          null,
          2
        )
      );

      const result =
        await $`bun ${CLI_PATH} registry list --registry ${join(TEST_DIR, "spec-registry.json")} --json`.text();
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe("001");
    });
  });

  describe("registry assign", () => {
    it("should assign new spec ID", async () => {
      const result =
        await $`bun ${CLI_PATH} registry assign --registry ${join(TEST_DIR, "spec-registry.json")} --feature test-feature --skill test-skill --path test-skill/.specify/specs/test-feature`.text();

      expect(result).toContain("001");
      expect(result).toContain("test-feature");

      // Verify registry was updated
      const content = await readFile(
        join(TEST_DIR, "spec-registry.json"),
        "utf-8"
      );
      const registry = JSON.parse(content);
      expect(registry.lastId).toBe(1);
      expect(registry.specs).toHaveLength(1);
    });

    it("should reject duplicate feature in same skill", async () => {
      // First assignment
      await $`bun ${CLI_PATH} registry assign --registry ${join(TEST_DIR, "spec-registry.json")} --feature dupe --skill skill-a --path skill-a/.specify/specs/dupe`.text();

      // Second assignment (duplicate) - expect exit code 1
      const proc = Bun.spawn(
        ["bun", CLI_PATH, "registry", "assign", "--registry", join(TEST_DIR, "spec-registry.json"), "--feature", "dupe", "--skill", "skill-a", "--path", "skill-a/.specify/specs/dupe"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stdout + stderr).toContain("already exists");
    });
  });

  describe("registry next", () => {
    it("should show next available ID", async () => {
      await writeFile(
        join(TEST_DIR, "spec-registry.json"),
        JSON.stringify({ version: "1.0.0", lastId: 5, specs: [] }, null, 2)
      );

      const result =
        await $`bun ${CLI_PATH} registry next --registry ${join(TEST_DIR, "spec-registry.json")}`.text();
      expect(result.trim()).toBe("006");
    });
  });

  describe("registry show", () => {
    it("should show spec details by ID", async () => {
      await writeFile(
        join(TEST_DIR, "spec-registry.json"),
        JSON.stringify(
          {
            version: "1.0.0",
            lastId: 1,
            specs: [
              {
                id: "001",
                feature: "clean-inbox",
                skill: "email",
                path: "email/.specify/specs/clean-inbox",
                status: "draft",
                created: "2025-12-18",
                title: "Interactive Inbox Processing",
              },
            ],
          },
          null,
          2
        )
      );

      const result =
        await $`bun ${CLI_PATH} registry show 001 --registry ${join(TEST_DIR, "spec-registry.json")}`.text();
      expect(result).toContain("clean-inbox");
      expect(result).toContain("email");
      expect(result).toContain("2025-12-18");
    });

    it("should error for non-existent ID", async () => {
      const proc = Bun.spawn(
        ["bun", CLI_PATH, "registry", "show", "999", "--registry", join(TEST_DIR, "spec-registry.json")],
        { stdout: "pipe", stderr: "pipe" }
      );
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stdout + stderr).toContain("not found");
    });
  });
});
