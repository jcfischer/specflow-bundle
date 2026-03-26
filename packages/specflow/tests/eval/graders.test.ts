/**
 * Tests for grader interface and base functionality
 */

import { describe, expect, it } from "bun:test";
import type {
  Grader,
  GraderFactory,
  GraderRegistry,
} from "../../src/lib/eval/graders/index";
import type { GradeContext, GradeResult, TestCase } from "../../src/lib/eval/types";

describe("Grader Interface", () => {
  describe("Grader type contract", () => {
    it("should define grade method with correct signature", () => {
      // A grader must have a grade method that takes TestCase and GradeContext
      const mockGrader: Grader = {
        name: "mock-grader",
        type: "code",
        grade: async (testCase: TestCase, context: GradeContext): Promise<GradeResult> => {
          return {
            passed: true,
            score: null,
            output: "Mock grader executed",
          };
        },
      };

      expect(mockGrader.name).toBe("mock-grader");
      expect(mockGrader.type).toBe("code");
      expect(typeof mockGrader.grade).toBe("function");
    });

    it("should support code grader type", () => {
      const codeGrader: Grader = {
        name: "file-exists",
        type: "code",
        grade: async () => ({
          passed: true,
          score: null,
          output: "File exists",
        }),
      };

      expect(codeGrader.type).toBe("code");
    });

    it("should support model grader type", () => {
      const modelGrader: Grader = {
        name: "spec-quality",
        type: "model",
        grade: async () => ({
          passed: true,
          score: 0.85,
          output: "Quality assessment complete",
        }),
      };

      expect(modelGrader.type).toBe("model");
    });
  });

  describe("GradeResult contract", () => {
    it("should return passed boolean", async () => {
      const grader: Grader = {
        name: "test",
        type: "code",
        grade: async () => ({
          passed: true,
          score: null,
          output: "Test passed",
        }),
      };

      const testCase: TestCase = {
        id: "TC-001",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "code",
        graderConfig: {},
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: "/test/project",
      };

      const result = await grader.grade(testCase, context);

      expect(typeof result.passed).toBe("boolean");
    });

    it("should return score for model graders", async () => {
      const grader: Grader = {
        name: "quality",
        type: "model",
        grade: async () => ({
          passed: true,
          score: 0.75,
          output: "Score: 0.75",
        }),
      };

      const testCase: TestCase = {
        id: "TC-001",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "model",
        graderConfig: {},
        createdAt: new Date(),
      };

      const result = await grader.grade(testCase, { projectPath: "/test" });

      expect(result.score).toBe(0.75);
    });

    it("should return null score for code graders", async () => {
      const grader: Grader = {
        name: "exists",
        type: "code",
        grade: async () => ({
          passed: true,
          score: null,
          output: "Exists",
        }),
      };

      const testCase: TestCase = {
        id: "TC-001",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "code",
        graderConfig: {},
        createdAt: new Date(),
      };

      const result = await grader.grade(testCase, { projectPath: "/test" });

      expect(result.score).toBeNull();
    });

    it("should include error on failure", async () => {
      const grader: Grader = {
        name: "failing",
        type: "code",
        grade: async () => ({
          passed: false,
          score: null,
          output: "Check failed",
          error: "Expected file not found",
        }),
      };

      const testCase: TestCase = {
        id: "TC-001",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "code",
        graderConfig: {},
        createdAt: new Date(),
      };

      const result = await grader.grade(testCase, { projectPath: "/test" });

      expect(result.passed).toBe(false);
      expect(result.error).toBe("Expected file not found");
    });
  });

  describe("GraderFactory contract", () => {
    it("should create grader from config", () => {
      const factory: GraderFactory = {
        name: "file-exists",
        create: (config: Record<string, unknown>): Grader => {
          return {
            name: "file-exists",
            type: "code",
            grade: async () => ({
              passed: true,
              score: null,
              output: `Checking ${config.path}`,
            }),
          };
        },
      };

      const grader = factory.create({ path: "spec.md" });

      expect(grader.name).toBe("file-exists");
      expect(grader.type).toBe("code");
    });
  });

  describe("GraderRegistry", () => {
    it("should register and retrieve graders", () => {
      const registry: GraderRegistry = {
        graders: new Map(),
        register(factory: GraderFactory): void {
          this.graders.set(factory.name, factory);
        },
        get(name: string): GraderFactory | undefined {
          return this.graders.get(name);
        },
        has(name: string): boolean {
          return this.graders.has(name);
        },
        list(): string[] {
          return Array.from(this.graders.keys());
        },
      };

      const factory: GraderFactory = {
        name: "test-grader",
        create: () => ({
          name: "test-grader",
          type: "code",
          grade: async () => ({ passed: true, score: null, output: "ok" }),
        }),
      };

      registry.register(factory);

      expect(registry.has("test-grader")).toBe(true);
      expect(registry.get("test-grader")).toBe(factory);
      expect(registry.list()).toContain("test-grader");
    });

    it("should return undefined for unknown grader", () => {
      const registry: GraderRegistry = {
        graders: new Map(),
        register(factory: GraderFactory): void {
          this.graders.set(factory.name, factory);
        },
        get(name: string): GraderFactory | undefined {
          return this.graders.get(name);
        },
        has(name: string): boolean {
          return this.graders.has(name);
        },
        list(): string[] {
          return Array.from(this.graders.keys());
        },
      };

      expect(registry.has("unknown")).toBe(false);
      expect(registry.get("unknown")).toBeUndefined();
    });
  });

  describe("Grader execution flow", () => {
    it("should pass testCase.graderConfig to grader", async () => {
      let capturedConfig: Record<string, unknown> = {};

      const factory: GraderFactory = {
        name: "config-capture",
        create: (config: Record<string, unknown>): Grader => {
          capturedConfig = config;
          return {
            name: "config-capture",
            type: "code",
            grade: async () => ({
              passed: true,
              score: null,
              output: "Config captured",
            }),
          };
        },
      };

      const testCase: TestCase = {
        id: "TC-001",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "code",
        graderConfig: { path: "spec.md", required: true },
        createdAt: new Date(),
      };

      factory.create(testCase.graderConfig);

      expect(capturedConfig).toEqual({ path: "spec.md", required: true });
    });

    it("should pass context.projectPath to grader", async () => {
      let capturedContext: GradeContext | null = null;

      const grader: Grader = {
        name: "context-capture",
        type: "code",
        grade: async (testCase, context) => {
          capturedContext = context;
          return {
            passed: true,
            score: null,
            output: "Context captured",
          };
        },
      };

      const testCase: TestCase = {
        id: "TC-001",
        name: "Test",
        suite: "test",
        type: "positive",
        graderType: "code",
        graderConfig: {},
        createdAt: new Date(),
      };

      const context: GradeContext = {
        projectPath: "/my/project",
        featureId: "F-001",
      };

      await grader.grade(testCase, context);

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.projectPath).toBe("/my/project");
      expect(capturedContext!.featureId).toBe("F-001");
    });
  });
});
