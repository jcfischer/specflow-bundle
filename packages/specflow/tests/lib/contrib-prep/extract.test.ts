import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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
import {
  runExtraction,
  isWorkingTreeClean,
  tagExists,
  branchExists,
  getCurrentBranch,
  getRefHash,
} from "../../../src/lib/contrib-prep/extract";
import {
  getContribState,
  createContribState,
  updateContribGate,
} from "../../../src/lib/contrib-prep/state";

const TEST_PROJECT_DIR = "/tmp/specflow-extract-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

/**
 * Create a test git repo with a base commit and feature files.
 *
 * Two commits:
 * 1. Base commit (on "main"): just .gitignore and README — tagged as "base"
 * 2. Feature commit (on "main"): adds all provided files
 *
 * This simulates the real workflow where the contrib branch is created from
 * a clean base that doesn't have the feature files yet.
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

  // Commit 1: base files only
  writeFileSync(join(TEST_PROJECT_DIR, ".gitignore"), ".specflow/\n", "utf-8");
  writeFileSync(join(TEST_PROJECT_DIR, "README.base.md"), "# Base\n", "utf-8");
  execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git commit --no-verify -m "base"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });

  // Tag the base commit so we can use it as baseBranch
  execSync('git tag "base-point"', { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

  // Commit 2: add feature files
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
  try { closeDatabase(); } catch { /* ignore */ }
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
}

// =============================================================================
// Git Helper Tests
// =============================================================================

describe("isWorkingTreeClean", () => {
  afterEach(cleanup);

  it("should return true for clean repo", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    expect(isWorkingTreeClean(TEST_PROJECT_DIR)).toBe(true);
  });

  it("should return false for dirty repo", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    writeFileSync(join(TEST_PROJECT_DIR, "src/index.ts"), "export { foo };");
    expect(isWorkingTreeClean(TEST_PROJECT_DIR)).toBe(false);
  });

  it("should return false for untracked files", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    writeFileSync(join(TEST_PROJECT_DIR, "new-file.ts"), "export {};");
    expect(isWorkingTreeClean(TEST_PROJECT_DIR)).toBe(false);
  });
});

describe("tagExists", () => {
  afterEach(cleanup);

  it("should return false for non-existent tag", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    expect(tagExists(TEST_PROJECT_DIR, "v1.0.0")).toBe(false);
  });

  it("should return true for existing tag", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    execSync('git tag -a "v1.0.0" -m "test tag"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    expect(tagExists(TEST_PROJECT_DIR, "v1.0.0")).toBe(true);
  });
});

describe("branchExists", () => {
  afterEach(cleanup);

  it("should return true for existing branch", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    expect(branchExists(TEST_PROJECT_DIR, "main")).toBe(true);
  });

  it("should return false for non-existent branch", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    expect(branchExists(TEST_PROJECT_DIR, "feature/nope")).toBe(false);
  });
});

describe("getCurrentBranch", () => {
  afterEach(cleanup);

  it("should return current branch name", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    expect(getCurrentBranch(TEST_PROJECT_DIR)).toBe("main");
  });
});

