import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import {
  buildAppContext,
  buildFeatureContext,
  formatContextForAgent,
} from "../src/lib/context";
import type { Feature, AppContext } from "../src/types";

const TEST_PROJECT_DIR = "/tmp/specflow-context-test";

describe("Context Builder", () => {
  beforeEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  describe("buildAppContext", () => {
    it("should build context from project directory", () => {
      // Create memory directory with constitution
      const memoryDir = join(TEST_PROJECT_DIR, ".specify/memory");
      mkdirSync(memoryDir, { recursive: true });
      writeFileSync(
        join(memoryDir, "constitution.md"),
        "# Project Constitution\n\nUse TypeScript and Bun."
      );

      const context = buildAppContext(TEST_PROJECT_DIR);

      expect(context.projectPath).toBe(TEST_PROJECT_DIR);
      expect(context.memoryPath).toBe(memoryDir);
    });

    it("should extract stack from constitution", () => {
      const memoryDir = join(TEST_PROJECT_DIR, ".specify/memory");
      mkdirSync(memoryDir, { recursive: true });
      writeFileSync(
        join(memoryDir, "constitution.md"),
        "# Stack\n- TypeScript\n- Bun\n- SQLite"
      );

      const context = buildAppContext(TEST_PROJECT_DIR);

      expect(context.stack).toContain("TypeScript");
      expect(context.stack).toContain("Bun");
    });

    it("should handle missing memory directory", () => {
      const context = buildAppContext(TEST_PROJECT_DIR);

      expect(context.projectPath).toBe(TEST_PROJECT_DIR);
      expect(context.stack).toEqual([]);
    });
  });

  describe("buildFeatureContext", () => {
    it("should build context for a feature", () => {
      const appContext: AppContext = {
        projectPath: TEST_PROJECT_DIR,
        appSpecPath: "",
        memoryPath: join(TEST_PROJECT_DIR, ".specify/memory"),
        stack: ["TypeScript"],
        patterns: [],
      };

      const feature: Feature = {
        id: "F-1",
        name: "Test feature",
        description: "A test feature",
        priority: 1,
        status: "pending",
        specPath: null,
        phase: "none" as const,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        migratedFrom: null,
        quickStart: false,
      };

      const context = buildFeatureContext(appContext, feature);

      expect(context.app).toBe(appContext);
      expect(context.feature).toBe(feature);
    });

    it("should load spec content if specPath exists", () => {
      // Create feature spec
      const specDir = join(TEST_PROJECT_DIR, ".specify/specs/001-test-feature");
      mkdirSync(specDir, { recursive: true });
      writeFileSync(join(specDir, "spec.md"), "# Feature Spec\n\nTest content.");
      writeFileSync(join(specDir, "plan.md"), "# Plan\n\nImplementation plan.");
      writeFileSync(join(specDir, "tasks.md"), "# Tasks\n\n- [ ] Task 1");

      const appContext: AppContext = {
        projectPath: TEST_PROJECT_DIR,
        appSpecPath: "",
        memoryPath: join(TEST_PROJECT_DIR, ".specify/memory"),
        stack: [],
        patterns: [],
      };

      const feature: Feature = {
        id: "F-1",
        name: "Test feature",
        description: "A test feature",
        priority: 1,
        status: "pending",
        specPath: specDir,
        phase: "tasks" as const,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        migratedFrom: null,
        quickStart: false,
      };

      const context = buildFeatureContext(appContext, feature);

      expect(context.specContent).toContain("Feature Spec");
      expect(context.planContent).toContain("Implementation plan");
      expect(context.tasksContent).toContain("Task 1");
    });
  });

  describe("formatContextForAgent", () => {
    it("should format context as markdown", () => {
      const appContext: AppContext = {
        projectPath: TEST_PROJECT_DIR,
        appSpecPath: "",
        memoryPath: "",
        stack: ["TypeScript", "Bun"],
        patterns: ["CLI-first"],
      };

      const feature: Feature = {
        id: "F-1",
        name: "Core data model",
        description: "SQLite schema for tasks",
        priority: 1,
        status: "pending",
        specPath: null,
        phase: "none" as const,
        createdAt: new Date(),
        migratedFrom: null,
        quickStart: false,
        startedAt: null,
        completedAt: null,
      };

      const featureContext = {
        app: appContext,
        feature,
        specContent: "# Spec\n\nDetails here.",
        planContent: null,
        tasksContent: null,
      };

      const formatted = formatContextForAgent(featureContext);

      expect(formatted).toContain("F-1");
      expect(formatted).toContain("Core data model");
      expect(formatted).toContain("TypeScript");
      expect(formatted).toContain("Details here");
    });

    it("should include TDD instructions", () => {
      const featureContext = {
        app: {
          projectPath: TEST_PROJECT_DIR,
          appSpecPath: "",
          memoryPath: "",
          stack: [],
          patterns: [],
        },
        feature: {
          id: "F-1",
          name: "Test",
          description: "Test",
          priority: 1,
          status: "pending" as const,
          specPath: null,
          phase: "none" as const,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
          migratedFrom: null,
          quickStart: false,
        },
        specContent: null,
        planContent: null,
        tasksContent: null,
      };

      const formatted = formatContextForAgent(featureContext);

      expect(formatted).toContain("TDD");
      expect(formatted).toContain("test");
    });
  });
});
