import { describe, it, expect } from "bun:test";
import {
  validateBatchReady,
  formatBatchErrors,
  buildBatchPrompt,
  generateClarificationFile,
} from "../../src/lib/batch";
import type { DecomposedFeature, Feature } from "../../src/types";

describe("Batch Module", () => {
  describe("validateBatchReady", () => {
    it("should pass when all required fields are present", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
        problemType: "manual_workaround",
        urgency: "blocking_work",
        primaryUser: "developers",
        integrationScope: "standalone",
      };

      const result = validateBatchReady(feature);

      expect(result.ready).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it("should fail when problemType is missing", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
        urgency: "blocking_work",
        primaryUser: "developers",
        integrationScope: "standalone",
      };

      const result = validateBatchReady(feature);

      expect(result.ready).toBe(false);
      expect(result.missingFields).toContain("problemType");
    });

    it("should fail when multiple fields are missing", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
      };

      const result = validateBatchReady(feature);

      expect(result.ready).toBe(false);
      expect(result.missingFields).toContain("problemType");
      expect(result.missingFields).toContain("urgency");
      expect(result.missingFields).toContain("primaryUser");
      expect(result.missingFields).toContain("integrationScope");
      expect(result.missingFields).toHaveLength(4);
    });

    it("should include uncertain fields when uncertainties array is present", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
        problemType: "manual_workaround",
        urgency: "blocking_work",
        primaryUser: "developers",
        integrationScope: "standalone",
        uncertainties: ["performanceRequirements", "dataRequirements"],
      };

      const result = validateBatchReady(feature);

      expect(result.ready).toBe(true);
      expect(result.uncertainFields).toContain("performanceRequirements");
      expect(result.uncertainFields).toContain("dataRequirements");
    });
  });

  describe("formatBatchErrors", () => {
    it("should format missing fields error correctly", () => {
      const result = {
        ready: false,
        missingFields: ["problemType", "urgency"],
        uncertainFields: [],
      };

      const error = formatBatchErrors("F-1", result);

      expect(error).toContain("F-1");
      expect(error).toContain("problemType");
      expect(error).toContain("urgency");
      expect(error).toContain("enrich");
    });

    it("should return empty string when ready", () => {
      const result = {
        ready: true,
        missingFields: [],
        uncertainFields: [],
      };

      const error = formatBatchErrors("F-1", result);

      expect(error).toBe("");
    });
  });

  describe("buildBatchPrompt", () => {
    it("should include feature context in prompt", () => {
      const feature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature for testing",
        dependencies: [],
        priority: 1,
        problemType: "manual_workaround",
        urgency: "blocking_work",
        primaryUser: "developers",
        integrationScope: "standalone",
        status: "pending",
        phase: "none",
        specPath: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        migratedFrom: null,
        quickStart: false,
      } as Feature & DecomposedFeature;

      const prompt = buildBatchPrompt(feature, "/tmp/specs/f-1-test", null);

      expect(prompt).toContain("F-1");
      expect(prompt).toContain("Test Feature");
      // Check for human-readable descriptions, not raw enum values
      expect(prompt).toContain("handle this manually");  // From problemType
      expect(prompt).toContain("Technical users");  // From primaryUser
    });

    it("should include app context when provided", () => {
      const feature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
        problemType: "impossible",
        urgency: "user_demand",
        primaryUser: "end_users",
        integrationScope: "extends_existing",
        status: "pending",
        phase: "none",
        specPath: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        migratedFrom: null,
        quickStart: false,
      } as Feature & DecomposedFeature;

      const appContext = "# App Context\n\nThis is a TypeScript CLI tool.";
      const prompt = buildBatchPrompt(feature, "/tmp/specs/f-1", appContext);

      expect(prompt).toContain("App Context");
      expect(prompt).toContain("TypeScript CLI tool");
    });
  });

  describe("generateClarificationFile", () => {
    it("should generate clarification items for uncertain fields", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
        problemType: "manual_workaround",
        urgency: "blocking_work",
        primaryUser: "developers",
        integrationScope: "standalone",
        uncertainties: ["performanceRequirements"],
        clarificationNeeded: "Unclear if realtime is needed",
      };

      const clarification = generateClarificationFile(feature);

      expect(clarification.featureId).toBe("F-1");
      expect(clarification.featureName).toBe("Test Feature");
      expect(clarification.items).toHaveLength(1);
      expect(clarification.items[0].field).toBe("performanceRequirements");
    });

    it("should handle feature with no uncertainties but missing required fields", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
      };

      const clarification = generateClarificationFile(feature);

      expect(clarification.featureId).toBe("F-1");
      // Should have items for missing required fields
      expect(clarification.items.length).toBeGreaterThan(0);
      expect(clarification.items.some(i => i.field === "problemType")).toBe(true);
    });

    it("should include standard questions for known fields", () => {
      const feature: DecomposedFeature = {
        id: "F-1",
        name: "Test Feature",
        description: "A test feature",
        dependencies: [],
        priority: 1,
        // Missing all required fields
      };

      const clarification = generateClarificationFile(feature);

      const problemTypeItem = clarification.items.find(i => i.field === "problemType");
      expect(problemTypeItem).toBeDefined();
      expect(problemTypeItem?.options).toContain("manual_workaround");
      expect(problemTypeItem?.question).toContain("problem");
    });
  });
});
