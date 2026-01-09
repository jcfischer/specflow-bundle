import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  unlinkSync,
  existsSync,
  mkdirSync,
  writeFileSync,
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

      // Create a mock features file that init can read
      const featuresJson = JSON.stringify([
        { id: "F-1", name: "Core model", description: "Data models", dependencies: [], priority: 1 },
        { id: "F-2", name: "CLI commands", description: "CLI interface", dependencies: ["F-1"], priority: 2 },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stdout, exitCode } = runCli(["init", "--from-features", featuresPath]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Initialized");
      expect(stdout).toContain("2 features");

      // Verify database was created
      expect(existsSync(TEST_DB_PATH)).toBe(true);

      // Verify features in database
      initDatabase(TEST_DB_PATH);
      const features = getFeatures();
      expect(features).toHaveLength(2);
      expect(features[0].id).toBe("F-1");
      expect(features[1].id).toBe("F-2");
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

      // Create features file
      mkdirSync(TEST_SPEC_DIR, { recursive: true });
      const featuresJson = JSON.stringify([
        { id: "F-1", name: "New feature", description: "New", dependencies: [], priority: 1 },
        { id: "F-2", name: "Another", description: "New", dependencies: [], priority: 2 },
      ]);
      const featuresPath = join(TEST_SPEC_DIR, "features.json");
      writeFileSync(featuresPath, featuresJson);

      const { stdout, exitCode } = runCli(["init", "--from-features", featuresPath, "--force"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("2 features");
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
