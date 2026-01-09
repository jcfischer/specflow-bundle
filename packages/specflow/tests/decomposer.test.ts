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
  });

  describe("validateDecomposedFeatures", () => {
    it("should pass for valid features", () => {
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Test", description: "Desc", dependencies: [], priority: 1 },
        { id: "F-2", name: "Test2", description: "Desc2", dependencies: ["F-1"], priority: 2 },
      ];

      const errors = validateDecomposedFeatures(features);

      expect(errors).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      const features = [
        { id: "F-1", name: "", description: "Desc", dependencies: [], priority: 1 },
      ] as DecomposedFeature[];

      const errors = validateDecomposedFeatures(features);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("name");
    });

    it("should detect duplicate IDs", () => {
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Test1", description: "Desc", dependencies: [], priority: 1 },
        { id: "F-1", name: "Test2", description: "Desc", dependencies: [], priority: 2 },
      ];

      const errors = validateDecomposedFeatures(features);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("Duplicate");
    });

    it("should detect invalid dependency references", () => {
      const features: DecomposedFeature[] = [
        { id: "F-1", name: "Test", description: "Desc", dependencies: ["F-99"], priority: 1 },
      ];

      const errors = validateDecomposedFeatures(features);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("F-99");
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
