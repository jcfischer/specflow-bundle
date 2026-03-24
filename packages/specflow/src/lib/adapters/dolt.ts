/**
 * Dolt Database Adapter
 * MySQL-compatible adapter with git-like version control
 */

import mysql from "mysql2/promise";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import type {
  DatabaseAdapter,
  DbConfig,
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

const exec = promisify(execCallback);

// =============================================================================
// DoltAdapter Implementation
// =============================================================================

export class DoltAdapter implements DatabaseAdapter {
  private connection: mysql.Connection | null = null;
  private config: DbConfig | null = null;

  // ============================================
  // Connection Lifecycle
  // ============================================

  async connect(config: DbConfig): Promise<void> {
    if (!config.dolt) {
      throw new Error("Dolt configuration is required");
    }

    this.config = config;

    // Check Dolt CLI is installed
    try {
      await exec("which dolt");
    } catch (error) {
      throw new Error(
        "Dolt CLI not found. Install from: https://docs.dolthub.com/introduction/installation"
      );
    }

    // Create MySQL connection
    this.connection = await mysql.createConnection({
      host: config.dolt.host || "localhost",
      port: config.dolt.port || 3306,
      user: config.dolt.user || "root",
      password: config.dolt.password || "",
      database: config.dolt.database,
    });

    // Test connection
    await this.connection.ping();

    // Initialize schema
    await this.initializeSchema();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  private getConnection(): mysql.Connection {
    if (!this.connection) {
      throw new Error("Database not initialized. Call connect() first.");
    }
    return this.connection;
  }

  private async initializeSchema(): Promise<void> {
    const conn = this.getConnection();

    // Create features table (MySQL DDL)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS features (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        priority INT NOT NULL DEFAULT 999,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        phase VARCHAR(50) NOT NULL DEFAULT 'none',
        spec_path VARCHAR(500),
        created_at DATETIME NOT NULL,
        started_at DATETIME,
        completed_at DATETIME,
        migrated_from VARCHAR(255),
        quick_start TINYINT DEFAULT 0,
        problem_type VARCHAR(100),
        urgency VARCHAR(100),
        primary_user VARCHAR(100),
        integration_scope VARCHAR(100),
        usage_context VARCHAR(100),
        data_requirements VARCHAR(100),
        performance_requirements VARCHAR(100),
        priority_tradeoff VARCHAR(100),
        uncertainties TEXT,
        clarification_needed TEXT,
        skip_reason VARCHAR(100),
        skip_justification TEXT,
        skip_validated_at DATETIME,
        skip_duplicate_of VARCHAR(255),
        INDEX idx_features_status (status),
        INDEX idx_features_priority (priority)
      )
    `);

    // Create harden_results table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS harden_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        feature_id VARCHAR(255) NOT NULL,
        test_name VARCHAR(500) NOT NULL,
        status VARCHAR(50) NOT NULL,
        evidence TEXT,
        ingested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feature_id) REFERENCES features(id)
      )
    `);

    // Create review_records table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS review_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        feature_id VARCHAR(255) NOT NULL,
        reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        passed TINYINT NOT NULL,
        checks_json TEXT,
        acceptance_json TEXT,
        FOREIGN KEY (feature_id) REFERENCES features(id)
      )
    `);

    // Create approval_gates table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS approval_gates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        feature_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        rejection_reason TEXT,
        FOREIGN KEY (feature_id) REFERENCES features(id)
      )
    `);
  }

  // ============================================
  // Feature CRUD Operations
  // ============================================

  async createFeature(feature: NewFeature): Promise<void> {
    const conn = this.getConnection();
    const now = new Date();

    const uncertaintiesJson = feature.uncertainties
      ? JSON.stringify(feature.uncertainties)
      : null;

    await conn.execute(
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
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM features WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.rowToFeature(rows[0]);
  }

  async updateFeature(id: string, updates: Partial<Feature>): Promise<void> {
    const conn = this.getConnection();

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
    await conn.execute(
      `UPDATE features SET ${setClauses.join(", ")} WHERE id = ?`,
      values
    );
  }

  async listFeatures(filters?: FeatureFilters): Promise<Feature[]> {
    const conn = this.getConnection();

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

    const [rows] = await conn.execute<any[]>(query, params);
    return rows.map((row) => this.rowToFeature(row));
  }

  async deleteFeature(id: string): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`DELETE FROM features WHERE id = ?`, [id]);
  }

  async updateFeatureStatus(id: string, status: FeatureStatus): Promise<void> {
    const conn = this.getConnection();
    const now = new Date();

    let startedAt: Date | null = null;
    let completedAt: Date | null = null;

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
      await conn.execute(
        `UPDATE features SET status = ?, started_at = ?, completed_at = ? WHERE id = ?`,
        [status, startedAt, completedAt, id]
      );
    } else if (startedAt) {
      await conn.execute(
        `UPDATE features SET status = ?, started_at = ? WHERE id = ?`,
        [status, startedAt, id]
      );
    } else if (completedAt) {
      await conn.execute(
        `UPDATE features SET status = ?, completed_at = ? WHERE id = ?`,
        [status, completedAt, id]
      );
    } else {
      await conn.execute(`UPDATE features SET status = ? WHERE id = ?`, [status, id]);
    }
  }

  async updateFeaturePhase(id: string, phase: SpecPhase): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`UPDATE features SET phase = ? WHERE id = ?`, [phase, id]);
  }

  async updateFeatureSpecPath(id: string, specPath: string): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`UPDATE features SET spec_path = ? WHERE id = ?`, [specPath, id]);
  }

  async updateFeaturePriority(id: string, priority: number): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`UPDATE features SET priority = ? WHERE id = ?`, [priority, id]);
  }

  async updateFeatureName(id: string, name: string): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`UPDATE features SET name = ? WHERE id = ?`, [name, id]);
  }

  async updateFeatureDescription(id: string, description: string): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`UPDATE features SET description = ? WHERE id = ?`, [description, id]);
  }

  async updateFeatureQuickStart(id: string, quickStart: boolean): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`UPDATE features SET quick_start = ? WHERE id = ?`, [quickStart ? 1 : 0, id]);
  }

  async updateFeatureDecomposition(id: string, updates: DecompositionUpdate): Promise<void> {
    const conn = this.getConnection();

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
    await conn.execute(
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
    const conn = this.getConnection();
    const now = new Date();

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

    const [rows] = await conn.execute<any[]>(
      `SELECT COALESCE(MAX(priority), 0) as max_priority FROM features`
    );

    const newPriority = (rows[0]?.max_priority ?? 0) + 1;

    await conn.execute(
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
    const conn = this.getConnection();
    await conn.execute(
      `UPDATE features SET status = 'pending', phase = 'specify', started_at = NULL, completed_at = NULL WHERE id = ?`,
      [id]
    );
  }

  async clearAllFeatures(): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`DELETE FROM features`);
  }

  async getNextFeature(): Promise<Feature | null> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM features
       WHERE status = 'pending'
       ORDER BY priority ASC, id ASC
       LIMIT 1`
    );

    return rows.length > 0 ? this.rowToFeature(rows[0]) : null;
  }

  async getNextReadyFeature(): Promise<Feature | null> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM features
       WHERE status = 'pending'
         AND (phase = 'tasks' OR phase = 'implement')
       ORDER BY priority ASC, id ASC
       LIMIT 1`
    );

    return rows.length > 0 ? this.rowToFeature(rows[0]) : null;
  }

  async getNextFeatureNeedingPhases(): Promise<Feature | null> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM features
       WHERE status = 'pending'
         AND phase != 'tasks'
         AND phase != 'implement'
       ORDER BY priority ASC, id ASC
       LIMIT 1`
    );

    return rows.length > 0 ? this.rowToFeature(rows[0]) : null;
  }

  // ============================================
  // Stats and Queries
  // ============================================

  async getStats(): Promise<FeatureStats> {
    const conn = this.getConnection();

    const [rows] = await conn.execute<any[]>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as complete,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM features
    `);

    const row = rows[0];
    const total = row?.total ?? 0;
    const complete = row?.complete ?? 0;

    return {
      total,
      pending: row?.pending ?? 0,
      inProgress: row?.in_progress ?? 0,
      complete,
      skipped: row?.skipped ?? 0,
      percentComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
    };
  }

  // ============================================
  // Extended Lifecycle Operations
  // ============================================

  async getHardenResults(featureId: string): Promise<HardenResult[]> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
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
    const conn = this.getConnection();
    const [existing] = await conn.execute<any[]>(
      `SELECT id FROM harden_results WHERE feature_id = ? AND test_name = ?`,
      [featureId, testName]
    );

    if (existing.length > 0) {
      await conn.execute(
        `UPDATE harden_results SET status = ?, evidence = ?, ingested_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, evidence, existing[0].id]
      );
    } else {
      await conn.execute(
        `INSERT INTO harden_results (feature_id, test_name, status, evidence) VALUES (?, ?, ?, ?)`,
        [featureId, testName, status, evidence]
      );
    }
  }

  async clearHardenResults(featureId: string): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(`DELETE FROM harden_results WHERE feature_id = ?`, [featureId]);
  }

  async getLatestReviewRecord(featureId: string): Promise<ReviewRecord | null> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM review_records WHERE feature_id = ? ORDER BY id DESC LIMIT 1`,
      [featureId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
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
    const conn = this.getConnection();
    await conn.execute(
      `INSERT INTO review_records (feature_id, passed, checks_json, acceptance_json) VALUES (?, ?, ?, ?)`,
      [featureId, passed ? 1 : 0, checksJson, acceptanceJson]
    );
  }

  async getApprovalGate(featureId: string): Promise<ApprovalGate | null> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM approval_gates WHERE feature_id = ? ORDER BY id DESC LIMIT 1`,
      [featureId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
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
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(
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
    const conn = this.getConnection();
    await conn.execute(
      `INSERT INTO approval_gates (feature_id, status) VALUES (?, 'pending')`,
      [featureId]
    );
  }

  async resolveApprovalGate(
    featureId: string,
    status: "approved" | "rejected",
    reason?: string
  ): Promise<void> {
    const conn = this.getConnection();
    const now = new Date();
    await conn.execute(
      `UPDATE approval_gates SET status = ?, resolved_at = ?, rejection_reason = ? WHERE feature_id = ? AND status = 'pending'`,
      [status, now, reason ?? null, featureId]
    );
  }

  // ============================================
  // Version Control Operations
  // ============================================

  async init(): Promise<void> {
    const doltConfig = this.config?.dolt;
    if (!doltConfig?.remote) {
      throw new Error("Remote URL is required for init");
    }

    try {
      await exec(`dolt init`);
      await exec(`dolt remote add origin ${doltConfig.remote}`);
    } catch (error) {
      throw new Error(`Failed to initialize Dolt: ${(error as Error).message}`);
    }
  }

  async status(): Promise<VCStatus> {
    try {
      const { stdout } = await exec(`dolt status --json`);
      const status = JSON.parse(stdout);

      return {
        clean: status.is_clean ?? true,
        uncommittedChanges: status.tables_changed || [],
        branch: status.current_branch,
        remote: status.remote,
        ahead: status.ahead ?? 0,
        behind: status.behind ?? 0,
      };
    } catch (error) {
      throw new Error(`Failed to get Dolt status: ${(error as Error).message}`);
    }
  }

  async commit(message: string): Promise<void> {
    try {
      await exec(`dolt add .`);
      await exec(`dolt commit -m "${message.replace(/"/g, '\\"')}"`);
    } catch (error) {
      throw new Error(`Failed to commit: ${(error as Error).message}`);
    }
  }

  async push(remote: string = "origin"): Promise<void> {
    try {
      await exec(`dolt push ${remote}`);
    } catch (error) {
      throw new Error(`Failed to push: ${(error as Error).message}`);
    }
  }

  async pull(remote: string = "origin"): Promise<void> {
    try {
      await exec(`dolt pull ${remote}`);
    } catch (error) {
      throw new Error(`Failed to pull: ${(error as Error).message}`);
    }
  }

  async log(limit: number = 10): Promise<string[]> {
    try {
      const { stdout } = await exec(`dolt log --oneline -n ${limit}`);
      return stdout.trim().split("\n").filter((line) => line.length > 0);
    } catch (error) {
      throw new Error(`Failed to get log: ${(error as Error).message}`);
    }
  }

  async diff(commit?: string): Promise<string> {
    try {
      const cmd = commit ? `dolt diff ${commit}` : `dolt diff`;
      const { stdout } = await exec(cmd);
      return stdout;
    } catch (error) {
      throw new Error(`Failed to get diff: ${(error as Error).message}`);
    }
  }

  // ============================================
  // Internal Helpers
  // ============================================

  private rowToFeature(row: any): Feature {
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
