/**
 * Migration Runner Tests
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  ensureMigrationsTable,
  getCurrentVersion,
  getAppliedMigrations,
  loadMigrations,
  parseMigrationFilename,
  calculateChecksum,
  runPendingMigrations,
  rollbackLastMigration,
  getMigrationStatus,
  verifyMigrations,
} from "../../src/lib/migrations/runner";
import {
  MigrationError,
  MigrationFileError,
  MigrationChecksumError,
} from "../../src/lib/migrations/types";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = join(import.meta.dir, ".test-migrations");
const MIGRATIONS_DIR = join(TEST_DIR, "migrations");

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(MIGRATIONS_DIR, { recursive: true });
}

function teardownTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

function createTestDb(): Database {
  return new Database(":memory:");
}

function writeMigration(version: number, name: string, content: string) {
  const filename = `${version.toString().padStart(3, "0")}_${name}.sql`;
  writeFileSync(join(MIGRATIONS_DIR, filename), content);
}

// =============================================================================
// Tests
// =============================================================================

describe("Migration Runner", () => {
  let db: Database;

  beforeEach(() => {
    setupTestDir();
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
    teardownTestDir();
  });

  describe("ensureMigrationsTable", () => {
    it("should create _migrations table if not exists", () => {
      ensureMigrationsTable(db);

      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
        )
        .all();

      expect(tables).toHaveLength(1);
    });

    it("should be idempotent", () => {
      ensureMigrationsTable(db);
      ensureMigrationsTable(db);

      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
        )
        .all();

      expect(tables).toHaveLength(1);
    });
  });

  describe("getCurrentVersion", () => {
    it("should return 0 when no migrations applied", () => {
      const version = getCurrentVersion(db);
      expect(version).toBe(0);
    });

    it("should return highest applied version", () => {
      ensureMigrationsTable(db);
      db.run(
        "INSERT INTO _migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)",
        [1, "test1", new Date().toISOString(), "abc"]
      );
      db.run(
        "INSERT INTO _migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)",
        [2, "test2", new Date().toISOString(), "def"]
      );

      const version = getCurrentVersion(db);
      expect(version).toBe(2);
    });
  });

  describe("getAppliedMigrations", () => {
    it("should return empty array when none applied", () => {
      const applied = getAppliedMigrations(db);
      expect(applied).toEqual([]);
    });

    it("should return applied migrations in order", () => {
      ensureMigrationsTable(db);
      db.run(
        "INSERT INTO _migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)",
        [2, "second", "2026-01-16T10:00:00Z", "def"]
      );
      db.run(
        "INSERT INTO _migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)",
        [1, "first", "2026-01-16T09:00:00Z", "abc"]
      );

      const applied = getAppliedMigrations(db);
      expect(applied).toHaveLength(2);
      expect(applied[0].version).toBe(1);
      expect(applied[1].version).toBe(2);
      expect(applied[0].appliedAt).toBeInstanceOf(Date);
    });
  });

  describe("parseMigrationFilename", () => {
    it("should parse valid migration filename", () => {
      const result = parseMigrationFilename("001_add_quick_start.sql");
      expect(result).toEqual({ version: 1, name: "add_quick_start" });
    });

    it("should parse multi-word names with underscores", () => {
      const result = parseMigrationFilename("042_add_some_long_name.sql");
      expect(result).toEqual({ version: 42, name: "add_some_long_name" });
    });

    it("should return null for invalid filename", () => {
      expect(parseMigrationFilename("invalid.sql")).toBeNull();
      expect(parseMigrationFilename("1_missing_zeros.sql")).toBeNull();
      expect(parseMigrationFilename("001-wrong-separator.sql")).toBeNull();
    });
  });

  describe("calculateChecksum", () => {
    it("should return consistent MD5 hash", () => {
      const sql = "ALTER TABLE test ADD COLUMN foo INTEGER;";
      const checksum1 = calculateChecksum(sql);
      const checksum2 = calculateChecksum(sql);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(32); // MD5 hex length
    });

    it("should return different checksums for different SQL", () => {
      const checksum1 = calculateChecksum("SELECT 1");
      const checksum2 = calculateChecksum("SELECT 2");

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe("loadMigrations", () => {
    it("should return empty array for non-existent directory", () => {
      const migrations = loadMigrations("/nonexistent");
      expect(migrations).toEqual([]);
    });

    it("should load migrations in order", () => {
      writeMigration(1, "first", "SELECT 1;");
      writeMigration(2, "second", "SELECT 2;");

      const migrations = loadMigrations(MIGRATIONS_DIR);
      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe("first");
      expect(migrations[1].version).toBe(2);
    });

    it("should parse UP/DOWN sections", () => {
      writeMigration(
        1,
        "with_down",
        `-- UP
ALTER TABLE test ADD COLUMN foo INTEGER;
-- DOWN
ALTER TABLE test DROP COLUMN foo;`
      );

      const migrations = loadMigrations(MIGRATIONS_DIR);
      expect(migrations[0].upSql).toContain("ADD COLUMN");
      expect(migrations[0].downSql).toContain("DROP COLUMN");
    });

    it("should treat entire file as up when no markers", () => {
      writeMigration(1, "no_markers", "ALTER TABLE test ADD COLUMN bar TEXT;");

      const migrations = loadMigrations(MIGRATIONS_DIR);
      expect(migrations[0].upSql).toContain("ADD COLUMN");
      expect(migrations[0].downSql).toBe("");
    });

    it("should throw on non-sequential versions", () => {
      writeMigration(1, "first", "SELECT 1;");
      writeMigration(3, "third", "SELECT 3;"); // Missing 2

      expect(() => loadMigrations(MIGRATIONS_DIR)).toThrow(MigrationFileError);
    });

    it("should throw on invalid filename format", () => {
      writeFileSync(join(MIGRATIONS_DIR, "bad_name.sql"), "SELECT 1;");

      expect(() => loadMigrations(MIGRATIONS_DIR)).toThrow(MigrationFileError);
    });
  });

  describe("runPendingMigrations", () => {
    it("should return success with 0 applied when no migrations", () => {
      const result = runPendingMigrations(db, MIGRATIONS_DIR);
      expect(result.success).toBe(true);
      expect(result.applied).toBe(0);
    });

    it("should apply pending migrations", () => {
      // Create a test table
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");

      writeMigration(1, "add_foo", "ALTER TABLE test ADD COLUMN foo INTEGER;");
      writeMigration(2, "add_bar", "ALTER TABLE test ADD COLUMN bar TEXT;");

      const result = runPendingMigrations(db, MIGRATIONS_DIR);
      expect(result.success).toBe(true);
      expect(result.applied).toBe(2);
      expect(result.migrations).toHaveLength(2);

      // Verify columns exist
      const info = db.query("PRAGMA table_info(test)").all() as {
        name: string;
      }[];
      const columns = info.map((c) => c.name);
      expect(columns).toContain("foo");
      expect(columns).toContain("bar");

      // Verify version recorded
      expect(getCurrentVersion(db)).toBe(2);
    });

    it("should skip already applied migrations", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(1, "add_foo", "ALTER TABLE test ADD COLUMN foo INTEGER;");
      writeMigration(2, "add_bar", "ALTER TABLE test ADD COLUMN bar TEXT;");

      // Apply first migration manually
      runPendingMigrations(db, MIGRATIONS_DIR);

      // Add third migration
      writeMigration(3, "add_baz", "ALTER TABLE test ADD COLUMN baz REAL;");

      const result = runPendingMigrations(db, MIGRATIONS_DIR);
      expect(result.applied).toBe(1);
      expect(result.migrations[0].name).toBe("add_baz");
    });

    it("should rollback on error", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(1, "good", "ALTER TABLE test ADD COLUMN good INTEGER;");
      writeMigration(2, "bad", "THIS IS INVALID SQL;");

      expect(() => runPendingMigrations(db, MIGRATIONS_DIR)).toThrow(
        MigrationError
      );

      // First migration should still be applied
      expect(getCurrentVersion(db)).toBe(1);
    });
  });

  describe("rollbackLastMigration", () => {
    it("should return success with 0 when no migrations to rollback", () => {
      const result = rollbackLastMigration(db, MIGRATIONS_DIR);
      expect(result.success).toBe(true);
      expect(result.applied).toBe(0);
    });

    it("should rollback last migration", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(
        1,
        "add_foo",
        `-- UP
ALTER TABLE test ADD COLUMN foo INTEGER;
-- DOWN
ALTER TABLE test DROP COLUMN foo;`
      );

      runPendingMigrations(db, MIGRATIONS_DIR);
      expect(getCurrentVersion(db)).toBe(1);

      const result = rollbackLastMigration(db, MIGRATIONS_DIR);
      expect(result.success).toBe(true);
      expect(result.applied).toBe(1);
      expect(getCurrentVersion(db)).toBe(0);

      // Verify column removed
      const info = db.query("PRAGMA table_info(test)").all() as {
        name: string;
      }[];
      const columns = info.map((c) => c.name);
      expect(columns).not.toContain("foo");
    });

    it("should throw if no DOWN section", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(1, "no_down", "ALTER TABLE test ADD COLUMN foo INTEGER;");

      runPendingMigrations(db, MIGRATIONS_DIR);

      expect(() => rollbackLastMigration(db, MIGRATIONS_DIR)).toThrow(
        MigrationError
      );
    });
  });

  describe("getMigrationStatus", () => {
    it("should return status with pending migrations", () => {
      writeMigration(1, "first", "SELECT 1;");
      writeMigration(2, "second", "SELECT 2;");

      const status = getMigrationStatus(db, MIGRATIONS_DIR);
      expect(status.currentVersion).toBe(0);
      expect(status.pendingCount).toBe(2);
      expect(status.pendingMigrations).toEqual([
        "001_first",
        "002_second",
      ]);
    });

    it("should show no pending after all applied", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(1, "first", "ALTER TABLE test ADD COLUMN a INTEGER;");

      runPendingMigrations(db, MIGRATIONS_DIR);

      const status = getMigrationStatus(db, MIGRATIONS_DIR);
      expect(status.currentVersion).toBe(1);
      expect(status.pendingCount).toBe(0);
      expect(status.appliedMigrations).toHaveLength(1);
    });
  });

  describe("verifyMigrations", () => {
    it("should pass when checksums match", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(1, "first", "ALTER TABLE test ADD COLUMN a INTEGER;");

      runPendingMigrations(db, MIGRATIONS_DIR);

      expect(() => verifyMigrations(db, MIGRATIONS_DIR)).not.toThrow();
    });

    it("should throw on checksum mismatch", () => {
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      writeMigration(1, "first", "ALTER TABLE test ADD COLUMN a INTEGER;");

      runPendingMigrations(db, MIGRATIONS_DIR);

      // Modify the migration file after applying
      writeMigration(1, "first", "ALTER TABLE test ADD COLUMN b INTEGER;");

      expect(() => verifyMigrations(db, MIGRATIONS_DIR)).toThrow(
        MigrationChecksumError
      );
    });
  });
});
