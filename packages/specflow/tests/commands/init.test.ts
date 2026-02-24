import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  unlinkSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getStats,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-init-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);
const TEST_SPEC_DIR = join(TEST_PROJECT_DIR, ".specify/specs/test-app");

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

describe("init command", () => {
  beforeEach(() => {
    // Clean and recreate test directory
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  describe("with --from-spec flag", () => {
    it("should initialize from existing spec file with mock features", () => {
      // Create a mock spec file
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const specPath = join(TEST_SPEC_DIR, "spec.md");
      writeFileSync(specPath, `# Test App\n\nA simple test application.`);

      // Create a mock features file that init can read (default minimum 5 features required)
      const featuresJson = JSON.stringify([
        { id: "F-1", name: "Core model", description: "Data models", dependencies: [], priority: 1 },
        { id: "F-2", name: "CLI commands", description: "CLI interface", dependencies: ["F-1"], priority: 2 },
        { id: "F-3", name: "Database layer", description: "SQLite storage", dependencies: ["F-1"], priority: 3 },
        { id: "F-4", name: "Config system", description: "Configuration", dependencies: [], priority: 4 },
        { id: "F-5", name: "Testing utils", description: "Test helpers", dependencies: ["F-1"], priority: 5 },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stdout, exitCode } = runCli(["init", "--from-features", featuresPath]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Initialized");
      expect(stdout).toContain("5 features");

      // Verify database was created
      expect(existsSync(TEST_DB_PATH)).toBe(true);

      // Verify features in database
      initDatabase(TEST_DB_PATH);
      const features = getFeatures();
      expect(features).toHaveLength(5);
      // Features are sorted by priority, verify all IDs are present
      const featureIds = features.map(f => f.id).sort();
      expect(featureIds).toEqual(["F-1", "F-2", "F-3", "F-4", "F-5"]);
    });

    it("should not overwrite existing database without --force", () => {
      // Create existing database in new location
      mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
      initDatabase(TEST_DB_PATH);
      closeDatabase();

      // Create features file
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresJson = JSON.stringify([
        { id: "F-1", name: "Test", description: "Test", dependencies: [], priority: 1 },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stderr, exitCode } = runCli(["init", "--from-features", featuresPath]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("already initialized");
    });

    it("should overwrite with --force flag", () => {
      // Create existing database with a feature
      mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
      initDatabase(TEST_DB_PATH);
      closeDatabase();

      // Create features file (default minimum 5 features required)
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresJson = JSON.stringify([
        { id: "F-1", name: "New feature", description: "New", dependencies: [], priority: 1 },
        { id: "F-2", name: "Another", description: "New", dependencies: [], priority: 2 },
        { id: "F-3", name: "Third one", description: "New", dependencies: [], priority: 3 },
        { id: "F-4", name: "Fourth one", description: "New", dependencies: [], priority: 4 },
        { id: "F-5", name: "Fifth one", description: "New", dependencies: [], priority: 5 },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stdout, exitCode } = runCli(["init", "--from-features", featuresPath, "--force"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("5 features");
    });
  });

  describe("batch mode", () => {
    it("should error when --batch is used without description or --from-features/--from-spec", () => {
      const { stderr, exitCode } = runCli(["init", "--batch"]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Please provide a description");
      expect(stderr).toContain("Batch mode requires");
    });

    it("should store rich decomposition fields from features JSON", () => {
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresJson = JSON.stringify([
        {
          id: "F-1", name: "Core model", description: "Data models",
          dependencies: [], priority: 1,
          problemType: "manual_workaround", urgency: "blocking_work",
          primaryUser: "developers", integrationScope: "standalone",
        },
        {
          id: "F-2", name: "CLI commands", description: "CLI interface",
          dependencies: ["F-1"], priority: 2,
          problemType: "impossible", urgency: "user_demand",
          primaryUser: "end_users", integrationScope: "extends_existing",
        },
        {
          id: "F-3", name: "Database layer", description: "SQLite storage",
          dependencies: ["F-1"], priority: 3,
          problemType: "scattered", urgency: "growing_pain",
          primaryUser: "admins", integrationScope: "multiple_integrations",
        },
        {
          id: "F-4", name: "Config system", description: "Configuration",
          dependencies: [], priority: 4,
          problemType: "quality_issues", urgency: "external_deadline",
          primaryUser: "mixed", integrationScope: "external_apis",
        },
        {
          id: "F-5", name: "Testing utils", description: "Test helpers",
          dependencies: ["F-1"], priority: 5,
        },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stdout, exitCode } = runCli(["init", "--from-features", featuresPath]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("5 features");

      // Verify rich fields were stored in database
      initDatabase(TEST_DB_PATH);
      const features = getFeatures();

      const f1 = features.find(f => f.id === "F-1");
      expect(f1?.problemType).toBe("manual_workaround");
      expect(f1?.urgency).toBe("blocking_work");
      expect(f1?.primaryUser).toBe("developers");
      expect(f1?.integrationScope).toBe("standalone");

      const f2 = features.find(f => f.id === "F-2");
      expect(f2?.problemType).toBe("impossible");
      expect(f2?.primaryUser).toBe("end_users");

      // F-5 has no rich fields - should be null/undefined (DB stores null)
      const f5 = features.find(f => f.id === "F-5");
      expect(f5?.problemType).toBeFalsy();
    });

    it("should work with --batch and --from-features combined", () => {
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresJson = JSON.stringify([
        { id: "F-1", name: "Feature A", description: "Desc A", dependencies: [], priority: 1 },
        { id: "F-2", name: "Feature B", description: "Desc B", dependencies: [], priority: 2 },
        { id: "F-3", name: "Feature C", description: "Desc C", dependencies: [], priority: 3 },
        { id: "F-4", name: "Feature D", description: "Desc D", dependencies: [], priority: 4 },
        { id: "F-5", name: "Feature E", description: "Desc E", dependencies: [], priority: 5 },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stdout, exitCode } = runCli(["init", "--batch", "--from-features", featuresPath]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("5 features");
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    it("should not output interview prompt with --batch flag and description", () => {
      // This calls Claude for decomposition — will fail in test (Claude unavailable/timeout)
      // but should NOT show the interactive interview prompt
      const result = spawnSync("bun", ["run", CLI_PATH, "init", "--batch", "A task management app"], {
        encoding: "utf-8",
        cwd: TEST_PROJECT_DIR,
        env: { ...process.env, PATH: "/usr/bin:/bin" }, // Remove claude from PATH to fail fast
        timeout: 5000,
      });
      const stdout = result.stdout?.toString() ?? "";
      const stderr = result.stderr?.toString() ?? "";

      // Should NOT output the interactive interview prompt
      expect(stdout).not.toContain("SPECFLOW INIT: Interview Phase");
      expect(stdout).not.toContain("Copy this prompt");
      // Should fail (Claude not available) or error
      expect(result.status).not.toBe(0);
    });
  });

  describe("gitignore management", () => {
    const featuresJson = JSON.stringify([
      { id: "F-1", name: "A", description: "A", dependencies: [], priority: 1 },
      { id: "F-2", name: "B", description: "B", dependencies: [], priority: 2 },
      { id: "F-3", name: "C", description: "C", dependencies: [], priority: 3 },
      { id: "F-4", name: "D", description: "D", dependencies: [], priority: 4 },
      { id: "F-5", name: "E", description: "E", dependencies: [], priority: 5 },
    ]);

    function initWithFeatures() {
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);
      return runCli(["init", "--from-features", featuresPath]);
    }

    it("should create .gitignore with .specflow/ entry when none exists", () => {
      const { exitCode } = initWithFeatures();
      expect(exitCode).toBe(0);

      const gitignorePath = join(TEST_PROJECT_DIR, ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);
      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain(".specflow/");
    });

    it("should append .specflow/ to existing .gitignore without removing content", () => {
      const gitignorePath = join(TEST_PROJECT_DIR, ".gitignore");
      writeFileSync(gitignorePath, "node_modules/\ndist/\n");

      const { exitCode } = initWithFeatures();
      expect(exitCode).toBe(0);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain("dist/");
      expect(content).toContain(".specflow/");
    });

    it("should not duplicate .specflow/ entry if already present", () => {
      const gitignorePath = join(TEST_PROJECT_DIR, ".gitignore");
      writeFileSync(gitignorePath, "node_modules/\n.specflow/\n");

      const { exitCode } = initWithFeatures();
      expect(exitCode).toBe(0);

      const content = readFileSync(gitignorePath, "utf-8");
      const matches = content.match(/\.specflow\//g);
      expect(matches).toHaveLength(1);
    });
  });

  describe("validation", () => {
    it("should reject features file with invalid JSON", () => {
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, "not valid json");

      const { stderr, exitCode } = runCli(["init", "--from-features", featuresPath]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Failed");
    });

    it("should reject non-existent features file", () => {
      const { stderr, exitCode } = runCli(["init", "--from-features", "/nonexistent/features.json"]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("not found");
    });
  });
});
