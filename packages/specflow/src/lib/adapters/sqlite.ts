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
import { renderSchema } from "./schema";

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

    // Use shared schema definitions
    const statements = renderSchema("sqlite");
    for (const statement of statements) {
      db.exec(statement);
    }

    // Create session table (SQLite-specific, not shared)
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
}
