/**
 * Database Module
 * SQLite operations for feature queue management
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync, renameSync } from "fs";
import type {
  Feature,
  FeatureStatus,
  FeatureStats,
  SpecPhase,
  ProblemType,
  UrgencyType,
  PrimaryUserType,
  IntegrationScopeType,
  UsageContextType,
  DataRequirementsType,
  PerformanceRequirementsType,
  PriorityTradeoffType,
} from "../types";
import { runPendingMigrations, runEmbeddedMigrations } from "./migrations";
import { EMBEDDED_MIGRATIONS } from "./migrations/embedded";

// =============================================================================
// Module State
// =============================================================================

let db: Database | null = null;

// =============================================================================
// Database Path Management
// =============================================================================

/** Directory name for SpecFlow data */
export const SPECFLOW_DIR = ".specflow";

/** Database filename */
export const DB_FILENAME = "features.db";

/**
 * Get the database path for a project
 * Checks new location (.specflow/features.db) first, then legacy (features.db)
 * For new projects, returns the new location
 */
export function getDbPath(projectPath: string): string {
  const newPath = join(projectPath, SPECFLOW_DIR, DB_FILENAME);
  const legacyPath = join(projectPath, DB_FILENAME);

  // Prefer new location if it exists
  if (existsSync(newPath)) {
    return newPath;
  }

  // Fall back to legacy location if it exists
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  // For new projects, use new location
  return newPath;
}

/**
 * Check if a database exists at either location
 */
export function dbExists(projectPath: string): boolean {
  const newPath = join(projectPath, SPECFLOW_DIR, DB_FILENAME);
  const legacyPath = join(projectPath, DB_FILENAME);
  return existsSync(newPath) || existsSync(legacyPath);
}

/**
 * Check if database is in legacy location
 */
export function isLegacyLocation(projectPath: string): boolean {
  const newPath = join(projectPath, SPECFLOW_DIR, DB_FILENAME);
  const legacyPath = join(projectPath, DB_FILENAME);
  return existsSync(legacyPath) && !existsSync(newPath);
}

/**
 * Migrate database from legacy location to new .specflow directory
 * Returns true if migration occurred, false if not needed
 */
export function migrateDatabase(projectPath: string): boolean {
  const newPath = join(projectPath, SPECFLOW_DIR, DB_FILENAME);
  const legacyPath = join(projectPath, DB_FILENAME);
  const specflowDir = join(projectPath, SPECFLOW_DIR);

  // Only migrate if legacy exists and new doesn't
  if (!existsSync(legacyPath) || existsSync(newPath)) {
    return false;
  }

  // Create .specflow directory if needed
  if (!existsSync(specflowDir)) {
    mkdirSync(specflowDir, { recursive: true });
  }

  // Move the database file
  renameSync(legacyPath, newPath);

  // Also move WAL and SHM files if they exist
  const walPath = legacyPath + "-wal";
  const shmPath = legacyPath + "-shm";

  if (existsSync(walPath)) {
    renameSync(walPath, newPath + "-wal");
  }
  if (existsSync(shmPath)) {
    renameSync(shmPath, newPath + "-shm");
  }

  return true;
}

/**
 * Ensure the .specflow directory exists
 */
export function ensureSpecflowDir(projectPath: string): void {
  const specflowDir = join(projectPath, SPECFLOW_DIR);
  if (!existsSync(specflowDir)) {
    mkdirSync(specflowDir, { recursive: true });
  }
}

// =============================================================================
// Database Initialization
// =============================================================================

/**
 * Initialize the database with schema
 * Creates tables if they don't exist
 */