describe("getRefHash", () => {
  afterEach(cleanup);

  it("should return hash for HEAD", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    const hash = getRefHash(TEST_PROJECT_DIR, "HEAD");
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("should return hash for tag", () => {
    initTestRepo({ "src/index.ts": "export {};" });
    execSync('git tag -a "v1.0.0" -m "test"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    const hash = getRefHash(TEST_PROJECT_DIR, "v1.0.0");
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });
});

// =============================================================================
// Extraction Tests
// =============================================================================

describe("runExtraction", () => {
  beforeEach(() => {
    initTestRepo({
      "src/index.ts": 'console.log("hello");',
      "src/lib/utils.ts": "export function add(a: number, b: number) { return a + b; }",
      "tests/index.test.ts": 'test("works", () => {});',
      "README.md": "# Test Project",
      "package.json": '{"name": "test"}',
    });
  });

  afterEach(cleanup);

  it("should create annotated tag", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts", "src/lib/utils.ts", "tests/index.test.ts"],
      { baseBranch: "base-point" },
    );

    expect(tagExists(TEST_PROJECT_DIR, result.tagName)).toBe(true);
    expect(result.tagName).toBe("contrib-prep/F-1");
  });

  it("should create contrib branch", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    expect(branchExists(TEST_PROJECT_DIR, "contrib/F-1")).toBe(true);
    expect(result.contribBranch).toBe("contrib/F-1");
  });

  it("should checkout included files on contrib branch", () => {
    runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts", "src/lib/utils.ts"],
      { baseBranch: "base-point" },
    );

    // Switch to contrib branch and check files exist
    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    const files = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");

    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/lib/utils.ts");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });

  it("should not include excluded files on contrib branch", () => {
    // Only extract src/index.ts, not README or tests
    runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    const files = execSync("git ls-files", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n");

    // These were not in includedFiles
    expect(files).not.toContain("package.json");
    expect(files).not.toContain("tests/index.test.ts");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });

  it("should return to original branch after extraction", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    expect(getCurrentBranch(TEST_PROJECT_DIR)).toBe("main");
    expect(result.originalBranch).toBe("main");
  });

  it("should report correct file count", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts", "src/lib/utils.ts", "tests/index.test.ts"],
      { baseBranch: "base-point" },
    );

    expect(result.filesExtracted).toBe(3);
  });

  it("should return tag hash", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    expect(result.tagHash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("should use custom tag name", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { tagName: "my-custom-tag-v1", baseBranch: "base-point" },
    );

    expect(result.tagName).toBe("my-custom-tag-v1");
    expect(tagExists(TEST_PROJECT_DIR, "my-custom-tag-v1")).toBe(true);
  });

  it("should use custom base branch", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    expect(result.contribBranch).toBe("contrib/F-1");
  });

  // ── Error cases ──────────────────────────────────────────────────────────

  it("should abort if working tree is dirty", () => {
    writeFileSync(join(TEST_PROJECT_DIR, "src/index.ts"), "modified");

    expect(() =>
      runExtraction(TEST_PROJECT_DIR, "F-1", ["src/index.ts"], { baseBranch: "base-point" })
    ).toThrow("Working tree is not clean");
  });

  it("should abort if tag already exists", () => {
    execSync('git tag -a "contrib-prep/F-1" -m "existing"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    expect(() =>
      runExtraction(TEST_PROJECT_DIR, "F-1", ["src/index.ts"], { baseBranch: "base-point" })
    ).toThrow("already exists");
  });

  it("should abort if contrib branch already exists", () => {
    execSync("git checkout -b contrib/F-1", {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });
    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });

    expect(() =>
      runExtraction(TEST_PROJECT_DIR, "F-1", ["src/index.ts"], { baseBranch: "base-point" })
    ).toThrow("already exists");
  });

  it("should abort if no files to extract", () => {
    expect(() =>
      runExtraction(TEST_PROJECT_DIR, "F-1", [], { baseBranch: "base-point" })
    ).toThrow("No files to extract");
  });

  // ── Dry-run ──────────────────────────────────────────────────────────────

  it("should not create tag in dry-run mode", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { dryRun: true, baseBranch: "base-point" },
    );

    expect(result.tagHash).toBe("(dry-run)");
    expect(tagExists(TEST_PROJECT_DIR, "contrib-prep/F-1")).toBe(false);
    expect(branchExists(TEST_PROJECT_DIR, "contrib/F-1")).toBe(false);
  });

  it("should return expected values in dry-run", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts", "src/lib/utils.ts"],
      { dryRun: true, baseBranch: "base-point" },
    );

    expect(result.tagName).toBe("contrib-prep/F-1");
    expect(result.contribBranch).toBe("contrib/F-1");
    expect(result.filesExtracted).toBe(2);
    expect(result.originalBranch).toBe("main");
  });

  // ── State updates ────────────────────────────────────────────────────────

  it("should update state with tag info", () => {
    createContribState("F-1");
    updateContribGate("F-1", 2);

    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    const state = getContribState("F-1");
    expect(state).not.toBeNull();
    expect(state!.tagName).toBe(result.tagName);
    expect(state!.tagHash).toBe(result.tagHash);
  });

  it("should update state with branch info", () => {
    createContribState("F-1");
    updateContribGate("F-1", 2);

    runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    const state = getContribState("F-1");
    expect(state!.contribBranch).toBe("contrib/F-1");
  });

  it("should advance gate to 4", () => {
    createContribState("F-1");
    updateContribGate("F-1", 2);

    runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    const state = getContribState("F-1");
    expect(state!.gate).toBe(4);
  });

  it("should create state if not exists", () => {
    expect(getContribState("F-1")).toBeNull();

    runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    expect(getContribState("F-1")).not.toBeNull();
  });

  it("should include timestamp in result", () => {
    const before = new Date().toISOString();
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );
    const after = new Date().toISOString();

    expect(result.timestamp >= before).toBe(true);
    expect(result.timestamp <= after).toBe(true);
  });

  // ── Commit on contrib branch ─────────────────────────────────────────────

  it("should have a commit on contrib branch with structured message", () => {
    runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { baseBranch: "base-point" },
    );

    execSync('git checkout "contrib/F-1"', {
      cwd: TEST_PROJECT_DIR,
      stdio: "pipe",
    });

    const log = execSync("git log --oneline -1", {
      cwd: TEST_PROJECT_DIR,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    expect(log).toContain("contrib: F-1");

    execSync("git checkout main", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  });

  it("should skip files that don't exist at tag", () => {
    const result = runExtraction(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts", "src/nonexistent.ts"],
      { baseBranch: "base-point" },
    );

    // nonexistent.ts should be skipped, only index.ts extracted
    expect(result.filesExtracted).toBe(1);
  });
});
