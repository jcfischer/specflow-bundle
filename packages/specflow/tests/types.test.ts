import { describe, it, expect } from "bun:test";
import type {
  Feature,
  FeatureStatus,
  AppContext,
  RunSession,
  FeatureStats,
  DecomposedFeature,
} from "../src/types";

describe("Types", () => {
  describe("Feature", () => {
    it("should have all required fields", () => {
      const feature: Feature = {
        id: "F-1",
        name: "Test feature",
        description: "A test feature description",
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

      expect(feature.id).toBe("F-1");
      expect(feature.name).toBe("Test feature");
      expect(feature.status).toBe("pending");
      expect(feature.priority).toBe(1);
    });

    it("should support all status values", () => {
      const statuses: FeatureStatus[] = [
        "pending",
        "in_progress",
        "complete",
        "skipped",
      ];
      statuses.forEach((status) => {
        const feature: Feature = {
          id: "F-1",
          name: "Test",
          description: "Test",
          priority: 1,
          status,
          specPath: null,
          phase: "none" as const,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
          migratedFrom: null,
          quickStart: false,
        };
        expect(feature.status).toBe(status);
      });
    });
  });

  describe("AppContext", () => {
    it("should have all required fields", () => {
      const context: AppContext = {
        projectPath: "/path/to/project",
        appSpecPath: "/path/to/spec.md",
        memoryPath: "/path/to/.specify/memory",
        stack: ["TypeScript", "Bun"],
        patterns: ["CLI-first"],
      };

      expect(context.projectPath).toBe("/path/to/project");
      expect(context.stack).toContain("TypeScript");
    });
  });

  describe("RunSession", () => {
    it("should track session state", () => {
      const session: RunSession = {
        startedAt: new Date(),
        currentFeatureId: "F-1",
        featuresCompleted: 3,
        lastError: null,
      };

      expect(session.featuresCompleted).toBe(3);
      expect(session.currentFeatureId).toBe("F-1");
    });
  });

  describe("FeatureStats", () => {
    it("should calculate percentages correctly", () => {
      const stats: FeatureStats = {
        total: 10,
        pending: 5,
        inProgress: 1,
        complete: 3,
        skipped: 1,
        percentComplete: 30,
      };

      expect(stats.total).toBe(10);
      expect(stats.percentComplete).toBe(30);
      expect(stats.pending + stats.inProgress + stats.complete + stats.skipped).toBe(stats.total);
    });
  });

  describe("DecomposedFeature", () => {
    it("should represent decomposition output", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Core data model",
        description: "SQLite schema for tasks",
        dependencies: [],
        priority: 1,
      };

      expect(feature.dependencies).toEqual([]);
      expect(feature.priority).toBe(1);
    });

    it("should support dependencies", () => {
      const feature: DecomposedFeature = {
        id: "F-2",
        name: "Add task command",
        description: "CLI to add tasks",
        dependencies: ["F-1"],
        priority: 2,
      };

      expect(feature.dependencies).toContain("F-1");
    });
  });
});