export function initDatabase(dbPath: string): Database {
  // Close existing connection if any
  if (db) {
    db.close();
  }

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrency
  db.exec("PRAGMA journal_mode = WAL");

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
      migrated_from TEXT
    )
  `);

  // Migration: add phase column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE features ADD COLUMN phase TEXT NOT NULL DEFAULT 'none'`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: add migrated_from column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE features ADD COLUMN migrated_from TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_features_status ON features(status);
    CREATE INDEX IF NOT EXISTS idx_features_priority ON features(priority);
  `);

  // Create session table (single row)
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

  // Run pending migrations
  // First try filesystem (works when running from source)
  // Fall back to embedded migrations (works in compiled binary)
  const migrationsDir = join(import.meta.dir, "..", "..", "migrations");
  if (existsSync(migrationsDir)) {
    runPendingMigrations(db, migrationsDir);
  } else if (EMBEDDED_MIGRATIONS.length > 0) {
    runEmbeddedMigrations(db, EMBEDDED_MIGRATIONS);
  }

  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the current database instance
 * Throws if not initialized
 */
function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

// =============================================================================
// Feature Operations
// =============================================================================

/**
 * Input for adding a new feature
 */
export interface AddFeatureInput {
  id: string;
  name: string;
  description: string;
  priority: number;
  specPath?: string;
  /** Original ID from SpecFlow registry (for migration) */
  migratedFrom?: string;

  // Rich decomposition fields (for batch mode)
  problemType?: ProblemType;
  urgency?: UrgencyType;
  primaryUser?: PrimaryUserType;
  integrationScope?: IntegrationScopeType;
  usageContext?: UsageContextType;
  dataRequirements?: DataRequirementsType;
  performanceRequirements?: PerformanceRequirementsType;
  priorityTradeoff?: PriorityTradeoffType;
  uncertainties?: string[];
  clarificationNeeded?: string;
}

/**
 * Add a new feature to the queue
 */
export function addFeature(input: AddFeatureInput): void {
  const db = getDb();
  const now = new Date().toISOString();

  // Serialize uncertainties array to JSON if present
  const uncertaintiesJson = input.uncertainties
    ? JSON.stringify(input.uncertainties)
    : null;

  db.run(
    `INSERT INTO features (
      id, name, description, priority, spec_path, created_at, migrated_from,
      problem_type, urgency, primary_user, integration_scope,
      usage_context, data_requirements, performance_requirements, priority_tradeoff,
      uncertainties, clarification_needed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      input.description,
      input.priority,
      input.specPath ?? null,
      now,
      input.migratedFrom ?? null,
      input.problemType ?? null,
      input.urgency ?? null,
      input.primaryUser ?? null,
      input.integrationScope ?? null,
      input.usageContext ?? null,
      input.dataRequirements ?? null,
      input.performanceRequirements ?? null,
      input.priorityTradeoff ?? null,
      uncertaintiesJson,
      input.clarificationNeeded ?? null,
    ]
  );
}

/**
 * Get all features ordered by priority
 */
export function getFeatures(): Feature[] {
  const db = getDb();

  const rows = db.query<FeatureRow, []>(
    `SELECT * FROM features ORDER BY priority ASC, id ASC`
  ).all();

  return rows.map(rowToFeature);
}

/**
 * Get a specific feature by ID
 */
export function getFeature(id: string): Feature | null {
  const db = getDb();

  const row = db.query<FeatureRow, [string]>(
    `SELECT * FROM features WHERE id = ?`
  ).get(id);

  return row ? rowToFeature(row) : null;
}

/**
 * Get the next pending feature (highest priority)
 */
export function getNextFeature(): Feature | null {
  const db = getDb();

  const row = db.query<FeatureRow, []>(
    `SELECT * FROM features
     WHERE status = 'pending'
     ORDER BY priority ASC, id ASC
     LIMIT 1`
  ).get();

  return row ? rowToFeature(row) : null;
}

/**
 * Get the next feature ready for implementation (highest priority with phase = tasks or implement)
 * This respects priority order and only returns features that have completed SpecFlow phases.
 */
export function getNextReadyFeature(): Feature | null {
  const db = getDb();

  const row = db.query<FeatureRow, []>(
    `SELECT * FROM features
     WHERE status = 'pending'
       AND (phase = 'tasks' OR phase = 'implement')
     ORDER BY priority ASC, id ASC
     LIMIT 1`
  ).get();

  return row ? rowToFeature(row) : null;
}

/**
 * Get the next feature needing SpecFlow phases (highest priority with phase != tasks/implement)
 * Use this to guide users to complete phases before implementation.
 */
export function getNextFeatureNeedingPhases(): Feature | null {
  const db = getDb();

  const row = db.query<FeatureRow, []>(
    `SELECT * FROM features
     WHERE status = 'pending'
       AND phase != 'tasks'
       AND phase != 'implement'
     ORDER BY priority ASC, id ASC
     LIMIT 1`
  ).get();

  return row ? rowToFeature(row) : null;
}

