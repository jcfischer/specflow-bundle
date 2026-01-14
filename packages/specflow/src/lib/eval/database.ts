/**
 * Eval Database Module
 * SQLite operations for evaluation infrastructure
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type {
  TestCase,
  EvalResult,
  EvalRun,
  TestCaseType,
  GraderType,
} from "./types";

// =============================================================================
// Module State
// =============================================================================

let db: Database | null = null;

// =============================================================================
// Database Path Management
// =============================================================================

/** Database filename for evals */
export const EVAL_DB_FILENAME = "evals.db";

/**
 * Get the eval database path for a project
 */
export function getEvalDbPath(projectPath: string): string {
  return join(projectPath, ".specflow", EVAL_DB_FILENAME);
}

/**
 * Ensure the .specflow directory exists
 */
function ensureSpecflowDir(projectPath: string): void {
  const specflowDir = join(projectPath, ".specflow");
  if (!existsSync(specflowDir)) {
    mkdirSync(specflowDir, { recursive: true });
  }
}

// =============================================================================
// Database Initialization
// =============================================================================

/**
 * Initialize the eval database with schema
 */
export function initEvalDatabase(dbPath: string): Database {
  // Close existing connection if any
  if (db) {
    db.close();
  }

  // Ensure directory exists
  const dir = join(dbPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrency
  db.exec("PRAGMA journal_mode = WAL");

  // Create test_cases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      suite TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('positive', 'negative')),
      grader_type TEXT NOT NULL CHECK (grader_type IN ('code', 'model')),
      prompt TEXT,
      expected_behavior TEXT,
      grader_config TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Create eval_runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      suites TEXT NOT NULL,
      total_tests INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      skipped INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      pass_at_k TEXT,
      pass_caret_k REAL
    )
  `);

  // Create eval_results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      passed INTEGER NOT NULL,
      score REAL,
      duration_ms INTEGER NOT NULL,
      raw_output TEXT,
      error TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES eval_runs(id),
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_test_cases_suite ON test_cases(suite);
    CREATE INDEX IF NOT EXISTS idx_test_cases_type ON test_cases(type);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_timestamp ON eval_runs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_eval_results_run ON eval_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_eval_results_test_case ON eval_results(test_case_id);
  `);

  return db;
}

/**
 * Close the eval database connection
 */
export function closeEvalDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the current database instance
 */
function getDb(): Database {
  if (!db) {
    throw new Error("Eval database not initialized. Call initEvalDatabase() first.");
  }
  return db;
}

// =============================================================================
// Test Case Operations
// =============================================================================

/**
 * Input for adding a new test case
 */
export interface AddTestCaseInput {
  id: string;
  name: string;
  suite: string;
  type: TestCaseType;
  graderType: GraderType;
  prompt?: string;
  expectedBehavior?: string;
  graderConfig: Record<string, unknown>;
}

/**
 * Add a new test case
 */
export function addTestCase(input: AddTestCaseInput): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO test_cases (id, name, suite, type, grader_type, prompt, expected_behavior, grader_config, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      input.suite,
      input.type,
      input.graderType,
      input.prompt ?? null,
      input.expectedBehavior ?? null,
      JSON.stringify(input.graderConfig),
      now,
    ]
  );
}

/**
 * Get a test case by ID
 */
export function getTestCase(id: string): TestCase | null {
  const db = getDb();

  const row = db.query<TestCaseRow, [string]>(
    `SELECT * FROM test_cases WHERE id = ?`
  ).get(id);

  return row ? rowToTestCase(row) : null;
}

/**
 * Get all test cases
 */
export function getTestCases(): TestCase[] {
  const db = getDb();

  const rows = db.query<TestCaseRow, []>(
    `SELECT * FROM test_cases ORDER BY created_at ASC`
  ).all();

  return rows.map(rowToTestCase);
}

/**
 * Get test cases by suite
 */
export function getTestCasesBySuite(suite: string): TestCase[] {
  const db = getDb();

  const rows = db.query<TestCaseRow, [string]>(
    `SELECT * FROM test_cases WHERE suite = ? ORDER BY created_at ASC`
  ).all(suite);

  return rows.map(rowToTestCase);
}

/**
 * Delete a test case
 */
export function deleteTestCase(id: string): void {
  const db = getDb();
  db.run(`DELETE FROM test_cases WHERE id = ?`, [id]);
}

/**
 * Get test case balance (positive vs negative)
 */
