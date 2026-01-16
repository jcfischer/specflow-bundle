import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getFeature,
  getNextFeature,
  addFeature,
  updateFeatureStatus,
  updateFeatureQuickStart,
  skipFeature,
  resetFeature,
  getStats,
  clearAllFeatures,
} from "../src/lib/database";
import type { FeatureStatus } from "../src/types";

const TEST_DB_PATH = "/tmp/specflow-test.db";

describe("Database", () => {
  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("initDatabase", () => {
    it("should create database file and tables", () => {
      const db = initDatabase(TEST_DB_PATH);
      expect(db).toBeDefined();
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    it("should be idempotent (can call multiple times)", () => {
      const db1 = initDatabase(TEST_DB_PATH);
      const db2 = initDatabase(TEST_DB_PATH);
      expect(db1).toBeDefined();
      expect(db2).toBeDefined();
    });
  });

  describe("addFeature", () => {
    it("should add a feature to the database", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({
        id: "F-1",
        name: "Test feature",
        description: "A test feature",
        priority: 1,
      });

      const features = getFeatures();
      expect(features).toHaveLength(1);
      expect(features[0].id).toBe("F-1");
      expect(features[0].name).toBe("Test feature");
      expect(features[0].status).toBe("pending");
    });

    it("should add multiple features", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "Feature 1", description: "Desc 1", priority: 1 });
      addFeature({ id: "F-2", name: "Feature 2", description: "Desc 2", priority: 2 });
      addFeature({ id: "F-3", name: "Feature 3", description: "Desc 3", priority: 3 });

      const features = getFeatures();
      expect(features).toHaveLength(3);
    });
  });

  describe("getFeatures", () => {
    it("should return empty array when no features", () => {
      initDatabase(TEST_DB_PATH);
      const features = getFeatures();
      expect(features).toEqual([]);
    });

    it("should return features ordered by priority", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-3", name: "Low priority", description: "Desc", priority: 3 });
      addFeature({ id: "F-1", name: "High priority", description: "Desc", priority: 1 });
      addFeature({ id: "F-2", name: "Medium priority", description: "Desc", priority: 2 });

      const features = getFeatures();
      expect(features[0].id).toBe("F-1");
      expect(features[1].id).toBe("F-2");
      expect(features[2].id).toBe("F-3");
    });
  });

  describe("getFeature", () => {
    it("should return specific feature by ID", () => {
      initDatabase(TEST_DB_PATH);
      addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });

      const feature = getFeature("F-1");
      expect(feature).not.toBeNull();
      expect(feature?.id).toBe("F-1");
    });

    it("should return null for non-existent feature", () => {
      initDatabase(TEST_DB_PATH);
      const feature = getFeature("F-999");
      expect(feature).toBeNull();
    });
  });

  describe("getNextFeature", () => {
    it("should return highest priority pending feature", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
      addFeature({ id: "F-2", name: "Second", description: "Desc", priority: 2 });

      const next = getNextFeature();
      expect(next).not.toBeNull();
      expect(next?.id).toBe("F-1");
    });

    it("should skip completed features", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
      addFeature({ id: "F-2", name: "Second", description: "Desc", priority: 2 });
      updateFeatureStatus("F-1", "complete");

      const next = getNextFeature();
      expect(next?.id).toBe("F-2");
    });

    it("should skip in-progress features", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
      addFeature({ id: "F-2", name: "Second", description: "Desc", priority: 2 });
      updateFeatureStatus("F-1", "in_progress");

      const next = getNextFeature();
      expect(next?.id).toBe("F-2");
    });

    it("should return null when no pending features", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
      updateFeatureStatus("F-1", "complete");

      const next = getNextFeature();
      expect(next).toBeNull();
    });
  });

  describe("updateFeatureStatus", () => {
    it("should update feature status", () => {
      initDatabase(TEST_DB_PATH);
      addFeature({ id: "F-1", name: "Test", description: "Desc", priority: 1 });

      updateFeatureStatus("F-1", "in_progress");

      const feature = getFeature("F-1");
      expect(feature?.status).toBe("in_progress");
      expect(feature?.startedAt).not.toBeNull();
    });

    it("should set completedAt when status is complete", () => {
      initDatabase(TEST_DB_PATH);
      addFeature({ id: "F-1", name: "Test", description: "Desc", priority: 1 });

      updateFeatureStatus("F-1", "complete");

      const feature = getFeature("F-1");
      expect(feature?.status).toBe("complete");
      expect(feature?.completedAt).not.toBeNull();
    });
  });

  describe("skipFeature", () => {
    it("should move feature to end of queue", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
      addFeature({ id: "F-2", name: "Second", description: "Desc", priority: 2 });
      addFeature({ id: "F-3", name: "Third", description: "Desc", priority: 3 });

      skipFeature("F-1");

      const features = getFeatures();
      expect(features[0].id).toBe("F-2");
      expect(features[1].id).toBe("F-3");
      expect(features[2].id).toBe("F-1");
      expect(features[2].status).toBe("skipped");
    });
  });

  describe("resetFeature", () => {
    it("should reset feature to pending", () => {
      initDatabase(TEST_DB_PATH);
      addFeature({ id: "F-1", name: "Test", description: "Desc", priority: 1 });
      updateFeatureStatus("F-1", "complete");

      resetFeature("F-1");

      const feature = getFeature("F-1");
      expect(feature?.status).toBe("pending");
      expect(feature?.startedAt).toBeNull();
      expect(feature?.completedAt).toBeNull();
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "F1", description: "D", priority: 1 });
      addFeature({ id: "F-2", name: "F2", description: "D", priority: 2 });
      addFeature({ id: "F-3", name: "F3", description: "D", priority: 3 });
      addFeature({ id: "F-4", name: "F4", description: "D", priority: 4 });

      updateFeatureStatus("F-1", "complete");
      updateFeatureStatus("F-2", "in_progress");
      skipFeature("F-3");

      const stats = getStats();
      expect(stats.total).toBe(4);
      expect(stats.complete).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.percentComplete).toBe(25);
    });

    it("should return zeros for empty database", () => {
      initDatabase(TEST_DB_PATH);

      const stats = getStats();
      expect(stats.total).toBe(0);
      expect(stats.percentComplete).toBe(0);
    });
  });

  describe("updateFeatureQuickStart", () => {
    it("should set quick_start flag to true", () => {
      initDatabase(TEST_DB_PATH);
      addFeature({ id: "F-1", name: "Test", description: "Desc", priority: 1 });

      updateFeatureQuickStart("F-1", true);

      const feature = getFeature("F-1");
      // Note: quick_start is stored as INTEGER in SQLite (0/1)
      expect(feature?.quickStart).toBe(true);
    });

    it("should set quick_start flag to false", () => {
      initDatabase(TEST_DB_PATH);
      addFeature({ id: "F-1", name: "Test", description: "Desc", priority: 1 });

      updateFeatureQuickStart("F-1", true);
      updateFeatureQuickStart("F-1", false);

      const feature = getFeature("F-1");
      expect(feature?.quickStart).toBe(false);
    });
  });

  describe("clearAllFeatures", () => {
    it("should remove all features", () => {
      initDatabase(TEST_DB_PATH);

      addFeature({ id: "F-1", name: "F1", description: "D", priority: 1 });
      addFeature({ id: "F-2", name: "F2", description: "D", priority: 2 });

      clearAllFeatures();

      const features = getFeatures();
      expect(features).toHaveLength(0);
    });
  });
});
