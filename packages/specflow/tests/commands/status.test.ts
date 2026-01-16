import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, rmSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  updateFeatureStatus,
  updateFeatureQuickStart,
  skipFeature,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-status-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("bun", ["run", CLI_PATH, ...args], {
    encoding: "utf-8",
    cwd: cwd ?? TEST_PROJECT_DIR,
    env: { ...process.env },
  });
  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    exitCode: result.status ?? 1,
  };
}

describe("status command", () => {
  beforeEach(() => {
    // Clean up and recreate test directories
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should show empty state when no features", () => {
    // Initialize empty database
    initDatabase(TEST_DB_PATH);
    closeDatabase();

    const { stdout, exitCode } = runCli(["status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 features");
  });

  it("should show feature count and progress", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "Feature 2", description: "Desc", priority: 2 });
    addFeature({ id: "F-3", name: "Feature 3", description: "Desc", priority: 3 });
    updateFeatureStatus("F-1", "complete");
    closeDatabase();

    const { stdout, exitCode } = runCli(["status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("3 features");
    expect(stdout).toContain("1 complete");
    expect(stdout).toContain("33%");
  });

  it("should list features with status", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Core model", description: "Data models", priority: 1 });
    addFeature({ id: "F-2", name: "CLI", description: "Commands", priority: 2 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureStatus("F-2", "in_progress");
    closeDatabase();

    const { stdout, exitCode } = runCli(["status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("F-1");
    expect(stdout).toContain("Core model");
    expect(stdout).toContain("complete");
    expect(stdout).toContain("F-2");
    expect(stdout).toContain("in_progress");
  });

  it("should output JSON with --json flag", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    closeDatabase();

    const { stdout, exitCode } = runCli(["status", "--json"]);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.stats.total).toBe(1);
    expect(json.features).toHaveLength(1);
    expect(json.features[0].id).toBe("F-1");
  });

  it("should show skipped features", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "Feature 2", description: "Desc", priority: 2 });
    skipFeature("F-1");
    closeDatabase();

    const { stdout, exitCode } = runCli(["status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("1 skipped");
  });

  // ===========================================================================
  // Quick-Start Indicator Tests (T-8.3)
  // ===========================================================================

  it("should show quick-start indicator ⚡ for quick-start features", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Normal Feature", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "Quick Feature", description: "Desc", priority: 2 });
    updateFeatureQuickStart("F-2", true);
    closeDatabase();

    const { stdout, exitCode } = runCli(["status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("⚡");
    expect(stdout).toContain("Quick Feature");
  });

  it("should not show quick-start indicator for normal features", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Normal Feature", description: "Desc", priority: 1 });
    closeDatabase();

    const { stdout, exitCode } = runCli(["status"]);

    expect(exitCode).toBe(0);
    // Count occurrences of ⚡ in output - should be none in the feature rows
    const featureLines = stdout.split("\n").filter(line => line.includes("F-1"));
    expect(featureLines.some(line => line.includes("⚡"))).toBe(false);
  });

  it("should include quickStart in JSON output", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "Feature 2", description: "Desc", priority: 2 });
    updateFeatureQuickStart("F-2", true);
    closeDatabase();

    const { stdout, exitCode } = runCli(["status", "--json"]);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.features).toHaveLength(2);
    expect(json.features[0].quickStart).toBe(false);
    expect(json.features[1].quickStart).toBe(true);
  });
});