export function getTestCaseBalance(): {
  positive: number;
  negative: number;
  total: number;
  ratio: number;
} {
  const db = getDb();

  const row = db.query<{ positive: number; negative: number; total: number }, []>(`
    SELECT
      SUM(CASE WHEN type = 'positive' THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN type = 'negative' THEN 1 ELSE 0 END) as negative,
      COUNT(*) as total
    FROM test_cases
  `).get();

  const positive = row?.positive ?? 0;
  const negative = row?.negative ?? 0;
  const total = row?.total ?? 0;

  return {
    positive,
    negative,
    total,
    ratio: total > 0 ? positive / total : 0,
  };
}

// =============================================================================
// Eval Run Operations
// =============================================================================

/**
 * Input for adding a new eval run
 */
export interface AddEvalRunInput {
  id: string;
  suites: string[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  passAtK?: Record<number, number>;
  passCaretK?: number;
}

/**
 * Add a new eval run
 */
export function addEvalRun(input: AddEvalRunInput): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO eval_runs (id, timestamp, suites, total_tests, passed, failed, skipped, duration_ms, pass_at_k, pass_caret_k)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      now,
      JSON.stringify(input.suites),
      input.totalTests,
      input.passed,
      input.failed,
      input.skipped,
      input.durationMs,
      input.passAtK ? JSON.stringify(input.passAtK) : null,
      input.passCaretK ?? null,
    ]
  );
}

/**
 * Get an eval run by ID
 */
export function getEvalRun(id: string): EvalRun | null {
  const db = getDb();

  const row = db.query<EvalRunRow, [string]>(
    `SELECT * FROM eval_runs WHERE id = ?`
  ).get(id);

  return row ? rowToEvalRun(row) : null;
}

/**
 * Get recent eval runs
 */
export function getEvalRuns(limit: number = 10): EvalRun[] {
  const db = getDb();

  const rows = db.query<EvalRunRow, [number]>(
    `SELECT * FROM eval_runs ORDER BY timestamp DESC LIMIT ?`
  ).all(limit);

  return rows.map(rowToEvalRun);
}

// =============================================================================
// Eval Result Operations
// =============================================================================

/**
 * Input for adding an eval result
 */
export interface AddEvalResultInput {
  id: string;
  runId: string;
  testCaseId: string;
  passed: boolean;
  score: number | null;
  durationMs: number;
  rawOutput: string | null;
  error: string | null;
}

/**
 * Add an eval result
 */
export function addEvalResult(input: AddEvalResultInput): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO eval_results (id, run_id, test_case_id, passed, score, duration_ms, raw_output, error, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.runId,
      input.testCaseId,
      input.passed ? 1 : 0,
      input.score,
      input.durationMs,
      input.rawOutput,
      input.error,
      now,
    ]
  );
}

/**
 * Get eval results for a run
 */
export function getEvalResults(runId: string): EvalResult[] {
  const db = getDb();

  const rows = db.query<EvalResultRow, [string]>(
    `SELECT * FROM eval_results WHERE run_id = ? ORDER BY timestamp ASC`
  ).all(runId);

  return rows.map(rowToEvalResult);
}

// =============================================================================
// Internal Types and Helpers
// =============================================================================

interface TestCaseRow {
  id: string;
  name: string;
  suite: string;
  type: string;
  grader_type: string;
  prompt: string | null;
  expected_behavior: string | null;
  grader_config: string;
  created_at: string;
}

interface EvalRunRow {
  id: string;
  timestamp: string;
  suites: string;
  total_tests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  pass_at_k: string | null;
  pass_caret_k: number | null;
}

interface EvalResultRow {
  id: string;
  run_id: string;
  test_case_id: string;
  passed: number;
  score: number | null;
  duration_ms: number;
  raw_output: string | null;
  error: string | null;
  timestamp: string;
}

function rowToTestCase(row: TestCaseRow): TestCase {
  return {
    id: row.id,
    name: row.name,
    suite: row.suite,
    type: row.type as TestCaseType,
    graderType: row.grader_type as GraderType,
    prompt: row.prompt ?? undefined,
    expectedBehavior: row.expected_behavior ?? undefined,
    graderConfig: JSON.parse(row.grader_config),
    createdAt: new Date(row.created_at),
  };
}

function rowToEvalRun(row: EvalRunRow): EvalRun {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    suites: JSON.parse(row.suites),
    totalTests: row.total_tests,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped,
    durationMs: row.duration_ms,
    passAtK: row.pass_at_k ? JSON.parse(row.pass_at_k) : undefined,
    passCaretK: row.pass_caret_k ?? undefined,
  };
}

function rowToEvalResult(row: EvalResultRow): EvalResult {
  return {
    id: row.id,
    runId: row.run_id,
    testCaseId: row.test_case_id,
    passed: row.passed === 1,
    score: row.score,
    durationMs: row.duration_ms,
    rawOutput: row.raw_output,
    error: row.error,
    timestamp: new Date(row.timestamp),
  };
}
