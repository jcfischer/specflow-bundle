/**
 * Dolt Database Adapter
 * MySQL-compatible adapter with git-like version control
 */

import mysql from "mysql2/promise";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import type { DbConfig, VCStatus } from "./types";
import { BaseAdapter } from "./base";
import { renderSchema } from "./schema";
import { checkDoltCliExec } from "./sql-utils";

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

    // Check Dolt CLI is installed (using shared utility)
    await checkDoltCliExec(exec);

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

    // Use shared schema definitions
    const statements = renderSchema("mysql");
    for (const statement of statements) {
      await conn.execute(statement);
    }
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
}