/**
 * Update a feature's status
 */
export function updateFeatureStatus(id: string, status: FeatureStatus): void {
  const db = getDb();
  const now = new Date().toISOString();

  let startedAt: string | null = null;
  let completedAt: string | null = null;

  if (status === "in_progress") {
    startedAt = now;
  } else if (status === "complete") {
    completedAt = now;
    // Also set startedAt if not already set
    const feature = getFeature(id);
    if (feature && !feature.startedAt) {
      startedAt = now;
    }
  }

  if (startedAt && completedAt) {
    db.run(
      `UPDATE features SET status = ?, started_at = ?, completed_at = ? WHERE id = ?`,
      [status, startedAt, completedAt, id]
    );
  } else if (startedAt) {
    db.run(
      `UPDATE features SET status = ?, started_at = ? WHERE id = ?`,
      [status, startedAt, id]
    );
  } else if (completedAt) {
    db.run(
      `UPDATE features SET status = ?, completed_at = ? WHERE id = ?`,
      [status, completedAt, id]
    );
  } else {
    db.run(
      `UPDATE features SET status = ? WHERE id = ?`,
      [status, id]
    );
  }
}

/**
 * Skip a feature (move to end of queue)
 */
export function skipFeature(id: string): void {
  const db = getDb();

  // Get max priority
  const row = db.query<{ max_priority: number }, []>(
    `SELECT COALESCE(MAX(priority), 0) as max_priority FROM features`
  ).get();

  const newPriority = (row?.max_priority ?? 0) + 1;

  db.run(
    `UPDATE features SET status = 'skipped', priority = ? WHERE id = ?`,
    [newPriority, id]
  );
}

/**
 * Reset a feature to pending state
 */
export function resetFeature(id: string): void {
  const db = getDb();

  db.run(
    `UPDATE features SET status = 'pending', started_at = NULL, completed_at = NULL WHERE id = ?`,
    [id]
  );
}

/**
 * Clear all features from the database
 */
export function clearAllFeatures(): void {
  const db = getDb();
  db.run(`DELETE FROM features`);
}

/**
 * Delete a specific feature from the database
 */
export function deleteFeature(id: string): void {
  const db = getDb();
  db.run(`DELETE FROM features WHERE id = ?`, [id]);
}

/**
 * Update a feature's SpecFlow phase
 */
export function updateFeaturePhase(id: string, phase: SpecPhase): void {
  const db = getDb();
  db.run(`UPDATE features SET phase = ? WHERE id = ?`, [phase, id]);
}

/**
 * Update a feature's spec path
 */
export function updateFeatureSpecPath(id: string, specPath: string): void {
  const db = getDb();
  db.run(`UPDATE features SET spec_path = ? WHERE id = ?`, [specPath, id]);
}

/**
 * Update a feature's priority
 */
export function updateFeaturePriority(id: string, priority: number): void {
  const db = getDb();
  db.run(`UPDATE features SET priority = ? WHERE id = ?`, [priority, id]);
}

/**
 * Update a feature's name
 */
export function updateFeatureName(id: string, name: string): void {
  const db = getDb();
  db.run(`UPDATE features SET name = ? WHERE id = ?`, [name, id]);
}

/**
 * Update a feature's description
 */
export function updateFeatureDescription(id: string, description: string): void {
  const db = getDb();
  db.run(`UPDATE features SET description = ? WHERE id = ?`, [description, id]);
}

/**
 * Update a feature's quick_start flag
 */
export function updateFeatureQuickStart(id: string, quickStart: boolean): void {
  const db = getDb();
  db.run(`UPDATE features SET quick_start = ? WHERE id = ?`, [quickStart ? 1 : 0, id]);
}

/**
 * Input for updating decomposition fields
 */
export interface UpdateDecompositionInput {
  problemType?: ProblemType;
  urgency?: UrgencyType;
  primaryUser?: PrimaryUserType;
  integrationScope?: IntegrationScopeType;
  usageContext?: UsageContextType;
  dataRequirements?: DataRequirementsType;
  performanceRequirements?: PerformanceRequirementsType;
  priorityTradeoff?: PriorityTradeoffType;
  uncertainties?: string[];
  clarificationNeeded?: string;
}

/**
 * Update a feature's decomposition fields (for enrich command)
 * Only updates fields that are provided (non-undefined)
 */
