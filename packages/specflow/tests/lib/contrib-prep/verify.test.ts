import { describe, it, expect, afterEach } from "bun:test";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { execSync } from "child_process";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../../src/lib/database";
import {
  checkInventoryMatch,
  checkSanitization,
  checkDependencies,
  runVerification,
} from "../../../src/lib/contrib-prep/verify";
import { getContribState } from "../../../src/lib/contrib-prep/state";
import { runExtraction } from "../../../src/lib/contrib-prep/extract";

const TEST_PROJECT_DIR = "/tmp/specflow-verify-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

/**
 * Create a test repo with base + feature commits, then run extraction
 * to produce a contrib branch ready for verification.
 */
function initTestRepoWithContrib(
  featureFiles: Record<string, string>,
  includedFiles: string[]
): void {
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

  // Base commit
  writeFileSync(join(TEST_PROJECT_DIR, ".gitignore"), ".specflow/\n", "utf-8");
  writeFileSync(join(TEST_PROJECT_DIR, "README.base.md"), "# Base\n", "utf-8");
  execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git commit --no-verify -m "base"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });
  execSync('git tag "base-point"', { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

  // Feature commit
  for (const [path, content] of Object.entries(featureFiles)) {
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

  // Run extraction to create contrib branch
  runExtraction(TEST_PROJECT_DIR, "F-1", includedFiles, {
    baseBranch: "base-point",
  });
}

function cleanup(): void {
  try { closeDatabase(); } catch { /* ignore */ }
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
}

// =============================================================================
// checkInventoryMatch Tests
// =============================================================================

describe("checkInventoryMatch", () => {
  afterEach(cleanup);

  it("should pass when files match exactly", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    // Switch to contrib branch for check
    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    // Expected files = base files + extracted feature files
    const actualFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");

    const result = checkInventoryMatch(TEST_PROJECT_DIR, actualFiles);
    expect(result.pass).toBe(true);
    expect(result.name).toBe("inventory-match");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });

  it("should fail when extra files present", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    // Expect only src/index.ts but branch also has .gitignore and README.base.md
    const result = checkInventoryMatch(TEST_PROJECT_DIR, ["src/index.ts"]);
    expect(result.pass).toBe(false);
    expect(result.details).toContain("Extra files");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });

  it("should fail when files are missing", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    // Expect a file that doesn't exist
    const actualFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");

    const result = checkInventoryMatch(TEST_PROJECT_DIR, [
      ...actualFiles,
      "src/missing.ts",
    ]);
    expect(result.pass).toBe(false);
    expect(result.details).toContain("Missing files");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });
});

// =============================================================================
// checkSanitization Tests
// =============================================================================

