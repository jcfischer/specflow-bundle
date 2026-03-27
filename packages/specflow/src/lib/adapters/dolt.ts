/**
 * Dolt Database Adapter
 * MySQL-compatible adapter with git-like version control
 */

import mysql from "mysql2/promise";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import type { DbConfig, VCStatus } from "./types";
import { BaseAdapter } from "./base";

const exec = promisify(execCallback);

// =============================================================================
// DoltAdapter Implementation
// =============================================================================

export class DoltAdapter extends BaseAdapter {
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

  // ============================================
  // Database Primitives (MySQL/Dolt-specific)
  // ============================================

  protected async execute(query: string, values?: any[]): Promise<void> {
    const conn = this.getConnection();
    await conn.execute(query, values ?? []);
  }

  protected async queryOne<T>(query: string, values?: any[]): Promise<T | null> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(query, values ?? []);
    return rows.length > 0 ? rows[0] : null;
  }

  protected async queryMany<T>(query: string, values?: any[]): Promise<T[]> {
    const conn = this.getConnection();
    const [rows] = await conn.execute<any[]>(query, values ?? []);
    return rows;
  }

  protected now(): Date {
    return new Date();
  }

  // ============================================
  // Schema Initialization
  // ============================================

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
  // Version Control Operations (Dolt-specific)
  // ============================================

  async init(): Promise<void> {
    const doltConfig = this.config?.dolt;
    if (!doltConfig?.remote) {
      throw new Error("Remote URL is required for init");
    }

    // init() must be run from the Dolt repository directory via the CLI.
    // All other VC operations use Dolt SQL stored procedures instead.
    try {
      await exec(`dolt init`);
      await exec(`dolt remote add origin ${doltConfig.remote}`);
    } catch (error) {
      throw new Error(`Failed to initialize Dolt: ${(error as Error).message}`);
    }
  }

  async status(): Promise<VCStatus> {
    // Use Dolt SQL system table instead of `dolt status --json` (no --json flag exists)
    const conn = this.getConnection();
    try {
      const [rows] = await conn.execute<any[]>(`SELECT * FROM dolt_status`);
      const [branchRows] = await conn.execute<any[]>(
        `SELECT active_branch() as branch`
      );

      const uncommittedChanges = rows.map((r: any) => r.table_name as string);

      return {
        clean: rows.length === 0,
        uncommittedChanges,
        branch: branchRows[0]?.branch ?? "main",
        remote: this.config?.dolt?.remote,
        ahead: 0,
        behind: 0,
      };
    } catch (error) {
      throw new Error(`Failed to get Dolt status: ${(error as Error).message}`);
    }
  }

  async commit(message: string): Promise<void> {
    // Use Dolt SQL stored procedures — avoids shell injection and cwd issues
    const conn = this.getConnection();
    try {
      await conn.execute(`CALL dolt_add('.')`);
      await conn.execute(`CALL dolt_commit('-m', ?)`, [message]);
    } catch (error) {
      throw new Error(`Failed to commit: ${(error as Error).message}`);
    }
  }

  async push(remote: string = "origin"): Promise<void> {
    const conn = this.getConnection();
    try {
      await conn.execute(`CALL dolt_push(?)`, [remote]);
    } catch (error) {
      throw new Error(`Failed to push: ${(error as Error).message}`);
    }
  }

  async pull(remote: string = "origin"): Promise<void> {
    const conn = this.getConnection();
    try {
      await conn.execute(`CALL dolt_pull(?)`, [remote]);
    } catch (error) {
      throw new Error(`Failed to pull: ${(error as Error).message}`);
    }
  }

  async log(limit: number = 10): Promise<string[]> {
    const conn = this.getConnection();
    try {
      const [rows] = await conn.execute<any[]>(
        `SELECT commit_hash, message FROM dolt_log LIMIT ?`,
        [limit]
      );
      return rows.map((r: any) => `${r.commit_hash} ${r.message}`);
    } catch (error) {
      throw new Error(`Failed to get log: ${(error as Error).message}`);
    }
  }

  async diff(commit?: string): Promise<string> {
    const conn = this.getConnection();
    try {
      const fromRef = commit ?? "HEAD";
      const [rows] = await conn.execute<any[]>(
        `SELECT * FROM dolt_diff_stat(?, 'WORKING')`,
        [fromRef]
      );
      return rows
        .map(
          (r: any) =>
            `${r.table_name}: +${r.rows_added} -${r.rows_deleted} ~${r.rows_modified}`
        )
        .join("\n");
    } catch (error) {
      throw new Error(`Failed to get diff: ${(error as Error).message}`);
    }
  }

  // ============================================
  // Bulk Operations (for migrations)
  // ============================================

  async bulkInsert(table: string, columns: string[], rows: any[][]): Promise<void> {
    const conn = this.getConnection();

    if (rows.length === 0) {
      return;
    }

    // Build INSERT query with multiple value sets
    const placeholders = columns.map(() => "?").join(", ");
    const valuesSets = rows.map(() => `(${placeholders})`).join(", ");
    const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuesSets}`;

    // Flatten rows array for query parameters
    const values = rows.flat();

    await conn.execute(query, values);
  }

  async getTableRowCount(table: string): Promise<number> {
    const conn = this.getConnection();
    const [rows]: any = await conn.execute(`SELECT COUNT(*) as count FROM ${table}`);
    // mysql2 returns COUNT(*) as BigInt; Number() converts it for safe equality checks
    return Number(rows[0].count);
  }
}
