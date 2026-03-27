/**
 * Dolt CLI Database Adapter
 * Serverless Dolt adapter that uses `dolt sql -q` against a local Dolt directory.
 * No running server required — the Dolt data directory lives inside the project
 * and can be committed to git for collaboration.
 */

import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { DbConfig, VCStatus } from "./types";
import { BaseAdapter } from "./base";

// =============================================================================
// DoltCliAdapter Implementation
// =============================================================================

export class DoltCliAdapter extends BaseAdapter {
  private doltDir: string | null = null;

  // ============================================
  // Connection Lifecycle
  // ============================================

  async connect(config: DbConfig): Promise<void> {
    if (!config.doltCli) {
      throw new Error("Dolt CLI configuration is required");
    }

    this.doltDir = config.doltCli.path;

    // Check Dolt CLI is installed
    try {
      const proc = Bun.spawn(["dolt", "version"], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      if (proc.exitCode !== 0) throw new Error("dolt not found");
    } catch {
      throw new Error(
        "Dolt CLI not found. Install with: brew install dolt"
      );
    }

    // Initialize Dolt directory if it doesn't exist
    if (!existsSync(this.doltDir)) {
      mkdirSync(this.doltDir, { recursive: true });
      await this.runDolt(["init"]);
    } else if (!existsSync(join(this.doltDir, ".dolt"))) {
      await this.runDolt(["init"]);
    }

    // Initialize schema
    await this.initializeSchema();
  }

  async disconnect(): Promise<void> {
    this.doltDir = null;
  }

  private getDoltDir(): string {
    if (!this.doltDir) {
      throw new Error("Database not initialized. Call connect() first.");
    }
    return this.doltDir;
  }

  // ============================================
  // Dolt CLI Execution
  // ============================================

  private async runDolt(args: string[]): Promise<string> {
    const dir = this.getDoltDir();
    const proc = Bun.spawn(["dolt", ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    if (exitCode !== 0) {
      throw new Error(`dolt ${args[0]} failed: ${stderr.trim()}`);
    }
    return stdout;
  }

  private async runSql(query: string): Promise<string> {
    const dir = this.getDoltDir();
    const proc = Bun.spawn(["dolt", "sql", "-q", query, "-r", "json"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    if (exitCode !== 0) {
      throw new Error(`SQL error: ${stderr.trim()}\nQuery: ${query}`);
    }
    return stdout;
  }

  private parseJsonResult(output: string): any[] {
    const trimmed = output.trim();
    if (!trimmed || trimmed === "[]") return [];
    try {
      const parsed = JSON.parse(trimmed);
      // dolt sql -r json returns { rows: [...] } for SELECT queries
      if (parsed && parsed.rows) return parsed.rows;
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }

  // ============================================
  // Database Primitives (Dolt CLI-specific)
  // ============================================

  protected async execute(query: string, values?: any[]): Promise<void> {
    const interpolated = this.interpolateQuery(query, values);
    await this.runSql(interpolated);
  }

  protected async queryOne<T>(query: string, values?: any[]): Promise<T | null> {
    const interpolated = this.interpolateQuery(query, values);
    const output = await this.runSql(interpolated);
    const rows = this.parseJsonResult(output);
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  protected async queryMany<T>(query: string, values?: any[]): Promise<T[]> {
    const interpolated = this.interpolateQuery(query, values);
    const output = await this.runSql(interpolated);
    return this.parseJsonResult(output) as T[];
  }

  protected now(): string {
    return new Date().toISOString();
  }

  /**
   * Interpolate parameterized query values into the SQL string.
   * Dolt CLI doesn't support prepared statements, so we escape and inline values.
   */
  private interpolateQuery(query: string, values?: any[]): string {
    if (!values || values.length === 0) return query;

    let idx = 0;
    return query.replace(/\?/g, () => {
      if (idx >= values.length) return "?";
      const val = values[idx++];
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "number") return String(val);
      if (typeof val === "boolean") return val ? "1" : "0";
      // Escape single quotes for SQL string literals
      const escaped = String(val).replace(/'/g, "''");
      return `'${escaped}'`;
    });
  }

  // ============================================
  // Schema Initialization
  // ============================================

  private async initializeSchema(): Promise<void> {
    // Use MySQL-compatible DDL (same as server-mode Dolt adapter)
    await this.runSql(`
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

    await this.runSql(`
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

    await this.runSql(`
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

    await this.runSql(`
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
  // Version Control Operations
  // ============================================

  async init(): Promise<void> {
    // Already handled in connect() — dolt init runs if .dolt doesn't exist
  }

  async status(): Promise<VCStatus> {
    const output = await this.runSql("SELECT * FROM dolt_status");
    const rows = this.parseJsonResult(output);

    let branch = "main";
    try {
      const branchOutput = await this.runSql("SELECT active_branch() as branch");
      const branchRows = this.parseJsonResult(branchOutput);
      if (branchRows.length > 0) branch = branchRows[0].branch;
    } catch {
      // active_branch() may not work in CLI mode, fall back to main
    }

    return {
      clean: rows.length === 0,
      uncommittedChanges: rows.map((r: any) => r.table_name as string),
      branch,
      ahead: 0,
      behind: 0,
    };
  }

  async commit(message: string): Promise<void> {
    await this.runDolt(["add", "."]);
    await this.runDolt(["commit", "-m", message]);
  }

  async push(remote: string = "origin"): Promise<void> {
    await this.runDolt(["push", remote]);
  }

  async pull(remote: string = "origin"): Promise<void> {
    await this.runDolt(["pull", remote]);
  }

  async log(limit: number = 10): Promise<string[]> {
    const output = await this.runSql(`SELECT commit_hash, message FROM dolt_log LIMIT ${limit}`);
    const rows = this.parseJsonResult(output);
    return rows.map((r: any) => `${r.commit_hash} ${r.message}`);
  }

  async diff(commit?: string): Promise<string> {
    const fromRef = commit ?? "HEAD";
    try {
      const output = await this.runSql(`SELECT * FROM dolt_diff_stat('${fromRef}', 'WORKING')`);
      const rows = this.parseJsonResult(output);
      return rows
        .map((r: any) => `${r.table_name}: +${r.rows_added} -${r.rows_deleted} ~${r.rows_modified}`)
        .join("\n");
    } catch {
      return "(no changes)";
    }
  }

  // ============================================
  // Bulk Operations (for migrations)
  // ============================================

  async bulkInsert(table: string, columns: string[], rows: any[][]): Promise<void> {
    if (rows.length === 0) return;

    // Build INSERT with inline values (no prepared statements in CLI mode)
    const valuesSets = rows.map(row => {
      const vals = row.map(v => {
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "1" : "0";
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      return `(${vals.join(", ")})`;
    });

    const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuesSets.join(", ")}`;
    await this.runSql(query);
  }

  async getTableRowCount(table: string): Promise<number> {
    const output = await this.runSql(`SELECT COUNT(*) as count FROM ${table}`);
    const rows = this.parseJsonResult(output);
    return rows.length > 0 ? Number(rows[0].count) : 0;
  }
}
