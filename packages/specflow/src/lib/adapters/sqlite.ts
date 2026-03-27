/**
 * SQLite Database Adapter
 * Wraps existing bun:sqlite implementation
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { DbConfig } from "./types";
import { BaseAdapter } from "./base";
import { runPendingMigrations, runEmbeddedMigrations, getCurrentVersion } from "../migrations";
import { EMBEDDED_MIGRATIONS } from "../migrations/embedded";

// =============================================================================
// SQLiteAdapter Implementation
// =============================================================================

export class SQLiteAdapter extends BaseAdapter {
  private db: Database | null = null;
  private dbPath: string | null = null;

  // ============================================
  // Connection Lifecycle
  // ============================================

  async connect(config: DbConfig): Promise<void> {
    if (!config.sqlite) {
      throw new Error("SQLite configuration is required");
    }

    this.dbPath = config.sqlite.path;

    // Ensure parent directory exists
    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create database connection
    this.db = new Database(this.dbPath, { create: true });

    // Enable WAL mode for better concurrency
    this.db.exec("PRAGMA journal_mode = WAL");

    // Initialize schema
    this.initializeSchema();

    // Run migrations
    await this.runMigrations();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call connect() first.");
    }
    return this.db;
  }

  // ============================================
  // Database Primitives (SQLite-specific)
  // ============================================

  protected async execute(query: string, values?: any[]): Promise<void> {
    const db = this.getDb();
    db.run(query, values ?? []);
  }

  protected async queryOne<T>(query: string, values?: any[]): Promise<T | null> {
    const db = this.getDb();
    const row = db.query<T, any[]>(query).get(...(values ?? []));
    return row ?? null;
  }

  protected async queryMany<T>(query: string, values?: any[]): Promise<T[]> {
    const db = this.getDb();
    return db.query<T, any[]>(query).all(...(values ?? []));
  }

  protected now(): string {
    return new Date().toISOString();
  }

  // ============================================
  // Schema Initialization
  // ============================================

  private initializeSchema(): void {
    const db = this.getDb();

    // Create features table
    db.exec(`
      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 999,
        status TEXT NOT NULL DEFAULT 'pending',
        phase TEXT NOT NULL DEFAULT 'none',
        spec_path TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        migrated_from TEXT,
        quick_start INTEGER DEFAULT 0,
        problem_type TEXT,
        urgency TEXT,
        primary_user TEXT,
        integration_scope TEXT,
        usage_context TEXT,
        data_requirements TEXT,
        performance_requirements TEXT,
        priority_tradeoff TEXT,
        uncertainties TEXT,
        clarification_needed TEXT,
        skip_reason TEXT,
        skip_justification TEXT,
        skip_validated_at TEXT,
        skip_duplicate_of TEXT
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_features_status ON features(status);
      CREATE INDEX IF NOT EXISTS idx_features_priority ON features(priority);
    `);

    // Create harden_results table
    db.exec(`
      CREATE TABLE IF NOT EXISTS harden_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id TEXT NOT NULL,
        test_name TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence TEXT,
        ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feature_id) REFERENCES features(id)
      )
    `);

    // Create review_records table
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id TEXT NOT NULL,
        reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        passed INTEGER NOT NULL,
        checks_json TEXT,
        acceptance_json TEXT,
        FOREIGN KEY (feature_id) REFERENCES features(id)
      )
    `);

    // Create approval_gates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS approval_gates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id TEXT NOT NULL,
        status TEXT NOT NULL,
        triggered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        rejection_reason TEXT,
        FOREIGN KEY (feature_id) REFERENCES features(id)
      )
    `);

    // Create session table
    db.exec(`
      CREATE TABLE IF NOT EXISTS session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        started_at TEXT,
        current_feature_id TEXT,
        features_completed INTEGER DEFAULT 0,
        last_error TEXT,
        FOREIGN KEY (current_feature_id) REFERENCES features(id)
      )
    `);
  }

  private async runMigrations(): Promise<void> {
    const db = this.getDb();

    // Try filesystem migrations first
    const migrationsDir = join(import.meta.dir, "..", "..", "..", "migrations");
    if (existsSync(migrationsDir)) {
      const result = runPendingMigrations(db, migrationsDir);
      const currentVersion = getCurrentVersion(db);
      if (currentVersion === 0 && EMBEDDED_MIGRATIONS.length > 0) {
        runEmbeddedMigrations(db, EMBEDDED_MIGRATIONS);
      }
    } else if (EMBEDDED_MIGRATIONS.length > 0) {
      runEmbeddedMigrations(db, EMBEDDED_MIGRATIONS);
    }
  }

  // ============================================
  // Bulk Operations (for migrations)
  // ============================================

  async bulkInsert(table: string, columns: string[], rows: any[][]): Promise<void> {
    const db = this.getDb();

    if (rows.length === 0) {
      return;
    }

    // Build INSERT query with multiple value sets
    const placeholders = columns.map(() => "?").join(", ");
    const valuesSets = rows.map(() => `(${placeholders})`).join(", ");
    const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuesSets}`;

    // Flatten rows array for query parameters
    const values = rows.flat();

    db.run(query, values);
  }

  async getTableRowCount(table: string): Promise<number> {
    const db = this.getDb();
    const row = db.query<{ count: number }, []>(`SELECT COUNT(*) as count FROM ${table}`).get();
    return row?.count ?? 0;
  }
}
