/**
 * Migration Runner
 * Applies and rolls back database migrations
 */

import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import type {
  Migration,
  AppliedMigration,
  MigrationResult,
  MigrationStatus,
} from "./types";
import {
  MigrationError,
  MigrationFileError,
  MigrationChecksumError,
} from "./types";

// =============================================================================
// Constants
// =============================================================================

/** Table name for tracking applied migrations */
const MIGRATIONS_TABLE = "_migrations";

/** Regex to parse migration filenames (e.g., "001_add_quick_start.sql") */
const MIGRATION_FILE_REGEX = /^(\d{3})_(.+)\.sql$/;

// =============================================================================
// Migration Table Management
// =============================================================================

/**
 * Ensure the _migrations table exists
 */
export function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    )
  `);
}

/**
 * Get the current schema version (highest applied migration)
 */
export function getCurrentVersion(db: Database): number {
  ensureMigrationsTable(db);

  const row = db
    .query<{ version: number }, []>(
      `SELECT COALESCE(MAX(version), 0) as version FROM ${MIGRATIONS_TABLE}`
    )
    .get();

  return row?.version ?? 0;
}

/**
 * Get all applied migrations
 */
export function getAppliedMigrations(db: Database): AppliedMigration[] {
  ensureMigrationsTable(db);

  const rows = db
    .query<
      { version: number; name: string; applied_at: string; checksum: string },
      []
    >(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY version ASC`)
    .all();

  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    appliedAt: new Date(row.applied_at),
    checksum: row.checksum,
  }));
}

/**
 * Record a migration as applied
 */
function recordMigration(
  db: Database,
  version: number,
  name: string,
  checksum: string
): void {
  db.run(
    `INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)`,
    [version, name, new Date().toISOString(), checksum]
  );
}

/**
 * Remove a migration record (for rollback)
 */
function removeMigrationRecord(db: Database, version: number): void {
  db.run(`DELETE FROM ${MIGRATIONS_TABLE} WHERE version = ?`, [version]);
}

// =============================================================================
// Migration File Loading
// =============================================================================

/**
 * Calculate MD5 checksum of SQL content
 */
export function calculateChecksum(sql: string): string {
  return createHash("md5").update(sql).digest("hex");
}

/**
 * Parse a migration filename to extract version and name
 */
export function parseMigrationFilename(
  filename: string
): { version: number; name: string } | null {
  const match = filename.match(MIGRATION_FILE_REGEX);
  if (!match) return null;

  return {
    version: parseInt(match[1], 10),
    name: match[2],
  };
}

/**
 * Load migrations from a directory
 * Migration files must be named: NNN_name.sql (e.g., 001_add_quick_start.sql)
 */
export function loadMigrations(migrationsDir: string): Migration[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrations: Migration[] = [];

  for (const file of files) {
    const parsed = parseMigrationFilename(file);
    if (!parsed) {
      throw new MigrationFileError(
        join(migrationsDir, file),
        `Filename must match format NNN_name.sql (e.g., 001_add_column.sql)`
      );
    }

    const filePath = join(migrationsDir, file);
    const content = readFileSync(filePath, "utf-8");

    // Parse up/down sections if present, otherwise entire file is "up"
    const { upSql, downSql } = parseMigrationContent(content);

    migrations.push({
      version: parsed.version,
      name: parsed.name,
      upSql,
      downSql,
    });
  }

  // Verify versions are sequential
  for (let i = 0; i < migrations.length; i++) {
    if (migrations[i].version !== i + 1) {
      throw new MigrationFileError(
        join(migrationsDir, files[i]),
        `Expected version ${i + 1}, got ${migrations[i].version}. Migrations must be sequential.`
      );
    }
  }

  return migrations;
}

/**
 * Parse migration content to extract up/down SQL
 * Format:
 *   -- UP
 *   <up sql>
 *   -- DOWN
 *   <down sql>
 *
 * If no markers, entire content is treated as "up" with empty "down"
 */
function parseMigrationContent(content: string): {
  upSql: string;
  downSql: string;
} {
  const upMarker = /^--\s*UP\s*$/im;
  const downMarker = /^--\s*DOWN\s*$/im;

  const upMatch = content.match(upMarker);
  const downMatch = content.match(downMarker);

  if (!upMatch && !downMatch) {
    // No markers, entire content is "up"
    return { upSql: content.trim(), downSql: "" };
  }

  if (upMatch && downMatch) {
    const upIndex = upMatch.index! + upMatch[0].length;
    const downIndex = downMatch.index!;

    const upSql = content.slice(upIndex, downIndex).trim();
    const downSql = content.slice(downIndex + downMatch[0].length).trim();

    return { upSql, downSql };
  }

  if (upMatch) {
    const upIndex = upMatch.index! + upMatch[0].length;
    return { upSql: content.slice(upIndex).trim(), downSql: "" };
  }

  // Only DOWN marker (unusual, but handle it)
  return { upSql: content.trim(), downSql: "" };
}

