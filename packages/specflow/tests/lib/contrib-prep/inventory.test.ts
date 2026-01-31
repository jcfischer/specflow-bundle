import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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
import { classifyFile } from "../../../src/lib/contrib-prep/patterns";
import {
  generateInventory,
  getTrackedFiles,
} from "../../../src/lib/contrib-prep/inventory";
import { getContribState } from "../../../src/lib/contrib-prep/state";

const TEST_PROJECT_DIR = "/tmp/specflow-inventory-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

/**
 * Initialize a test git repo with known files
 */
function initTestRepo(files: Record<string, string>): void {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });

  // Init git repo
  execSync("git init", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });

  // Create files
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TEST_PROJECT_DIR, path);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content, "utf-8");
  }

  // Stage and commit (--no-verify to skip gitleaks hook for synthetic test fixtures)
  execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git commit --no-verify -m "initial"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
  });
}

// =============================================================================
// Pattern Classification Tests
// =============================================================================

describe("classifyFile", () => {
  it("should exclude .env", () => {
    expect(classifyFile(".env").classification).toBe("exclude");
  });

  it("should exclude .env.local", () => {
    expect(classifyFile(".env.local").classification).toBe("exclude");
  });

  it("should exclude .env.production", () => {
    expect(classifyFile(".env.production").classification).toBe("exclude");
  });

  it("should exclude settings.json", () => {
    expect(classifyFile("settings.json").classification).toBe("exclude");
  });

  it("should exclude database files", () => {
    expect(classifyFile("data.db").classification).toBe("exclude");
    expect(classifyFile("data.db-shm").classification).toBe("exclude");
    expect(classifyFile("data.db-wal").classification).toBe("exclude");
  });

  it("should exclude node_modules", () => {
    expect(classifyFile("node_modules/foo/index.js").classification).toBe("exclude");
  });

  it("should exclude MEMORY directory", () => {
    expect(classifyFile("MEMORY/session.json").classification).toBe("exclude");
  });

  it("should exclude .specflow/contrib files", () => {
    expect(
      classifyFile(".specflow/contrib/F-1/CONTRIBUTION-REGISTRY.md").classification
    ).toBe("exclude");
  });

  it("should exclude .pem files", () => {
    expect(classifyFile("cert.pem").classification).toBe("exclude");
  });

  it("should exclude .key files", () => {
    expect(classifyFile("private.key").classification).toBe("exclude");
  });

  it("should exclude bun.lock", () => {
    expect(classifyFile("bun.lock").classification).toBe("exclude");
  });

  it("should include src/ files", () => {
    expect(classifyFile("src/index.ts").classification).toBe("include");
    expect(classifyFile("src/lib/database.ts").classification).toBe("include");
  });

  it("should include tests/ files", () => {
    expect(classifyFile("tests/foo.test.ts").classification).toBe("include");
  });

  it("should include test/ files", () => {
    expect(classifyFile("test/bar.test.ts").classification).toBe("include");
  });

  it("should include templates/", () => {
    expect(classifyFile("templates/spec.md").classification).toBe("include");
  });

  it("should include migrations/", () => {
    expect(classifyFile("migrations/001_init.sql").classification).toBe("include");
  });

  it("should include package.json", () => {
    expect(classifyFile("package.json").classification).toBe("include");
  });

  it("should include tsconfig.json", () => {
    expect(classifyFile("tsconfig.json").classification).toBe("include");
  });

  it("should include README.md", () => {
    expect(classifyFile("README.md").classification).toBe("include");
  });

  it("should include LICENSE", () => {
    expect(classifyFile("LICENSE").classification).toBe("include");
  });

  it("should include .gitignore", () => {
    expect(classifyFile(".gitignore").classification).toBe("include");
  });

  it("should mark unknown files as review", () => {
    expect(classifyFile("Makefile").classification).toBe("review");
    expect(classifyFile("deploy.sh").classification).toBe("review");
    expect(classifyFile("config/custom.yaml").classification).toBe("review");
  });

  it("should handle leading ./ prefix", () => {
    expect(classifyFile("./src/index.ts").classification).toBe("include");
    expect(classifyFile("./.env").classification).toBe("exclude");
  });
});

