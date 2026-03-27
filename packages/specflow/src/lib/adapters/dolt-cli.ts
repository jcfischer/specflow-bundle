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
import { renderSchema } from "./schema";
import { interpolateQuery, parseJsonResult, checkDoltCliBun } from "./sql-utils";

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

    // Check Dolt CLI is installed (using shared utility)
    await checkDoltCliBun();

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

  // ============================================
  // Database Primitives (Dolt CLI-specific)
  // ============================================

  protected async execute(query: string, values?: any[]): Promise<void> {
    const interpolated = interpolateQuery(query, values);
    await this.runSql(interpolated);
  }

  protected async queryOne<T>(query: string, values?: any[]): Promise<T | null> {
    const interpolated = interpolateQuery(query, values);
    const output = await this.runSql(interpolated);
    const rows = parseJsonResult(output);
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  protected async queryMany<T>(query: string, values?: any[]): Promise<T[]> {
    const interpolated = interpolateQuery(query, values);
    const output = await this.runSql(interpolated);
    return parseJsonResult(output) as T[];
  }

  protected now(): string {
    return new Date().toISOString();
  }

  // ============================================
  // Schema Initialization
  // ============================================

  private async initializeSchema(): Promise<void> {
    // Use shared schema definitions (MySQL dialect for Dolt compatibility)
    const statements = renderSchema("mysql");
    for (const statement of statements) {
      await this.runSql(statement);
    }
  }

  // ============================================
  // Version Control Operations
  // ============================================

  async init(): Promise<void> {
    // Already handled in connect() — dolt init runs if .dolt doesn't exist
  }

  async status(): Promise<VCStatus> {
    const output = await this.runSql("SELECT * FROM dolt_status");
    const rows = parseJsonResult(output);

    let branch = "main";
    try {
      const branchOutput = await this.runSql("SELECT active_branch() as branch");
      const branchRows = parseJsonResult(branchOutput);
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
    const rows = parseJsonResult(output);
    return rows.map((r: any) => `${r.commit_hash} ${r.message}`);
  }

  async diff(commit?: string): Promise<string> {
    const fromRef = commit ?? "HEAD";
    try {
      const output = await this.runSql(`SELECT * FROM dolt_diff_stat('${fromRef}', 'WORKING')`);
      const rows = parseJsonResult(output);
      return rows
        .map((r: any) => `${r.table_name}: +${r.rows_added} -${r.rows_deleted} ~${r.rows_modified}`)
        .join("\n");
    } catch {
      return "(no changes)";
    }
  }
}