// =============================================================================
// Migration Execution
// =============================================================================

/**
 * Run all pending migrations
 */
export function runPendingMigrations(
  db: Database,
  migrationsDir: string
): MigrationResult {
  ensureMigrationsTable(db);

  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations(migrationsDir);
  const pending = migrations.filter((m) => m.version > currentVersion);

  if (pending.length === 0) {
    return { applied: 0, migrations: [], success: true };
  }

  const applied: AppliedMigration[] = [];

  for (const migration of pending) {
    const checksum = calculateChecksum(migration.upSql);

    try {
      db.exec("BEGIN TRANSACTION");
      db.exec(migration.upSql);
      recordMigration(db, migration.version, migration.name, checksum);
      db.exec("COMMIT");

      applied.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date(),
        checksum,
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw new MigrationError(
        migration.version,
        migration.name,
        error as Error
      );
    }
  }

  return {
    applied: applied.length,
    migrations: applied,
    success: true,
  };
}

/**
 * Rollback the last applied migration
 */
export function rollbackLastMigration(
  db: Database,
  migrationsDir: string
): MigrationResult {
  ensureMigrationsTable(db);

  const currentVersion = getCurrentVersion(db);
  if (currentVersion === 0) {
    return { applied: 0, migrations: [], success: true };
  }

  const migrations = loadMigrations(migrationsDir);
  const migration = migrations.find((m) => m.version === currentVersion);

  if (!migration) {
    throw new MigrationError(
      currentVersion,
      "unknown",
      new Error(`Migration file for version ${currentVersion} not found`)
    );
  }

  if (!migration.downSql) {
    throw new MigrationError(
      currentVersion,
      migration.name,
      new Error("Migration has no DOWN section for rollback")
    );
  }

  try {
    db.exec("BEGIN TRANSACTION");
    db.exec(migration.downSql);
    removeMigrationRecord(db, migration.version);
    db.exec("COMMIT");

    return {
      applied: 1,
      migrations: [
        {
          version: migration.version,
          name: migration.name,
          appliedAt: new Date(),
          checksum: calculateChecksum(migration.downSql),
        },
      ],
      success: true,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw new MigrationError(migration.version, migration.name, error as Error);
  }
}

/**
 * Get migration status
 */
export function getMigrationStatus(
  db: Database,
  migrationsDir: string
): MigrationStatus {
  ensureMigrationsTable(db);

  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations(migrationsDir);
  const appliedMigrations = getAppliedMigrations(db);
  const pending = migrations.filter((m) => m.version > currentVersion);

  return {
    currentVersion,
    pendingCount: pending.length,
    pendingMigrations: pending.map((m) => `${m.version.toString().padStart(3, "0")}_${m.name}`),
    appliedMigrations,
  };
}

/**
 * Verify that applied migrations match their files (checksum validation)
 */
export function verifyMigrations(
  db: Database,
  migrationsDir: string
): void {
  const appliedMigrations = getAppliedMigrations(db);
  const migrations = loadMigrations(migrationsDir);

  for (const applied of appliedMigrations) {
    const migration = migrations.find((m) => m.version === applied.version);
    if (!migration) {
      throw new MigrationFileError(
        migrationsDir,
        `Applied migration ${applied.version} (${applied.name}) not found in migrations directory`
      );
    }

    const currentChecksum = calculateChecksum(migration.upSql);
    if (currentChecksum !== applied.checksum) {
      throw new MigrationChecksumError(
        applied.version,
        applied.checksum,
        currentChecksum
      );
    }
  }
}

// =============================================================================
// Embedded Migration Support
// =============================================================================

/**
 * Run pending migrations from embedded migration data
 * Used when filesystem migrations are unavailable (compiled binary)
 */
export function runEmbeddedMigrations(
  db: Database,
  embeddedMigrations: Migration[]
): MigrationResult {
  ensureMigrationsTable(db);

  const currentVersion = getCurrentVersion(db);
  const pending = embeddedMigrations.filter((m) => m.version > currentVersion);

  if (pending.length === 0) {
    return { applied: 0, migrations: [], success: true };
  }

  const applied: AppliedMigration[] = [];

  for (const migration of pending) {
    const checksum = calculateChecksum(migration.upSql);

    try {
      db.exec("BEGIN TRANSACTION");
      db.exec(migration.upSql);
      recordMigration(db, migration.version, migration.name, checksum);
      db.exec("COMMIT");

      applied.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date(),
        checksum,
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw new MigrationError(
        migration.version,
        migration.name,
        error as Error
      );
    }
  }

  return {
    applied: applied.length,
    migrations: applied,
    success: true,
  };
}
