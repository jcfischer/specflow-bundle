import { describe, it, expect } from "bun:test";
import {
  parseDecompositionOutput,
  validateDecomposedFeatures,
  assignPriorities,
} from "../src/lib/decomposer";
import type { DecomposedFeature } from "../src/types";

describe("Decomposer", () => {
  describe("parseDecompositionOutput", () => {
    it("should parse valid JSON array of features", () => {
      const output = `
Here are the features:

\`\`\`json
[
  {"id": "F-1", "name": "Core model", "description": "Data models", "dependencies": [], "priority": 1},
  {"id": "F-2", "name": "CLI", "description": "Commands", "dependencies": ["F-1"], "priority": 2}
]
\`\`\`
`;

      const features = parseDecompositionOutput(output);

      expect(features).toHaveLength(2);
      expect(features[0].id).toBe("F-1");
      expect(features[0].name).toBe("Core model");
      expect(features[1].dependencies).toContain("F-1");
    });

    it("should parse JSON without code fence", () => {
      const output = `[{"id": "F-1", "name": "Test", "description": "Desc", "dependencies": [], "priority": 1}]`;

      const features = parseDecompositionOutput(output);

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe("F-1");
    });

    it("should throw on invalid JSON", () => {
      const output = "This is not JSON";

      expect(() => parseDecompositionOutput(output)).toThrow();
    });

    it("should throw on non-array JSON", () => {
      const output = '{"id": "F-1", "name": "Test"}';

      expect(() => parseDecompositionOutput(output)).toThrow("Could not find JSON array");
    });

    it("should parse rich decomposition fields", () => {
      const output = `
\`\`\`json
[
  {
    "id": "F-1",
    "name": "Batch Feature",
    "description": "Feature with rich decomposition",
    "dependencies": [],
    "priority": 1,
    "problemType": "manual_workaround",
    "urgency": "blocking_work",
    "primaryUser": "developers",
    "integrationScope": "standalone"
  }
]
\`\`\`
`;

      const features = parseDecompositionOutput(output);

      expect(features).toHaveLength(1);
      expect(features[0].problemType).toBe("manual_workaround");
      expect(features[0].urgency).toBe("blocking_work");
      expect(features[0].primaryUser).toBe("developers");
      expect(features[0].integrationScope).toBe("standalone");
    });

    it("should parse optional rich fields when present", () => {
      const output = `
\`\`\`json
[
  {
    "id": "F-1",
    "name": "Feature",
    "description": "Desc",
    "dependencies": [],
    "priority": 1,
    "problemType": "impossible",
    "urgency": "user_demand",
    "primaryUser": "end_users",
    "integrationScope": "external_apis",
    "usageContext": "daily",
    "dataRequirements": "new_model",
    "performanceRequirements": "realtime",
    "priorityTradeoff": "ux"
  }
]
\`\`\`
`;

      const features = parseDecompositionOutput(output);

      expect(features[0].usageContext).toBe("daily");
      expect(features[0].dataRequirements).toBe("new_model");
      expect(features[0].performanceRequirements).toBe("realtime");
      expect(features[0].priorityTradeoff).toBe("ux");
    });

    it("should parse uncertainties and clarificationNeeded", () => {
      const output = `
\`\`\`json
[
  {
    "id": "F-1",
    "name": "Feature",
    "description": "Desc",
    "dependencies": [],
    "priority": 1,
    "problemType": "scattered",
    "urgency": "growing_pain",
    "primaryUser": "admins",
    "integrationScope": "multiple_integrations",
    "uncertainties": ["performanceRequirements", "dataRequirements"],
    "clarificationNeeded": "Need to clarify data sources"
  }
]
\`\`\`
`;

      const features = parseDecompositionOutput(output);

      expect(features[0].uncertainties).toContain("performanceRequirements");
      expect(features[0].uncertainties).toContain("dataRequirements");
      expect(features[0].clarificationNeeded).toBe("Need to clarify data sources");
    });

    it("should ignore invalid enum values for rich fields", () => {
      const output = `
\`\`\`json
[
  {
    "id": "F-1",
    "name": "Feature",
    "description": "Desc",
    "dependencies": [],
    "priority": 1,
    "problemType": "invalid_type",
    "urgency": "not_a_real_value"
  }
]
\`\`\`
`;

      const features = parseDecompositionOutput(output);

      expect(features[0].problemType).toBeUndefined();
      expect(features[0].urgency).toBeUndefined();
    });
  });

  describe("validateDecomposedFeatures", () => {
    it("should pass for valid features", () => {
      // Must have at least 3 features (hard floor)
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Test", description: "Desc", dependencies: [], priority: 1 },
        { id: "F-2", name: "Test2", description: "Desc2", dependencies: ["F-1"], priority: 2 },
        { id: "F-3", name: "Test3", description: "Desc3", dependencies: [], priority: 3 },
      ];

      // Set minFeatures to 3 to match hard floor
      const errors = validateDecomposedFeatures(features, { minFeatures: 3 });

      expect(errors).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      // Must have at least 3 features - include the invalid one plus 2 valid ones
      const features = [
        { id: "F-1", name: "", description: "Desc", dependencies: [], priority: 1 },
        { id: "F-2", name: "Valid1", description: "Desc2", dependencies: [], priority: 2 },
        { id: "F-3", name: "Valid2", description: "Desc3", dependencies: [], priority: 3 },
      ] as DecomposedFeature[];

      const errors = validateDecomposedFeatures(features, { minFeatures: 3 });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes("name"))).toBe(true);
    });

    it("should detect duplicate IDs", () => {
      // Must have at least 3 features - include duplicates plus one more
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Test1", description: "Desc", dependencies: [], priority: 1 },
        { id: "F-1", name: "Test2", description: "Desc", dependencies: [], priority: 2 },
        { id: "F-3", name: "Test3", description: "Desc", dependencies: [], priority: 3 },
      ];

      const errors = validateDecomposedFeatures(features, { minFeatures: 3 });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes("Duplicate"))).toBe(true);
    });

    it("should detect invalid dependency references", () => {
      // Must have at least 3 features - include invalid dependency plus 2 more valid
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Test", description: "Desc", dependencies: ["F-99"], priority: 1 },
        { id: "F-2", name: "Test2", description: "Desc2", dependencies: [], priority: 2 },
        { id: "F-3", name: "Test3", description: "Desc3", dependencies: [], priority: 3 },
      ];

      const errors = validateDecomposedFeatures(features, { minFeatures: 3 });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes("F-99"))).toBe(true);
    });
  });

  describe("assignPriorities", () => {
    it("should assign priority 1 to features with no dependencies", () => {
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "A", description: "D", dependencies: [], priority: 0 },
        { id: "F-2", name: "B", description: "D", dependencies: [], priority: 0 },
      ];

      const prioritized = assignPriorities(features);

      expect(prioritized[0].priority).toBe(1);
      expect(prioritized[1].priority).toBe(1);
    });

    it("should assign higher priority to dependent features", () => {
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Base", description: "D", dependencies: [], priority: 0 },
        { id: "F-2", name: "Depends on F-1", description: "D", dependencies: ["F-1"], priority: 0 },
        { id: "F-3", name: "Depends on F-2", description: "D", dependencies: ["F-2"], priority: 0 },
      ];

      const prioritized = assignPriorities(features);

      expect(prioritized.find(f => f.id === "F-1")?.priority).toBe(1);
      expect(prioritized.find(f => f.id === "F-2")?.priority).toBe(2);
      expect(prioritized.find(f => f.id === "F-3")?.priority).toBe(3);
    });

    it("should handle multiple dependencies", () => {
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "A", description: "D", dependencies: [], priority: 0 },
        { id: "F-2", name: "B", description: "D", dependencies: [], priority: 0 },
        { id: "F-3", name: "C", description: "D", dependencies: ["F-1", "F-2"], priority: 0 },
      ];

      const prioritized = assignPriorities(features);

      expect(prioritized.find(f => f.id === "F-3")?.priority).toBe(2);
    });
  });
});
