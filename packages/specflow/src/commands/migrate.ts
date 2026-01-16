/**
 * Migrate Command
 * CLI interface for database schema migrations
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync } from "fs";
import {
  getMigrationStatus,
  runPendingMigrations,
  rollbackLastMigration,
  verifyMigrations,
} from "../lib/migrations";
import { getDbPath, dbExists, SPECFLOW_DIR } from "../lib/database";

// =============================================================================
// Types
// =============================================================================

export interface MigrateCommandOptions {
  status?: boolean;
  rollback?: boolean;
  verify?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Get migrations directory for a project */
function getMigrationsDir(): string {
  // Migrations are stored with the SpecFlow package, not the project
  return join(import.meta.dir, "..", "..", "migrations");
}

// =============================================================================
// Command Implementation
// =============================================================================

export async function migrateCommand(
  options: MigrateCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  // Check if database exists
  if (!dbExists(projectPath)) {
    console.log("⚠️  No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);
  const migrationsDir = getMigrationsDir();

  // Check if migrations directory exists
  if (!existsSync(migrationsDir)) {
    console.log("⚠️  No migrations directory found.");
    process.exit(1);
  }

  const db = new Database(dbPath);

  try {
    if (options.status) {
      showStatus(db, migrationsDir);
    } else if (options.rollback) {
      runRollback(db, migrationsDir);
    } else if (options.verify) {
      runVerify(db, migrationsDir);
    } else {
      runMigrations(db, migrationsDir);
    }
  } finally {
    db.close();
  }
}

// =============================================================================
// Subcommands
// =============================================================================

function showStatus(db: Database, migrationsDir: string): void {
  const status = getMigrationStatus(db, migrationsDir);

  console.log("📊 Migration Status\n");
  console.log(`Current version: ${status.currentVersion}`);
  console.log(`Applied migrations: ${status.appliedMigrations.length}`);
  console.log(`Pending migrations: ${status.pendingCount}`);

  if (status.appliedMigrations.length > 0) {
    console.log("\n✅ Applied:");
    for (const m of status.appliedMigrations) {
      const date = m.appliedAt.toISOString().split("T")[0];
      console.log(
        `   ${m.version.toString().padStart(3, "0")}_${m.name} (${date})`
      );
    }
  }

  if (status.pendingCount > 0) {
    console.log("\n⏳ Pending:");
    for (const name of status.pendingMigrations) {
      console.log(`   ${name}`);
    }
    console.log(`\nRun 'specflow migrate' to apply pending migrations.`);
  } else {
    console.log("\n✓ Database is up to date.");
  }
}

function runMigrations(db: Database, migrationsDir: string): void {
  console.log("🔄 Running migrations...\n");

  try {
    const result = runPendingMigrations(db, migrationsDir);

    if (result.applied === 0) {
      console.log("✓ No pending migrations. Database is up to date.");
      return;
    }

    console.log(`✓ Applied ${result.applied} migration(s):\n`);
    for (const m of result.migrations) {
      console.log(`   ✓ ${m.version.toString().padStart(3, "0")}_${m.name}`);
    }
  } catch (error) {
    console.error(`\n❌ Migration failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

function runRollback(db: Database, migrationsDir: string): void {
  console.log("⏪ Rolling back last migration...\n");

  try {
    const result = rollbackLastMigration(db, migrationsDir);

    if (result.applied === 0) {
      console.log("✓ No migrations to roll back.");
      return;
    }

    const m = result.migrations[0];
    console.log(`✓ Rolled back: ${m.version.toString().padStart(3, "0")}_${m.name}`);
  } catch (error) {
    console.error(`\n❌ Rollback failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

function runVerify(db: Database, migrationsDir: string): void {
  console.log("🔍 Verifying migration checksums...\n");

  try {
    verifyMigrations(db, migrationsDir);
    console.log("✓ All migration checksums match.");
  } catch (error) {
    console.error(`\n❌ Verification failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
