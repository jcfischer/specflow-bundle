/**
 * Contrib Prep State Module
 * SQLite state tracking for the contribution preparation workflow
 */

import { Database } from "bun:sqlite";

// =============================================================================
// Types
// =============================================================================

export interface ContribPrepState {
  featureId: string;
  gate: number;
  inventoryIncluded: number;
  inventoryExcluded: number;
  sanitizationPass: boolean | null;
  sanitizationFindings: number;
  tagName: string | null;
  tagHash: string | null;
  contribBranch: string | null;
  verificationPass: boolean | null;
  baseBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ContribPrepRow {
  feature_id: string;
  gate: number;
  inventory_included: number;
  inventory_excluded: number;
  sanitization_pass: number | null;
  sanitization_findings: number;
  tag_name: string | null;
  tag_hash: string | null;
  contrib_branch: string | null;
  verification_pass: number | null;
  base_branch: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Internal DB Access
// =============================================================================

/**
 * Get the database instance from the module-level singleton.
 */
function getDb(): Database {
  const { getDbInstance } = require("../database") as {
    getDbInstance: () => Database;
  };
  return getDbInstance();
}

// =============================================================================
// Row Mapping
// =============================================================================

function rowToState(row: ContribPrepRow): ContribPrepState {
  return {
    featureId: row.feature_id,
    gate: row.gate,
    inventoryIncluded: row.inventory_included,
    inventoryExcluded: row.inventory_excluded,
    sanitizationPass:
      row.sanitization_pass === null ? null : row.sanitization_pass === 1,
    sanitizationFindings: row.sanitization_findings,
    tagName: row.tag_name,
    tagHash: row.tag_hash,
    contribBranch: row.contrib_branch,
    verificationPass:
      row.verification_pass === null ? null : row.verification_pass === 1,
    baseBranch: row.base_branch,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get contrib prep state for a feature
 */
export function getContribState(featureId: string): ContribPrepState | null {
  const db = getDb();
  const row = db
    .query<ContribPrepRow, [string]>(
      `SELECT * FROM contrib_prep_state WHERE feature_id = ?`
    )
    .get(featureId);

  return row ? rowToState(row) : null;
}

/**
 * Create initial contrib prep state for a feature
 */
export function createContribState(
  featureId: string,
  baseBranch: string = "main"
): ContribPrepState {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO contrib_prep_state (feature_id, base_branch, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [featureId, baseBranch, now, now]
  );

  return getContribState(featureId)!;
}

/**
 * Update the current gate (can only advance forward)
 */
export function updateContribGate(
  featureId: string,
  gate: number
): { success: boolean; error?: string } {
  const state = getContribState(featureId);
  if (!state) {
    return { success: false, error: `No contrib state for feature '${featureId}'` };
  }

  if (gate <= state.gate) {
    return {
      success: false,
      error: `Cannot move gate backward (current: ${state.gate}, requested: ${gate})`,
    };
  }

  if (gate > 5) {
    return { success: false, error: `Gate cannot exceed 5 (requested: ${gate})` };
  }

  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `UPDATE contrib_prep_state SET gate = ?, updated_at = ? WHERE feature_id = ?`,
    [gate, now, featureId]
  );

  return { success: true };
}

/**
 * Update inventory counts
 */
export function updateContribInventory(
  featureId: string,
  included: number,
  excluded: number
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `UPDATE contrib_prep_state
     SET inventory_included = ?, inventory_excluded = ?, updated_at = ?
     WHERE feature_id = ?`,
    [included, excluded, now, featureId]
  );
}

/**
 * Update sanitization results
 */
export function updateContribSanitization(
  featureId: string,
  pass: boolean,
  findings: number
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `UPDATE contrib_prep_state
     SET sanitization_pass = ?, sanitization_findings = ?, updated_at = ?
     WHERE feature_id = ?`,
    [pass ? 1 : 0, findings, now, featureId]
  );
}

/**
 * Update tag information after tag creation
 */
export function updateContribTag(
  featureId: string,
  tagName: string,
  tagHash: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `UPDATE contrib_prep_state
     SET tag_name = ?, tag_hash = ?, updated_at = ?
     WHERE feature_id = ?`,
    [tagName, tagHash, now, featureId]
  );
}

/**
 * Update contrib branch name after branch creation
 */
export function updateContribBranch(
  featureId: string,
  branchName: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `UPDATE contrib_prep_state
     SET contrib_branch = ?, updated_at = ?
     WHERE feature_id = ?`,
    [branchName, now, featureId]
  );
}

/**
 * Update verification results
 */
export function updateContribVerification(
  featureId: string,
  pass: boolean
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `UPDATE contrib_prep_state
     SET verification_pass = ?, updated_at = ?
     WHERE feature_id = ?`,
    [pass ? 1 : 0, now, featureId]
  );
}

/**
 * Delete contrib prep state (for reset/cleanup)
 */
export function deleteContribState(featureId: string): void {
  const db = getDb();
  db.run(`DELETE FROM contrib_prep_state WHERE feature_id = ?`, [featureId]);
}