export function updateFeatureDecomposition(
  id: string,
  input: UpdateDecompositionInput
): void {
  const db = getDb();

  // Build dynamic update query
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (input.problemType !== undefined) {
    updates.push("problem_type = ?");
    values.push(input.problemType);
  }
  if (input.urgency !== undefined) {
    updates.push("urgency = ?");
    values.push(input.urgency);
  }
  if (input.primaryUser !== undefined) {
    updates.push("primary_user = ?");
    values.push(input.primaryUser);
  }
  if (input.integrationScope !== undefined) {
    updates.push("integration_scope = ?");
    values.push(input.integrationScope);
  }
  if (input.usageContext !== undefined) {
    updates.push("usage_context = ?");
    values.push(input.usageContext);
  }
  if (input.dataRequirements !== undefined) {
    updates.push("data_requirements = ?");
    values.push(input.dataRequirements);
  }
  if (input.performanceRequirements !== undefined) {
    updates.push("performance_requirements = ?");
    values.push(input.performanceRequirements);
  }
  if (input.priorityTradeoff !== undefined) {
    updates.push("priority_tradeoff = ?");
    values.push(input.priorityTradeoff);
  }
  if (input.uncertainties !== undefined) {
    updates.push("uncertainties = ?");
    values.push(JSON.stringify(input.uncertainties));
  }
  if (input.clarificationNeeded !== undefined) {
    updates.push("clarification_needed = ?");
    values.push(input.clarificationNeeded);
  }

  if (updates.length === 0) {
    return; // Nothing to update
  }

  values.push(id);
  db.run(
    `UPDATE features SET ${updates.join(", ")} WHERE id = ?`,
    values
  );
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get aggregate statistics about the feature queue
 */
export function getStats(): FeatureStats {
  const db = getDb();

  const row = db.query<StatsRow, []>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as complete,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
    FROM features
  `).get();

  if (!row) {
    return {
      total: 0,
      pending: 0,
      inProgress: 0,
      complete: 0,
      skipped: 0,
      percentComplete: 0,
    };
  }

  const total = row.total ?? 0;
  const complete = row.complete ?? 0;

  return {
    total,
    pending: row.pending ?? 0,
    inProgress: row.in_progress ?? 0,
    complete,
    skipped: row.skipped ?? 0,
    percentComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
  };
}

// =============================================================================
// Internal Types and Helpers
// =============================================================================

interface FeatureRow {
  id: string;
  name: string;
  description: string;
  priority: number;
  status: string;
  phase: string;
  spec_path: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  migrated_from: string | null;
  quick_start: number | null;
  // Rich decomposition fields
  problem_type: string | null;
  urgency: string | null;
  primary_user: string | null;
  integration_scope: string | null;
  usage_context: string | null;
  data_requirements: string | null;
  performance_requirements: string | null;
  priority_tradeoff: string | null;
  uncertainties: string | null;
  clarification_needed: string | null;
}

interface StatsRow {
  total: number;
  pending: number;
  in_progress: number;
  complete: number;
  skipped: number;
}

function rowToFeature(row: FeatureRow): Feature {
  // Parse uncertainties JSON array if present
  let uncertainties: string[] | undefined;
  if (row.uncertainties) {
    try {
      uncertainties = JSON.parse(row.uncertainties);
    } catch {
      uncertainties = undefined;
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    status: row.status as FeatureStatus,
    phase: (row.phase || "none") as SpecPhase,
    specPath: row.spec_path,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    migratedFrom: row.migrated_from,
    quickStart: row.quick_start === 1,
    // Rich decomposition fields
    problemType: row.problem_type as ProblemType | undefined,
    urgency: row.urgency as UrgencyType | undefined,
    primaryUser: row.primary_user as PrimaryUserType | undefined,
    integrationScope: row.integration_scope as IntegrationScopeType | undefined,
    usageContext: row.usage_context as UsageContextType | undefined,
    dataRequirements: row.data_requirements as DataRequirementsType | undefined,
    performanceRequirements: row.performance_requirements as PerformanceRequirementsType | undefined,
    priorityTradeoff: row.priority_tradeoff as PriorityTradeoffType | undefined,
    uncertainties,
    clarificationNeeded: row.clarification_needed ?? undefined,
  };
}