describe("checkSanitization", () => {
  afterEach(cleanup);

  it("should pass for clean files", () => {
    initTestRepoWithContrib(
      { "src/clean.ts": "export function add(a: number, b: number) { return a + b; }" },
      ["src/clean.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    const result = checkSanitization(TEST_PROJECT_DIR, ["src/clean.ts"]);
    expect(result.pass).toBe(true);
    expect(result.details).toContain("Findings: 0");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });

  it("should fail for files with personal paths", () => {
    initTestRepoWithContrib(
      { "src/dirty.ts": 'const p = "/Users/alice/work";' },
      ["src/dirty.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    const result = checkSanitization(TEST_PROJECT_DIR, ["src/dirty.ts"]);
    expect(result.pass).toBe(false);
    expect(result.details).toContain("personal-path");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });
});

// =============================================================================
// checkDependencies Tests
// =============================================================================

describe("checkDependencies", () => {
  afterEach(cleanup);

  it("should pass for relative imports", () => {
    initTestRepoWithContrib(
      { "src/index.ts": 'import { foo } from "./utils";' },
      ["src/index.ts"]
    );

    const result = checkDependencies(TEST_PROJECT_DIR, ["src/index.ts"]);
    expect(result.pass).toBe(true);
    expect(result.details).toContain("External references: 0");
  });

  it("should fail for absolute path imports", () => {
    initTestRepoWithContrib(
      { "src/index.ts": 'import { secret } from "/Users/alice/private/lib";' },
      ["src/index.ts"]
    );

    const result = checkDependencies(TEST_PROJECT_DIR, ["src/index.ts"]);
    expect(result.pass).toBe(false);
    expect(result.details).toContain("src/index.ts:1");
  });

  it("should fail for home path require", () => {
    initTestRepoWithContrib(
      { "src/index.ts": 'const lib = require("/home/dev/mylib");' },
      ["src/index.ts"]
    );

    const result = checkDependencies(TEST_PROJECT_DIR, ["src/index.ts"]);
    expect(result.pass).toBe(false);
  });

  it("should skip non-code files", () => {
    initTestRepoWithContrib(
      {
        "README.md": "See /Users/alice/docs for more",
        "src/index.ts": "export {};",
      },
      ["README.md", "src/index.ts"]
    );

    const result = checkDependencies(TEST_PROJECT_DIR, ["README.md", "src/index.ts"]);
    expect(result.pass).toBe(true);
  });

  it("should pass for package imports", () => {
    initTestRepoWithContrib(
      { "src/index.ts": 'import { join } from "path";' },
      ["src/index.ts"]
    );

    const result = checkDependencies(TEST_PROJECT_DIR, ["src/index.ts"]);
    expect(result.pass).toBe(true);
  });
});

// =============================================================================
// runVerification Orchestrator Tests
// =============================================================================

describe("runVerification", () => {
  afterEach(cleanup);

  it("should pass for a clean contrib branch", () => {
    initTestRepoWithContrib(
      {
        "src/index.ts": "export function hello() { return 'hi'; }",
        "src/utils.ts": "export function add(a: number, b: number) { return a + b; }",
      },
      ["src/index.ts", "src/utils.ts"]
    );

    // Get the actual files on the contrib branch for expected list
    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    const report = runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    expect(report.pass).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(2);
  });

  it("should fail when inventory doesn't match", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    // Pass wrong expected files
    const report = runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      ["src/index.ts", "src/missing.ts"],
      { skipTests: true }
    );

    expect(report.pass).toBe(false);
    const inventoryCheck = report.checks.find((c) => c.name === "inventory-match");
    expect(inventoryCheck?.pass).toBe(false);
  });

  it("should fail when sanitization finds issues", () => {
    initTestRepoWithContrib(
      { "src/dirty.ts": 'const p = "/Users/alice/work";' },
      ["src/dirty.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    const report = runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    expect(report.pass).toBe(false);
    const sanitizeCheck = report.checks.find((c) => c.name === "sanitization");
    expect(sanitizeCheck?.pass).toBe(false);
  });

  it("should skip sanitization when option set", () => {
    initTestRepoWithContrib(
      { "src/dirty.ts": 'const p = "/Users/alice/work";' },
      ["src/dirty.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    const report = runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true, skipSanitize: true }
    );

    const sanitizeCheck = report.checks.find((c) => c.name === "sanitization");
    expect(sanitizeCheck).toBeUndefined();
  });

  it("should write verification report to contrib directory", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    const reportPath = join(
      TEST_PROJECT_DIR,
      ".specflow",
      "contrib",
      "F-1",
      "verification-report.json"
    );
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    expect(report.pass).toBeDefined();
    expect(report.checks).toBeDefined();
    expect(report.timestamp).toBeDefined();
  });

  it("should update state with verification pass", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    const state = getContribState("F-1");
    expect(state).not.toBeNull();
    expect(state!.verificationPass).toBe(true);
  });

  it("should advance gate to 5 on pass", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    const state = getContribState("F-1");
    expect(state!.gate).toBe(5);
  });

  it("should not advance gate on failure", () => {
    initTestRepoWithContrib(
      { "src/dirty.ts": 'const p = "/Users/alice/work";' },
      ["src/dirty.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    const state = getContribState("F-1");
    // Gate should stay at 4 (from extraction), not advance
    expect(state!.gate).toBe(4);
  });

  it("should return to original branch after verification", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );

    const { getCurrentBranch } = require("../../../src/lib/contrib-prep/extract");
    expect(getCurrentBranch(TEST_PROJECT_DIR)).toBe("main");
  });

  it("should error if contrib branch doesn't exist", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    expect(() =>
      runVerification(
        TEST_PROJECT_DIR,
        "F-1",
        "contrib/nonexistent",
        ["src/index.ts"],
        { skipTests: true }
      )
    ).toThrow("does not exist");
  });

  it("should include timestamp in report", () => {
    initTestRepoWithContrib(
      { "src/index.ts": "export {};" },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    const before = new Date().toISOString();
    const report = runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true }
    );
    const after = new Date().toISOString();

    expect(report.timestamp >= before).toBe(true);
    expect(report.timestamp <= after).toBe(true);
  });

  it("should detect external dependency imports", () => {
    initTestRepoWithContrib(
      { "src/index.ts": 'import { secret } from "/Users/alice/private/lib";' },
      ["src/index.ts"]
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const expectedFiles = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    const report = runVerification(
      TEST_PROJECT_DIR,
      "F-1",
      "contrib/F-1",
      expectedFiles,
      { skipTests: true, skipSanitize: true }
    );

    const depCheck = report.checks.find((c) => c.name === "dependencies");
    expect(depCheck?.pass).toBe(false);
  });
});