// =============================================================================
// File Enumeration Tests
// =============================================================================

describe("getTrackedFiles", () => {
  beforeEach(() => {
    initTestRepo({
      "src/index.ts": "console.log('hello');",
      "README.md": "# Test",
    });
  });

  afterEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should list tracked files", () => {
    const files = getTrackedFiles(TEST_PROJECT_DIR);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("README.md");
  });

  it("should not list untracked files", () => {
    writeFileSync(join(TEST_PROJECT_DIR, "untracked.txt"), "test");
    const files = getTrackedFiles(TEST_PROJECT_DIR);
    expect(files).not.toContain("untracked.txt");
  });
});

// =============================================================================
// Inventory Generation Tests
// =============================================================================

describe("generateInventory", () => {
  beforeEach(() => {
    initTestRepo({
      "src/index.ts": "console.log('hello');",
      "src/lib/utils.ts": "export function foo() {}",
      "tests/index.test.ts": "test('works', () => {});",
      "migrations/001_init.sql": "CREATE TABLE foo (id TEXT);",
      "README.md": "# Test Project",
      "package.json": '{"name": "test"}',
      "tsconfig.json": '{"compilerOptions": {}}',
      ".env": "SECRET_KEY=abc123",
      ".gitignore": "node_modules/",
      "Makefile": "build:\n\techo build",
    });

    // Create specflow dir and init DB
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
    initDatabase(TEST_DB_PATH);
    addFeature({
      id: "F-1",
      name: "Test Feature",
      description: "A test feature",
      priority: 1,
    });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should classify all files", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");

    expect(result.entries.length).toBe(10);
    expect(result.included).toBeGreaterThan(0);
    expect(result.excluded).toBeGreaterThan(0);
  });

  it("should include source files", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");
    const included = result.entries
      .filter((e) => e.classification === "include")
      .map((e) => e.file);

    expect(included).toContain("src/index.ts");
    expect(included).toContain("src/lib/utils.ts");
    expect(included).toContain("tests/index.test.ts");
    expect(included).toContain("package.json");
  });

  it("should exclude .env", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");
    const excluded = result.entries
      .filter((e) => e.classification === "exclude")
      .map((e) => e.file);

    expect(excluded).toContain(".env");
  });

  it("should mark Makefile for review", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");
    const review = result.entries
      .filter((e) => e.classification === "review")
      .map((e) => e.file);

    expect(review).toContain("Makefile");
  });

  it("should write CONTRIBUTION-REGISTRY.md", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");

    expect(existsSync(result.registryPath)).toBe(true);
    const content = readFileSync(result.registryPath, "utf-8");
    expect(content).toContain("# Contribution Registry: F-1");
    expect(content).toContain("## Included Files");
    expect(content).toContain("## Excluded Files");
    expect(content).toContain("## Summary");
  });

  it("should include file counts in registry", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");
    const content = readFileSync(result.registryPath, "utf-8");

    expect(content).toContain(`**Included:** ${result.included}`);
    expect(content).toContain(`**Excluded:** ${result.excluded}`);
    expect(content).toContain(`**Total:** ${result.entries.length}`);
  });

  it("should update state with inventory counts", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");
    const state = getContribState("F-1");

    expect(state).not.toBeNull();
    expect(state!.inventoryIncluded).toBe(result.included);
    expect(state!.inventoryExcluded).toBe(result.excluded);
  });

  it("should advance to gate 1", () => {
    generateInventory(TEST_PROJECT_DIR, "F-1");
    const state = getContribState("F-1");

    expect(state!.gate).toBe(1);
  });

  it("should create contrib state if not exists", () => {
    expect(getContribState("F-1")).toBeNull();

    generateInventory(TEST_PROJECT_DIR, "F-1");

    expect(getContribState("F-1")).not.toBeNull();
  });

  it("should store registry in correct directory", () => {
    const result = generateInventory(TEST_PROJECT_DIR, "F-1");
    const expectedDir = join(TEST_PROJECT_DIR, ".specflow", "contrib", "F-1");

    expect(result.registryPath).toBe(
      join(expectedDir, "CONTRIBUTION-REGISTRY.md")
    );
  });
});
