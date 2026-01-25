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
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-skip-test";
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

describe("skip command", () => {
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

  it("should skip a feature and move it to end of queue", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "Second", description: "Desc", priority: 2 });
    addFeature({ id: "F-3", name: "Third", description: "Desc", priority: 3 });
    closeDatabase();

    const { stdout, exitCode } = runCli([
      "skip",
      "F-1",
      "--reason",
      "deferred",
      "--justification",
      "Deferring to later milestone",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Skipped");
    expect(stdout).toContain("F-1");
    expect(stdout).toContain("deferred");

    // Verify in database
    initDatabase(TEST_DB_PATH);
    const features = getFeatures();
    expect(features[0].id).toBe("F-2");
    expect(features[1].id).toBe("F-3");
    expect(features[2].id).toBe("F-1");
    expect(features[2].status).toBe("skipped");
  });

  it("should require reason and justification", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
    closeDatabase();

    const { stderr, exitCode } = runCli(["skip", "F-1"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Skip reason is required");
  });

  it("should validate duplicate-of when reason is duplicate", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
    closeDatabase();

    const { stderr, exitCode } = runCli([
      "skip",
      "F-1",
      "--reason",
      "duplicate",
      "--justification",
      "Duplicate feature",
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("must specify which feature it duplicates");
  });

  it("should allow --force to bypass validation", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
    closeDatabase();

    const { stdout, exitCode } = runCli(["skip", "F-1", "--force"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("forced");
  });

  it("should error for non-existent feature", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "First", description: "Desc", priority: 1 });
    closeDatabase();

    const { stderr, exitCode } = runCli(["skip", "F-999"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  it("should error when no database exists", () => {
    // Remove the .specflow directory so no DB exists
    if (existsSync(TEST_SPECFLOW_DIR)) {
      rmSync(TEST_SPECFLOW_DIR, { recursive: true });
    }

    const { stderr, exitCode } = runCli(["skip", "F-1"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("No SpecFlow database");
  });
});
