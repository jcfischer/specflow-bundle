/**
 * Migration Types
 * Type definitions for the database migration system
 */

// =============================================================================
// Migration Definitions
// =============================================================================

/**
 * A database migration definition
 * Loaded from SQL files in the migrations/ directory
 */
export interface Migration {
  /** Sequential version number (001, 002, etc.) */
  version: number;
  /** Descriptive name (e.g., "add_quick_start") */
  name: string;
  /** SQL to apply the migration */
  upSql: string;
  /** SQL to rollback the migration (optional) */
  downSql: string;
}

/**
 * A migration that has been applied to the database
 * Stored in the _migrations table
 */
export interface AppliedMigration {
  /** Sequential version number */
  version: number;
  /** Descriptive name */
  name: string;
  /** When the migration was applied */
  appliedAt: Date;
  /** MD5 checksum of the migration SQL */
  checksum: string;
}

// =============================================================================
// Migration Results
// =============================================================================

/**
 * Result of running migrations
 */
export interface MigrationResult {
  /** Number of migrations applied */
  applied: number;
  /** List of migrations that were applied */
  migrations: AppliedMigration[];
  /** Whether any migrations were applied */
  success: boolean;
}

/**
 * Result of checking migration status
 */
export interface MigrationStatus {
  /** Current schema version (0 if no migrations applied) */
  currentVersion: number;
  /** Number of pending migrations */
  pendingCount: number;
  /** List of pending migration names */
  pendingMigrations: string[];
  /** List of applied migrations */
  appliedMigrations: AppliedMigration[];
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when a migration fails
 */
export class MigrationError extends Error {
  constructor(
    public readonly version: number,
    public readonly migrationName: string,
    public readonly cause: Error
  ) {
    super(`Migration ${version} (${migrationName}) failed: ${cause.message}`);
    this.name = "MigrationError";
  }
}

/**
 * Error thrown when migration files are invalid
 */
export class MigrationFileError extends Error {
  constructor(
    public readonly filePath: string,
    message: string
  ) {
    super(`Invalid migration file ${filePath}: ${message}`);
    this.name = "MigrationFileError";
  }
}

/**
 * Error thrown when migration checksum doesn't match
 */
export class MigrationChecksumError extends Error {
  constructor(
    public readonly version: number,
    public readonly expected: string,
    public readonly actual: string
  ) {
    super(
      `Migration ${version} checksum mismatch: expected ${expected}, got ${actual}. ` +
      `Migration files should not be modified after being applied.`
    );
    this.name = "MigrationChecksumError";
  }
}
