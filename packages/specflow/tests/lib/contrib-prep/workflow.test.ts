import { describe, it, expect, afterEach } from "bun:test";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../../src/lib/database";
import { runContribWorkflow } from "../../../src/lib/contrib-prep/workflow";
import {
  createAutoApprover,
  createRejectAtGateApprover,
} from "../../../src/lib/contrib-prep/gates";
import {
  getContribState,
  createContribState,
  updateContribGate,
} from "../../../src/lib/contrib-prep/state";

const TEST_PROJECT_DIR = "/tmp/specflow-workflow-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

/**
 * Create a test git repo with two commits (base + feature).
 * Same pattern as extract.test.ts.
 */
function initTestRepo(files: Record<string, string>): void {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });

  execSync("git init -b main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });

  // Commit 1: base files
  writeFileSync(join(TEST_PROJECT_DIR, ".gitignore"), ".specflow/\n", "utf-8");
  writeFileSync(join(TEST_PROJECT_DIR, "README.base.md"), "# Base\n", "utf-8");
  execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git commit --no-verify -m "base"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });
  execSync('git tag "base-point"', { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

  // Commit 2: feature files
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TEST_PROJECT_DIR, path);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content, "utf-8");
  }
  execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git commit --no-verify -m "add feature files"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });

  // Set up specflow DB
  mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
  initDatabase(TEST_DB_PATH);
  addFeature({
    id: "F-1",
    name: "Test Feature",
    description: "A test feature",
    priority: 1,
  });
}

function cleanup(): void {
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
}

// =============================================================================
// Full Workflow Tests
// =============================================================================

describe("runContribWorkflow", () => {
  afterEach(cleanup);

  it("should complete full workflow with auto-approver", async () => {
    initTestRepo({
      "src/index.ts": 'export const hello = "world";',
      "src/utils.ts": "export function add(a: number, b: number) { return a + b; }",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createAutoApprover(true),
    });

    expect(result.completed).toBe(true);
    expect(result.stoppedAtGate).toBeNull();
    expect(result.featureId).toBe("F-1");
    expect(result.finalGate).toBe(5);
    expect(result.tagName).toBeTruthy();
    expect(result.contribBranch).toBeTruthy();
  });

  it("should stop at gate 1 when rejected", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(1),
    });

    expect(result.completed).toBe(false);
    expect(result.stoppedAtGate).toBe(1);
    expect(result.finalGate).toBe(0);
  });

  it("should stop at gate 2 when rejected", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(2),
    });

    expect(result.completed).toBe(false);
    expect(result.stoppedAtGate).toBe(2);
    expect(result.finalGate).toBe(1);
  });

  it("should stop at gate 3 (pre-extraction) when rejected", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(3),
    });

    expect(result.completed).toBe(false);
    expect(result.stoppedAtGate).toBe(3);
    // Gate should be at 2 (sanitization done, pre-extraction rejected)
    expect(result.finalGate).toBe(2);
  });

  it("should stop at gate 4 (post-extraction) when rejected", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(4),
    });

    expect(result.completed).toBe(false);
    expect(result.stoppedAtGate).toBe(4);
    // Extraction happened (gate advanced to 4 by runExtraction)
    expect(result.tagName).toBeTruthy();
    expect(result.contribBranch).toBeTruthy();
  });

  it("should stop at gate 5 (verification) when rejected", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(5),
    });

    expect(result.completed).toBe(false);
    expect(result.stoppedAtGate).toBe(5);
  });

  it("should create contrib state if none exists", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    // State doesn't exist yet
    expect(getContribState("F-1")).toBeNull();

    await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(1), // stop early
    });

    // State should now exist
    expect(getContribState("F-1")).not.toBeNull();
  });

  it("should track gate approvals in recorded calls", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const calls: number[] = [];
    const trackingApprover = async (gateNum: number) => {
      calls.push(gateNum);
      return true;
    };

    await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: trackingApprover,
    });

    // Should call all 5 gates
    expect(calls).toEqual([1, 2, 3, 4, 5]);
  });
});

// =============================================================================
// Resume Tests
// =============================================================================

describe("runContribWorkflow (resume)", () => {
  afterEach(cleanup);

  it("should resume from gate 1 (skip inventory)", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    // Pre-create state at gate 1
    createContribState("F-1", "base-point");
    updateContribGate("F-1", 1);

    const calls: number[] = [];
    const trackingApprover = async (gateNum: number) => {
      calls.push(gateNum);
      return true;
    };

    await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: trackingApprover,
    });

    // Should NOT include gate 1 (already past it)
    expect(calls).not.toContain(1);
    expect(calls).toContain(2);
    expect(calls).toContain(3);
  });

  it("should resume from gate 2 (skip inventory + sanitization)", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    createContribState("F-1", "base-point");
    updateContribGate("F-1", 2);

    const calls: number[] = [];
    const trackingApprover = async (gateNum: number) => {
      calls.push(gateNum);
      return true;
    };

    await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: trackingApprover,
    });

    // Should skip gates 1 and 2
    expect(calls).not.toContain(1);
    expect(calls).not.toContain(2);
    expect(calls).toContain(3);
  });

  it("should resume from gate 4 (skip to verification)", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    // Simulate a completed extraction — create state + branch
    createContribState("F-1", "base-point");

    // Actually run extraction to create the branch and tag
    await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: createRejectAtGateApprover(5), // stop at final gate
    });

    // Now state should be at gate 4, with tag and branch
    const state = getContribState("F-1");
    expect(state!.gate).toBeGreaterThanOrEqual(4);

    // Resume — should only hit gate 5
    const calls: number[] = [];
    const trackingApprover = async (gateNum: number) => {
      calls.push(gateNum);
      return true;
    };

    await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      approver: trackingApprover,
    });

    expect(calls).toEqual([5]);
  });
});

// =============================================================================
// Dry-run Tests
// =============================================================================

describe("runContribWorkflow (dry-run)", () => {
  afterEach(cleanup);

  it("should complete with dry-run flag", async () => {
    initTestRepo({
      "src/index.ts": "export {};",
    });

    const result = await runContribWorkflow(TEST_PROJECT_DIR, "F-1", {
      baseBranch: "base-point",
      dryRun: true,
      approver: createAutoApprover(true),
    });

    // Dry-run still goes through the workflow but extraction doesn't create real branches
    expect(result.completed).toBe(true);
    expect(result.featureId).toBe("F-1");
  });
});
