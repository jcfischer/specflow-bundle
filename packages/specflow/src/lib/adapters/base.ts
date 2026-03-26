/**
 * Base Database Adapter
 * Shared business logic for all database adapters
 */

import type {
  DatabaseAdapter,
  NewFeature,
  FeatureFilters,
  DecompositionUpdate,
  VCStatus,
} from "./types";
import type {
  Feature,
  FeatureStatus,
  FeatureStats,
  SpecPhase,
  SkipReason,
  HardenResult,
  ReviewRecord,
  ApprovalGate,
  ProblemType,
  UrgencyType,
  PrimaryUserType,
  IntegrationScopeType,
  UsageContextType,
  DataRequirementsType,
  PerformanceRequirementsType,
  PriorityTradeoffType,
} from "../../types";

// =============================================================================
// Query Result Types (internal)
// =============================================================================

interface FeatureRow {
  id: string;
  name: string;
  description: string;
  priority: number;
  status: string;
  phase: string;
  spec_path: string | null;
  created_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  migrated_from: string | null;
  quick_start: number | null;
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
  skip_reason: string | null;
  skip_justification: string | null;
  skip_validated_at: string | Date | null;
  skip_duplicate_of: string | null;
}

interface StatsRow {
  total: number;
  pending: number;
  in_progress: number;
  complete: number;
  skipped: number;
}

interface HardenResultRow {
  id: number;
  feature_id: string;
  test_name: string;
  status: string;
  evidence: string | null;
  ingested_at: string | Date;
}

interface ReviewRecordRow {
  id: number;
  feature_id: string;
  reviewed_at: string | Date;
  passed: number;
  checks_json: string | null;
  acceptance_json: string | null;
}

interface ApprovalGateRow {
  id: number;
  feature_id: string;
  status: string;
  triggered_at: string | Date;
  resolved_at: string | Date | null;
  rejection_reason: string | null;
}

// =============================================================================
// BaseAdapter Abstract Class
// =============================================================================

export abstract class BaseAdapter implements DatabaseAdapter {
  // ============================================
  // Abstract Database Primitives
  // ============================================
  // Subclasses must implement these database-specific methods

  /**
   * Execute a query that doesn't return results (INSERT, UPDATE, DELETE)
   */
  protected abstract execute(query: string, values?: any[]): Promise<void>;

  /**
   * Query for a single row
   * @returns Row object or null if not found
   */
  protected abstract queryOne<T>(query: string, values?: any[]): Promise<T | null>;

  /**
   * Query for multiple rows
   * @returns Array of row objects
   */
  protected abstract queryMany<T>(query: string, values?: any[]): Promise<T[]>;

  /**
   * Get current timestamp in adapter-specific format
   */
  protected abstract now(): Date | string;

  // ============================================
  // Connection Lifecycle (must implement)
  // ============================================

  abstract connect(config: any): Promise<void>;
  abstract disconnect(): Promise<void>;

  // ============================================
  // Feature CRUD Operations
  // ============================================

