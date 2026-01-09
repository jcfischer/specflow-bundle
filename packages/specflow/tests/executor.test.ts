import { describe, it, expect } from "bun:test";
import {
  parseCompletionMarkers,
  detectCompletion,
  detectBlocked,
} from "../src/lib/executor";
import type { RunResult } from "../src/types";

describe("Executor", () => {
  describe("parseCompletionMarkers", () => {
    it("should detect [FEATURE COMPLETE] marker", () => {
      const output = `
Some implementation output...

[FEATURE COMPLETE]
Feature: F-1 - Core model
Tests: 5 passing
Files: src/model.ts, tests/model.test.ts
`;

      const result = parseCompletionMarkers(output);

      expect(result.complete).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.featureId).toBe("F-1");
    });

    it("should detect [FEATURE BLOCKED] marker", () => {
      const output = `
Working on implementation...

[FEATURE BLOCKED]
Feature: F-2 - API integration
Reason: External API credentials not configured
`;

      const result = parseCompletionMarkers(output);

      expect(result.complete).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.featureId).toBe("F-2");
      expect(result.blockReason).toContain("credentials");
    });

    it("should return incomplete when no markers found", () => {
      const output = "Just some random output without completion markers.";

      const result = parseCompletionMarkers(output);

      expect(result.complete).toBe(false);
      expect(result.blocked).toBe(false);
    });
  });

  describe("detectCompletion", () => {
    it("should return true for complete marker", () => {
      const output = "[FEATURE COMPLETE]\nFeature: F-1 - Test";
      expect(detectCompletion(output)).toBe(true);
    });

    it("should return false without marker", () => {
      const output = "No completion marker here";
      expect(detectCompletion(output)).toBe(false);
    });

    it("should be case-insensitive", () => {
      const output = "[feature complete]\nFeature: F-1 - Test";
      expect(detectCompletion(output)).toBe(true);
    });
  });

  describe("detectBlocked", () => {
    it("should return true for blocked marker", () => {
      const output = "[FEATURE BLOCKED]\nFeature: F-1 - Test\nReason: Something";
      expect(detectBlocked(output)).toBe(true);
    });

    it("should return false without marker", () => {
      const output = "No blocked marker here";
      expect(detectBlocked(output)).toBe(false);
    });
  });
});
