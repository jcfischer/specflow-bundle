/**
 * Migration Types Tests
 */

import { describe, expect, it } from "bun:test";
import {
  MigrationError,
  MigrationFileError,
  MigrationChecksumError,
  type Migration,
  type AppliedMigration,
  type MigrationResult,
  type MigrationStatus,
} from "../../src/lib/migrations/types";

describe("Migration Types", () => {
  describe("Migration interface", () => {
    it("should define a migration with required fields", () => {
      const migration: Migration = {
        version: 1,
        name: "add_quick_start",
        upSql: "ALTER TABLE features ADD COLUMN quick_start INTEGER DEFAULT 0;",
        downSql: "ALTER TABLE features DROP COLUMN quick_start;",
      };

      expect(migration.version).toBe(1);
      expect(migration.name).toBe("add_quick_start");
      expect(migration.upSql).toContain("ALTER TABLE");
      expect(migration.downSql).toContain("DROP COLUMN");
    });
  });

  describe("AppliedMigration interface", () => {
    it("should define an applied migration with timestamp", () => {
      const applied: AppliedMigration = {
        version: 1,
        name: "add_quick_start",
        appliedAt: new Date("2026-01-16T10:00:00Z"),
        checksum: "abc123",
      };

      expect(applied.version).toBe(1);
      expect(applied.appliedAt).toBeInstanceOf(Date);
      expect(applied.checksum).toBe("abc123");
    });
  });

  describe("MigrationResult interface", () => {
    it("should define a result with applied count", () => {
      const result: MigrationResult = {
        applied: 2,
        migrations: [],
        success: true,
      };

      expect(result.applied).toBe(2);
      expect(result.success).toBe(true);
    });
  });

  describe("MigrationStatus interface", () => {
    it("should define status with pending info", () => {
      const status: MigrationStatus = {
        currentVersion: 2,
        pendingCount: 1,
        pendingMigrations: ["003_add_revision_history"],
        appliedMigrations: [],
      };

      expect(status.currentVersion).toBe(2);
      expect(status.pendingCount).toBe(1);
      expect(status.pendingMigrations).toHaveLength(1);
    });
  });

  describe("MigrationError", () => {
    it("should create error with version and cause", () => {
      const cause = new Error("SQL syntax error");
      const error = new MigrationError(1, "add_quick_start", cause);

      expect(error.name).toBe("MigrationError");
      expect(error.version).toBe(1);
      expect(error.migrationName).toBe("add_quick_start");
      expect(error.cause).toBe(cause);
      expect(error.message).toContain("Migration 1");
      expect(error.message).toContain("add_quick_start");
      expect(error.message).toContain("SQL syntax error");
    });

    it("should be an instance of Error", () => {
      const error = new MigrationError(1, "test", new Error("test"));
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("MigrationFileError", () => {
    it("should create error with file path", () => {
      const error = new MigrationFileError(
        "migrations/001_bad.sql",
        "Invalid format"
      );

      expect(error.name).toBe("MigrationFileError");
      expect(error.filePath).toBe("migrations/001_bad.sql");
      expect(error.message).toContain("001_bad.sql");
      expect(error.message).toContain("Invalid format");
    });
  });

  describe("MigrationChecksumError", () => {
    it("should create error with expected and actual checksums", () => {
      const error = new MigrationChecksumError(1, "abc123", "xyz789");

      expect(error.name).toBe("MigrationChecksumError");
      expect(error.version).toBe(1);
      expect(error.expected).toBe("abc123");
      expect(error.actual).toBe("xyz789");
      expect(error.message).toContain("checksum mismatch");
      expect(error.message).toContain("abc123");
      expect(error.message).toContain("xyz789");
    });
  });
});
