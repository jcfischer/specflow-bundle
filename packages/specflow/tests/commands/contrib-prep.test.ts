import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync, execSync } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-contrib-prep-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

function runCli(args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
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

describe("contrib-prep command", () => {
  beforeEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });

    // Init git repo (needed for --inventory which calls git ls-files)
    execSync("git init", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    execSync('git config user.name "Test"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    // Gitignore .specflow/ so DB files don't dirty the working tree
    writeFileSync(join(TEST_PROJECT_DIR, ".gitignore"), ".specflow/\n", "utf-8");
    // Create a minimal file so git has something to track
    mkdirSync(join(TEST_PROJECT_DIR, "src"), { recursive: true });
    writeFileSync(join(TEST_PROJECT_DIR, "src", "index.ts"), "export {};", "utf-8");
    execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
    execSync('git commit --no-verify -m "initial"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    initDatabase(TEST_DB_PATH);
    addFeature({
      id: "F-1",
      name: "Test Feature",
      description: "A test feature",
      priority: 1,
    });
    closeDatabase();
  });

  afterEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should show help with all flags", () => {
    const { stdout } = runCli(["contrib-prep", "--help"]);

    expect(stdout).toContain("--inventory");
    expect(stdout).toContain("--sanitize");
    expect(stdout).toContain("--extract");
    expect(stdout).toContain("--verify");
    expect(stdout).toContain("--base");
    expect(stdout).toContain("--tag");
    expect(stdout).toContain("--dry-run");
    expect(stdout).toContain("-y, --yes");
  });

  it("should initialize state on first run", () => {
    const { stdout, exitCode } = runCli(["contrib-prep", "F-1", "--inventory"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Initialized contrib-prep for F-1");
  });

  it("should error for non-existent feature", () => {
    const { stderr, exitCode } = runCli(["contrib-prep", "F-999", "--inventory"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  it("should error when no database exists", () => {
    if (existsSync(TEST_SPECFLOW_DIR)) {
      rmSync(TEST_SPECFLOW_DIR, { recursive: true });
    }

    const { stderr, exitCode } = runCli(["contrib-prep", "F-1"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("No SpecFlow database");
  });

  it("should run with --inventory flag", () => {
    const { stdout, exitCode } = runCli(["contrib-prep", "F-1", "--inventory"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Inventory generated");
    expect(stdout).toContain("Included:");
    expect(stdout).toContain("Registry:");
  });

  it("should run with --sanitize flag", () => {
    const { stdout, exitCode } = runCli(["contrib-prep", "F-1", "--sanitize"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Sanitization scan");
    expect(stdout).toContain("Pass:");
  });

  it("should run with --extract flag (dry-run)", () => {
    const { stdout, exitCode } = runCli(["contrib-prep", "F-1", "--extract", "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Extraction complete");
    expect(stdout).toContain("dry-run");
  });

  it("should error with --verify when no contrib branch exists", () => {
    const { stderr, exitCode } = runCli(["contrib-prep", "F-1", "--verify"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("does not exist");
  });

  it("should run full workflow without flags", () => {
    const { stdout, exitCode } = runCli(["contrib-prep", "F-1"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Full workflow");
    expect(stdout).toContain("F-1");
    expect(stdout).toContain("gate:");
  });

  it("should show dry-run mode in full workflow", () => {
    const { stdout, exitCode } = runCli(["contrib-prep", "F-1", "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("dry-run");
  });

  it("should accept custom base branch", () => {
    const { stdout, exitCode } = runCli([
      "contrib-prep",
      "F-1",
      "--base",
      "develop",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("develop");
  });
});
