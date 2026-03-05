/**
 * Database Module
 * SQLite operations for feature queue management
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync, renameSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import type {
  Feature,
  FeatureStatus,
  FeatureStats,
  SpecPhase,
  SkipReason,
  ProblemType,
  UrgencyType,
  PrimaryUserType,
  IntegrationScopeType,
  UsageContextType,
  DataRequirementsType,
  PerformanceRequirementsType,
  PriorityTradeoffType,
  HardenResult,
  ReviewRecord,
  ApprovalGate,
  ApprovalStatus,
} from "../types";
import { runPendingMigrations, runEmbeddedMigrations, getCurrentVersion } from "./migrations";
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
 * Ensure the .specflow directory exists and is gitignored
 */
export function ensureSpecflowDir(projectPath: string): void {
  const specflowDir = join(projectPath, SPECFLOW_DIR);
  if (!existsSync(specflowDir)) {
    mkdirSync(specflowDir, { recursive: true });
  }
  ensureGitignoreEntry(projectPath);
}

/**
 * Ensure .specflow/ is listed in the project's .gitignore.
 * Creates .gitignore if it doesn't exist. Appends the entry if missing.
 */
function ensureGitignoreEntry(projectPath: string): void {
  const gitignorePath = join(projectPath, ".gitignore");
  const entry = `${SPECFLOW_DIR}/`;

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    // Check if entry already present (exact line match)
    const lines = content.split("\n").map((l) => l.trim());
    if (lines.includes(entry) || lines.includes(SPECFLOW_DIR)) {
      return; // Already gitignored
    }
    // Append with a preceding newline if file doesn't end with one
    const prefix = content.endsWith("\n") ? "" : "\n";
    appendFileSync(gitignorePath, `${prefix}${entry}\n`);
  } else {
    writeFileSync(gitignorePath, `${entry}\n`);
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
  let migrationsApplied = false;
  if (existsSync(migrationsDir)) {
    const result = runPendingMigrations(db, migrationsDir);
    migrationsApplied = result.applied > 0 || result.success;
    // Verify migrations actually ran by checking if any migration files were found.
    // In compiled binaries, existsSync may return true for virtual paths but
    // the directory may be empty or unreadable, resulting in 0 applied migrations
    // even when the schema version is 0 (fresh database).
    const currentVersion = getCurrentVersion(db);
    if (currentVersion === 0 && EMBEDDED_MIGRATIONS.length > 0) {
      // Filesystem migrations found nothing to apply on a fresh DB — fall back
      runEmbeddedMigrations(db, EMBEDDED_MIGRATIONS);
    }
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

/**
 * Get the current database instance (public)
 * For use by sub-modules (e.g., contrib-prep/state.ts) that need
 * access to the shared connection without circular imports.
 */
export function getDbInstance(): Database {
  return getDb();
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
 * Input for skipping a feature with validation
 */
export interface SkipFeatureInput {
  /** Reason for skipping */
  reason: SkipReason;
  /** Detailed justification */
  justification: string;
  /** If duplicate, which feature it duplicates */
  duplicateOf?: string;
}

/**
 * Skip a feature (move to end of queue) - DEPRECATED
 * Use skipFeatureWithValidation instead for proper audit trail
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
 * Skip a feature with validation and audit trail
 * This is the preferred method for skipping features
 */
export function skipFeatureWithValidation(
  id: string,
  input: SkipFeatureInput
): { success: boolean; error?: string } {
  const db = getDb();
  const now = new Date().toISOString();

  // Validate duplicate_of if reason is duplicate
  if (input.reason === "duplicate") {
    if (!input.duplicateOf) {
      return {
        success: false,
        error: "When skip reason is 'duplicate', you must specify which feature it duplicates (--duplicate-of)",
      };
    }

    // Check that the duplicate feature exists
    const duplicateFeature = getFeature(input.duplicateOf);
    if (!duplicateFeature) {
      return {
        success: false,
        error: `Duplicate feature '${input.duplicateOf}' not found. Cannot skip as duplicate of non-existent feature.`,
      };
    }

    // Check that the duplicate feature is complete or in_progress
    if (duplicateFeature.status !== "complete" && duplicateFeature.status !== "in_progress") {
      return {
        success: false,
        error: `Cannot skip as duplicate of '${input.duplicateOf}' - that feature is not complete or in progress (status: ${duplicateFeature.status}). Complete the original feature first.`,
      };
    }
  }

  // Get max priority
  const row = db.query<{ max_priority: number }, []>(
    `SELECT COALESCE(MAX(priority), 0) as max_priority FROM features`
  ).get();

  const newPriority = (row?.max_priority ?? 0) + 1;

  db.run(
    `UPDATE features SET
      status = 'skipped',
      priority = ?,
      skip_reason = ?,
      skip_justification = ?,
      skip_validated_at = ?,
      skip_duplicate_of = ?
    WHERE id = ?`,
    [
      newPriority,
      input.reason,
      input.justification,
      now,
      input.duplicateOf ?? null,
      id,
    ]
  );

  return { success: true };
}

/**
 * Reset a feature to pending state
 */
export function resetFeature(id: string): void {
  const db = getDb();

  db.run(
    `UPDATE features SET status = 'pending', phase = 'specify', started_at = NULL, completed_at = NULL WHERE id = ?`,
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
// Lifecycle Extension: Harden Results
// =============================================================================

export function getHardenResults(featureId: string): HardenResult[] {
  const db = getDb();
  const rows = db.query<{ id: number; feature_id: string; test_name: string; status: string; evidence: string | null; ingested_at: string }, [string]>(
    `SELECT * FROM harden_results WHERE feature_id = ? ORDER BY id ASC`
  ).all(featureId);

  return rows.map((r) => ({
    id: r.id,
    featureId: r.feature_id,
    testName: r.test_name,
    status: r.status as HardenResult["status"],
    evidence: r.evidence,
    ingestedAt: new Date(r.ingested_at),
  }));
}

export function upsertHardenResult(featureId: string, testName: string, status: string, evidence: string | null): void {
  const db = getDb();
  const existing = db.query<{ id: number }, [string, string]>(
    `SELECT id FROM harden_results WHERE feature_id = ? AND test_name = ?`
  ).get(featureId, testName);

  if (existing) {
    db.run(
      `UPDATE harden_results SET status = ?, evidence = ?, ingested_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, evidence, existing.id]
    );
  } else {
    db.run(
      `INSERT INTO harden_results (feature_id, test_name, status, evidence) VALUES (?, ?, ?, ?)`,
      [featureId, testName, status, evidence]
    );
  }
}

export function clearHardenResults(featureId: string): void {
  const db = getDb();
  db.run(`DELETE FROM harden_results WHERE feature_id = ?`, [featureId]);
}

// =============================================================================
// Lifecycle Extension: Review Records
// =============================================================================

export function getLatestReviewRecord(featureId: string): ReviewRecord | null {
  const db = getDb();
  const row = db.query<{ id: number; feature_id: string; reviewed_at: string; passed: number; checks_json: string | null; acceptance_json: string | null }, [string]>(
    `SELECT * FROM review_records WHERE feature_id = ? ORDER BY id DESC LIMIT 1`
  ).get(featureId);

  if (!row) return null;

  return {
    id: row.id,
    featureId: row.feature_id,
    reviewedAt: new Date(row.reviewed_at),
    passed: row.passed === 1,
    checksJson: row.checks_json,
    acceptanceJson: row.acceptance_json,
  };
}

export function insertReviewRecord(featureId: string, passed: boolean, checksJson: string, acceptanceJson: string | null): void {
  const db = getDb();
  db.run(
    `INSERT INTO review_records (feature_id, passed, checks_json, acceptance_json) VALUES (?, ?, ?, ?)`,
    [featureId, passed ? 1 : 0, checksJson, acceptanceJson]
  );
}

// =============================================================================
// Lifecycle Extension: Approval Gates
// =============================================================================

export function getApprovalGate(featureId: string): ApprovalGate | null {
  const db = getDb();
  const row = db.query<{ id: number; feature_id: string; status: string; triggered_at: string; resolved_at: string | null; rejection_reason: string | null }, [string]>(
    `SELECT * FROM approval_gates WHERE feature_id = ? ORDER BY id DESC LIMIT 1`
  ).get(featureId);

  if (!row) return null;

  return {
    id: row.id,
    featureId: row.feature_id,
    status: row.status as ApprovalStatus,
    triggeredAt: new Date(row.triggered_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    rejectionReason: row.rejection_reason,
  };
}

export function getPendingApprovals(): ApprovalGate[] {
  const db = getDb();
  const rows = db.query<{ id: number; feature_id: string; status: string; triggered_at: string; resolved_at: string | null; rejection_reason: string | null }, []>(
    `SELECT * FROM approval_gates WHERE status = 'pending' ORDER BY triggered_at ASC`
  ).all();

  return rows.map((r) => ({
    id: r.id,
    featureId: r.feature_id,
    status: r.status as ApprovalStatus,
    triggeredAt: new Date(r.triggered_at),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    rejectionReason: r.rejection_reason,
  }));
}

export function insertApprovalGate(featureId: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO approval_gates (feature_id, status) VALUES (?, 'pending')`,
    [featureId]
  );
}

export function resolveApprovalGate(featureId: string, status: "approved" | "rejected", reason?: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `UPDATE approval_gates SET status = ?, resolved_at = ?, rejection_reason = ? WHERE feature_id = ? AND status = 'pending'`,
    [status, now, reason ?? null, featureId]
  );
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
  // Skip audit trail
  skip_reason: string | null;
  skip_justification: string | null;
  skip_validated_at: string | null;
  skip_duplicate_of: string | null;
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
    // Skip audit trail
    skipReason: row.skip_reason as SkipReason | undefined,
    skipJustification: row.skip_justification ?? undefined,
    skipValidatedAt: row.skip_validated_at ? new Date(row.skip_validated_at) : undefined,
    skipDuplicateOf: row.skip_duplicate_of ?? undefined,
  };
}