  async createFeature(feature: NewFeature): Promise<void> {
    const now = this.now();
    const uncertaintiesJson = feature.uncertainties
      ? JSON.stringify(feature.uncertainties)
      : null;

    await this.execute(
      `INSERT INTO features (
        id, name, description, priority, spec_path, created_at, migrated_from,
        problem_type, urgency, primary_user, integration_scope,
        usage_context, data_requirements, performance_requirements, priority_tradeoff,
        uncertainties, clarification_needed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feature.id,
        feature.name,
        feature.description,
        feature.priority,
        feature.specPath ?? null,
        now,
        feature.migratedFrom ?? null,
        feature.problemType ?? null,
        feature.urgency ?? null,
        feature.primaryUser ?? null,
        feature.integrationScope ?? null,
        feature.usageContext ?? null,
        feature.dataRequirements ?? null,
        feature.performanceRequirements ?? null,
        feature.priorityTradeoff ?? null,
        uncertaintiesJson,
        feature.clarificationNeeded ?? null,
      ]
    );
  }

  async getFeature(id: string): Promise<Feature | null> {
    const row = await this.queryOne<FeatureRow>(
      `SELECT * FROM features WHERE id = ?`,
      [id]
    );

    return row ? this.rowToFeature(row) : null;
  }

  async updateFeature(id: string, updates: Partial<Feature>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      values.push(updates.description);
    }
    if (updates.priority !== undefined) {
      setClauses.push("priority = ?");
      values.push(updates.priority);
    }
    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.phase !== undefined) {
      setClauses.push("phase = ?");
      values.push(updates.phase);
    }
    if (updates.specPath !== undefined) {
      setClauses.push("spec_path = ?");
      values.push(updates.specPath);
    }

    if (setClauses.length === 0) {
      return;
    }

    values.push(id);
    await this.execute(
      `UPDATE features SET ${setClauses.join(", ")} WHERE id = ?`,
      values
    );
  }

  async listFeatures(filters?: FeatureFilters): Promise<Feature[]> {
    let query = `SELECT * FROM features WHERE 1=1`;
    const params: any[] = [];

    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.phase) {
      query += ` AND phase = ?`;
      params.push(filters.phase);
    }
    if (filters?.priority !== undefined) {
      query += ` AND priority = ?`;
      params.push(filters.priority);
    }

    query += ` ORDER BY priority ASC, id ASC`;

    if (filters?.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }
    if (filters?.offset) {
      query += ` OFFSET ?`;
      params.push(filters.offset);
    }

    const rows = await this.queryMany<FeatureRow>(query, params);
    return rows.map((row) => this.rowToFeature(row));
  }

  async deleteFeature(id: string): Promise<void> {
    await this.execute(`DELETE FROM features WHERE id = ?`, [id]);
  }

  async updateFeatureStatus(id: string, status: FeatureStatus): Promise<void> {
    const now = this.now();

    let startedAt: Date | string | null = null;
    let completedAt: Date | string | null = null;

    if (status === "in_progress") {
      startedAt = now;
    } else if (status === "complete") {
      completedAt = now;
      const feature = await this.getFeature(id);
      if (feature && !feature.startedAt) {
        startedAt = now;
      }
    }

    if (startedAt && completedAt) {
      await this.execute(
        `UPDATE features SET status = ?, started_at = ?, completed_at = ? WHERE id = ?`,
        [status, startedAt, completedAt, id]
      );
    } else if (startedAt) {
      await this.execute(
        `UPDATE features SET status = ?, started_at = ? WHERE id = ?`,
        [status, startedAt, id]
      );
    } else if (completedAt) {
      await this.execute(
        `UPDATE features SET status = ?, completed_at = ? WHERE id = ?`,
        [status, completedAt, id]
      );
    } else {
      await this.execute(`UPDATE features SET status = ? WHERE id = ?`, [status, id]);
    }
  }

  async updateFeaturePhase(id: string, phase: SpecPhase): Promise<void> {
    await this.execute(`UPDATE features SET phase = ? WHERE id = ?`, [phase, id]);
  }

  async updateFeatureSpecPath(id: string, specPath: string): Promise<void> {
    await this.execute(`UPDATE features SET spec_path = ? WHERE id = ?`, [specPath, id]);
  }

  async updateFeaturePriority(id: string, priority: number): Promise<void> {
    await this.execute(`UPDATE features SET priority = ? WHERE id = ?`, [priority, id]);
  }

  async updateFeatureName(id: string, name: string): Promise<void> {
    await this.execute(`UPDATE features SET name = ? WHERE id = ?`, [name, id]);
  }

  async updateFeatureDescription(id: string, description: string): Promise<void> {
    await this.execute(`UPDATE features SET description = ? WHERE id = ?`, [description, id]);
  }

  async updateFeatureQuickStart(id: string, quickStart: boolean): Promise<void> {
    await this.execute(`UPDATE features SET quick_start = ? WHERE id = ?`, [quickStart ? 1 : 0, id]);
  }

  async updateFeatureDecomposition(id: string, updates: DecompositionUpdate): Promise<void> {
    const setClauses: string[] = [];
    const values: (string | null)[] = [];

    if (updates.problemType !== undefined) {
      setClauses.push("problem_type = ?");
      values.push(updates.problemType);
    }
    if (updates.urgency !== undefined) {
      setClauses.push("urgency = ?");
      values.push(updates.urgency);
    }
    if (updates.primaryUser !== undefined) {
      setClauses.push("primary_user = ?");
      values.push(updates.primaryUser);
    }
    if (updates.integrationScope !== undefined) {
      setClauses.push("integration_scope = ?");
      values.push(updates.integrationScope);
    }
    if (updates.usageContext !== undefined) {
      setClauses.push("usage_context = ?");
      values.push(updates.usageContext);
    }
    if (updates.dataRequirements !== undefined) {
      setClauses.push("data_requirements = ?");
      values.push(updates.dataRequirements);
    }
    if (updates.performanceRequirements !== undefined) {
      setClauses.push("performance_requirements = ?");
      values.push(updates.performanceRequirements);
    }
    if (updates.priorityTradeoff !== undefined) {
      setClauses.push("priority_tradeoff = ?");
      values.push(updates.priorityTradeoff);
    }
    if (updates.uncertainties !== undefined) {
      setClauses.push("uncertainties = ?");
      values.push(JSON.stringify(updates.uncertainties));
    }
    if (updates.clarificationNeeded !== undefined) {
      setClauses.push("clarification_needed = ?");
      values.push(updates.clarificationNeeded);
    }

    if (setClauses.length === 0) {
      return;
    }

    values.push(id);
    await this.execute(
      `UPDATE features SET ${setClauses.join(", ")} WHERE id = ?`,
      values
    );
  }

  async skipFeatureWithValidation(
    id: string,
    reason: SkipReason,
    justification: string,
    duplicateOf?: string
  ): Promise<{ success: boolean; error?: string }> {
    const now = this.now();

    if (reason === "duplicate") {
      if (!duplicateOf) {
        return {
          success: false,
          error: "When skip reason is 'duplicate', you must specify which feature it duplicates",
        };
      }

      const duplicateFeature = await this.getFeature(duplicateOf);
      if (!duplicateFeature) {
        return {
          success: false,
          error: `Duplicate feature '${duplicateOf}' not found`,
        };
      }

      if (
        duplicateFeature.status !== "complete" &&
        duplicateFeature.status !== "in_progress"
      ) {
        return {
          success: false,
          error: `Cannot skip as duplicate of '${duplicateOf}' - that feature is not complete or in progress`,
        };
      }
    }

    const row = await this.queryOne<{ max_priority: number }>(
      `SELECT COALESCE(MAX(priority), 0) as max_priority FROM features`
    );

    const newPriority = (row?.max_priority ?? 0) + 1;

    await this.execute(
      `UPDATE features SET
        status = 'skipped',
        priority = ?,
        skip_reason = ?,
        skip_justification = ?,
        skip_validated_at = ?,
        skip_duplicate_of = ?
      WHERE id = ?`,
      [newPriority, reason, justification, now, duplicateOf ?? null, id]
    );

    return { success: true };
  }

  async resetFeature(id: string): Promise<void> {
    await this.execute(
      `UPDATE features SET status = 'pending', phase = 'specify', started_at = NULL, completed_at = NULL WHERE id = ?`,
      [id]
    );
  }

  async clearAllFeatures(): Promise<void> {
    await this.execute(`DELETE FROM features`);
  }

  async getNextFeature(): Promise<Feature | null> {
    const row = await this.queryOne<FeatureRow>(
      `SELECT * FROM features
       WHERE status = 'pending'
       ORDER BY priority ASC, id ASC
       LIMIT 1`
    );

    return row ? this.rowToFeature(row) : null;
  }

  async getNextReadyFeature(): Promise<Feature | null> {
    const row = await this.queryOne<FeatureRow>(
      `SELECT * FROM features
       WHERE status = 'pending'
         AND (phase = 'tasks' OR phase = 'implement')
       ORDER BY priority ASC, id ASC
       LIMIT 1`
    );

    return row ? this.rowToFeature(row) : null;
  }

  async getNextFeatureNeedingPhases(): Promise<Feature | null> {
    const row = await this.queryOne<FeatureRow>(
      `SELECT * FROM features
       WHERE status = 'pending'
         AND phase != 'tasks'
         AND phase != 'implement'
       ORDER BY priority ASC, id ASC
       LIMIT 1`
    );

    return row ? this.rowToFeature(row) : null;
  }

  // ============================================
  // Stats and Queries
  // ============================================

  async getStats(): Promise<FeatureStats> {
    const row = await this.queryOne<StatsRow>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as complete,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM features
    `);

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

  // ============================================
  // Extended Lifecycle Operations
  // ============================================

  async getHardenResults(featureId: string): Promise<HardenResult[]> {
    const rows = await this.queryMany<HardenResultRow>(
      `SELECT * FROM harden_results WHERE feature_id = ? ORDER BY id ASC`,
      [featureId]
    );

    return rows.map((r) => ({
      id: r.id,
      featureId: r.feature_id,
      testName: r.test_name,
      status: r.status as HardenResult["status"],
      evidence: r.evidence,
      ingestedAt: new Date(r.ingested_at),
    }));
  }

  async upsertHardenResult(
    featureId: string,
    testName: string,
    status: string,
    evidence: string | null
  ): Promise<void> {
    const existing = await this.queryOne<{ id: number }>(
      `SELECT id FROM harden_results WHERE feature_id = ? AND test_name = ?`,
      [featureId, testName]
    );

    if (existing) {
      await this.execute(
        `UPDATE harden_results SET status = ?, evidence = ?, ingested_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, evidence, existing.id]
      );
    } else {
      await this.execute(
        `INSERT INTO harden_results (feature_id, test_name, status, evidence) VALUES (?, ?, ?, ?)`,
        [featureId, testName, status, evidence]
      );
    }
  }

  async clearHardenResults(featureId: string): Promise<void> {
    await this.execute(`DELETE FROM harden_results WHERE feature_id = ?`, [featureId]);
  }

  async getLatestReviewRecord(featureId: string): Promise<ReviewRecord | null> {
    const row = await this.queryOne<ReviewRecordRow>(
      `SELECT * FROM review_records WHERE feature_id = ? ORDER BY id DESC LIMIT 1`,
      [featureId]
    );

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

  async insertReviewRecord(
    featureId: string,
    passed: boolean,
    checksJson: string,
    acceptanceJson: string | null
  ): Promise<void> {
    await this.execute(
      `INSERT INTO review_records (feature_id, passed, checks_json, acceptance_json) VALUES (?, ?, ?, ?)`,
      [featureId, passed ? 1 : 0, checksJson, acceptanceJson]
    );
  }

  async getApprovalGate(featureId: string): Promise<ApprovalGate | null> {
    const row = await this.queryOne<ApprovalGateRow>(
      `SELECT * FROM approval_gates WHERE feature_id = ? ORDER BY id DESC LIMIT 1`,
      [featureId]
    );

    if (!row) return null;

    return {
      id: row.id,
      featureId: row.feature_id,
      status: row.status as ApprovalGate["status"],
      triggeredAt: new Date(row.triggered_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
      rejectionReason: row.rejection_reason,
    };
  }

  async getPendingApprovals(): Promise<ApprovalGate[]> {
    const rows = await this.queryMany<ApprovalGateRow>(
      `SELECT * FROM approval_gates WHERE status = 'pending' ORDER BY triggered_at ASC`
    );

    return rows.map((r) => ({
      id: r.id,
      featureId: r.feature_id,
      status: r.status as ApprovalGate["status"],
      triggeredAt: new Date(r.triggered_at),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
      rejectionReason: r.rejection_reason,
    }));
  }

  async insertApprovalGate(featureId: string): Promise<void> {
    await this.execute(
      `INSERT INTO approval_gates (feature_id, status) VALUES (?, 'pending')`,
      [featureId]
    );
  }

  async resolveApprovalGate(
    featureId: string,
    status: "approved" | "rejected",
    reason?: string
  ): Promise<void> {
    const now = this.now();
    await this.execute(
      `UPDATE approval_gates SET status = ?, resolved_at = ?, rejection_reason = ? WHERE feature_id = ? AND status = 'pending'`,
      [status, now, reason ?? null, featureId]
    );
  }

  // ============================================
  // Version Control Operations (Default no-ops)
  // ============================================

  async init(): Promise<void> {
    // No-op for non-versioned backends
  }

  async status(): Promise<VCStatus> {
    return { clean: true };
  }

  async commit(message: string): Promise<void> {
    // No-op for non-versioned backends
  }

  async push(remote: string): Promise<void> {
    // No-op for non-versioned backends
  }

  async pull(remote: string): Promise<void> {
    // No-op for non-versioned backends
  }

  async log(limit?: number): Promise<string[]> {
    return [];
  }

  async diff(commit?: string): Promise<string> {
    return "";
  }

  // ============================================
  // Internal Helpers
  // ============================================

  /**
   * Transform database row to Feature object
   * Shared logic for date parsing and type conversions
   */
  protected rowToFeature(row: FeatureRow): Feature {
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
      skipReason: row.skip_reason as SkipReason | undefined,
      skipJustification: row.skip_justification ?? undefined,
      skipValidatedAt: row.skip_validated_at ? new Date(row.skip_validated_at) : undefined,
      skipDuplicateOf: row.skip_duplicate_of ?? undefined,
    };
  }
}
