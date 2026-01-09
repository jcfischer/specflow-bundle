import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { unlinkSync, existsSync, mkdirSync, rmSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  getFeature,
  getFeatures,
  updateFeatureStatus,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-reset-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("bun", ["run", CLI_PATH, ...args], {
    encoding: "utf-8",
    cwd: TEST_PROJECT_DIR,
    env: { ...process.env },
  });
  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    exitCode: result.status ?? 1,
  };
}

describe("reset command", () => {
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

  it("should reset a completed feature to pending", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    updateFeatureStatus("F-1", "complete");
    closeDatabase();

    const { stdout, exitCode } = runCli(["reset", "F-1"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Reset");
    expect(stdout).toContain("F-1");

    // Verify in database
    initDatabase(TEST_DB_PATH);
    const feature = getFeature("F-1");
    expect(feature?.status).toBe("pending");
    expect(feature?.startedAt).toBeNull();
    expect(feature?.completedAt).toBeNull();
  });

  it("should reset an in-progress feature to pending", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    updateFeatureStatus("F-1", "in_progress");
    closeDatabase();

    const { stdout, exitCode } = runCli(["reset", "F-1"]);

    expect(exitCode).toBe(0);

    initDatabase(TEST_DB_PATH);
    const feature = getFeature("F-1");
    expect(feature?.status).toBe("pending");
  });

  it("should reset all features with --all flag", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "Feature 2", description: "Desc", priority: 2 });
    addFeature({ id: "F-3", name: "Feature 3", description: "Desc", priority: 3 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureStatus("F-2", "in_progress");
    closeDatabase();

    // Note: --all doesn't need a feature ID, but commander requires an argument
    // So we pass a dummy and use --all
    const { stdout, exitCode } = runCli(["reset", "--all"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Reset all");

    initDatabase(TEST_DB_PATH);
    const features = getFeatures();
    for (const f of features) {
      expect(f.status).toBe("pending");
    }
  });

  it("should error for non-existent feature", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature 1", description: "Desc", priority: 1 });
    closeDatabase();

    const { stderr, exitCode } = runCli(["reset", "F-999"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  it("should error when no database exists", () => {
    // Remove the .specflow directory so no DB exists
    if (existsSync(TEST_SPECFLOW_DIR)) {
      rmSync(TEST_SPECFLOW_DIR, { recursive: true });
    }

    const { stderr, exitCode } = runCli(["reset", "F-1"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("No SpecFlow database");
  });
});
