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
import {
  scanCustomPatterns,
  loadAllowlist,
  runSanitization,
} from "../../../src/lib/contrib-prep/sanitize";
import { getContribState, createContribState } from "../../../src/lib/contrib-prep/state";

const TEST_PROJECT_DIR = "/tmp/specflow-sanitize-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

/**
 * Initialize a test project with known files
 */
function initTestProject(files: Record<string, string>): void {
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

  // Stage and commit
  execSync("git add -A", { cwd: TEST_PROJECT_DIR, stdio: "pipe" });
  execSync('git commit --no-verify -m "initial"', {
    cwd: TEST_PROJECT_DIR,
    stdio: "pipe",
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
}

// =============================================================================
// Custom Pattern Scanner Tests
// =============================================================================

describe("scanCustomPatterns", () => {
  afterEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should detect macOS personal paths", () => {
    initTestProject({
      "src/config.ts": 'const path = "/Users/john/projects/myapp";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/config.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("personal-path");
    expect(findings[0].match).toContain("/Users/john/");
    expect(findings[0].file).toBe("src/config.ts");
    expect(findings[0].line).toBe(1);
    closeDatabase();
  });

  it("should detect Linux personal paths", () => {
    initTestProject({
      "src/config.ts": 'const path = "/home/john/projects/myapp";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/config.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("personal-path-linux");
    expect(findings[0].match).toContain("/home/john/");
    closeDatabase();
  });

  it("should detect email addresses in source files", () => {
    initTestProject({
      "src/contact.ts": 'const email = "john@example.com";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/contact.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("email-address");
    expect(findings[0].match).toBe("john@example.com");
    closeDatabase();
  });

  it("should skip emails in markdown files", () => {
    initTestProject({
      "docs/contact.md": "Email us at support@example.com",
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["docs/contact.md"]);
    const emailFindings = findings.filter((f) => f.pattern === "email-address");

    expect(emailFindings.length).toBe(0);
    closeDatabase();
  });

  it("should skip emails in .txt files", () => {
    initTestProject({
      "notes.txt": "Contact: hello@world.org",
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["notes.txt"]);
    const emailFindings = findings.filter((f) => f.pattern === "email-address");

    expect(emailFindings.length).toBe(0);
    closeDatabase();
  });

  it("should skip emails in .html files", () => {
    initTestProject({
      "page.html": '<a href="mailto:info@site.com">info@site.com</a>',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["page.html"]);
    const emailFindings = findings.filter((f) => f.pattern === "email-address");

    expect(emailFindings.length).toBe(0);
    closeDatabase();
  });

  it("should detect hardcoded IPs", () => {
    initTestProject({
      "src/api.ts": 'const server = "192.168.1.100";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/api.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("hardcoded-ip");
    expect(findings[0].match).toBe("192.168.1.100");
    closeDatabase();
  });

  it("should skip localhost IP 127.0.0.1", () => {
    initTestProject({
      "src/api.ts": 'const server = "127.0.0.1";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/api.ts"]);
    const ipFindings = findings.filter((f) => f.pattern === "hardcoded-ip");

    expect(ipFindings.length).toBe(0);
    closeDatabase();
  });

  it("should skip 0.0.0.0", () => {
    initTestProject({
      "src/api.ts": 'const bind = "0.0.0.0";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/api.ts"]);
    const ipFindings = findings.filter((f) => f.pattern === "hardcoded-ip");

    expect(ipFindings.length).toBe(0);
    closeDatabase();
  });

  it("should skip 255.255.255.255", () => {
    initTestProject({
      "src/net.ts": 'const broadcast = "255.255.255.255";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/net.ts"]);
    const ipFindings = findings.filter((f) => f.pattern === "hardcoded-ip");

    expect(ipFindings.length).toBe(0);
    closeDatabase();
  });

  it("should detect vault references", () => {
    initTestProject({
      "src/secrets.ts": 'const key = "vault://secret/data/api-key";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/secrets.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("vault-reference");
    expect(findings[0].match).toContain("vault://");
    closeDatabase();
  });

  it("should detect 1Password references", () => {
    initTestProject({
      "src/config.ts": 'const token = "op://vault/item/field";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/config.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("vault-reference");
    expect(findings[0].match).toContain("op://");
    closeDatabase();
  });

  it("should return empty for clean files", () => {
    initTestProject({
      "src/clean.ts": "export function add(a: number, b: number) { return a + b; }",
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/clean.ts"]);

    expect(findings.length).toBe(0);
    closeDatabase();
  });

  it("should report correct line numbers", () => {
    initTestProject({
      "src/multi.ts": [
        "const a = 1;",
        "const b = 2;",
        'const path = "/Users/alice/work";',
        "const c = 3;",
      ].join("\n"),
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/multi.ts"]);

    expect(findings.length).toBe(1);
    expect(findings[0].line).toBe(3);
    closeDatabase();
  });

  it("should find multiple patterns in same file", () => {
    initTestProject({
      "src/dirty.ts": [
        'const path = "/Users/bob/work";',
        'const email = "bob@corp.com";',
        'const ip = "10.0.0.5";',
      ].join("\n"),
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/dirty.ts"]);

    expect(findings.length).toBe(3);
    const patterns = findings.map((f) => f.pattern).sort();
    expect(patterns).toEqual(["email-address", "hardcoded-ip", "personal-path"]);
    closeDatabase();
  });

  it("should scan multiple files", () => {
    initTestProject({
      "src/a.ts": 'const path = "/Users/alice/work";',
      "src/b.ts": 'const ip = "10.0.0.1";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, [
      "src/a.ts",
      "src/b.ts",
    ]);

    expect(findings.length).toBe(2);
    closeDatabase();
  });

  it("should skip non-existent files gracefully", () => {
    initTestProject({
      "src/exists.ts": "export {};",
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, [
      "src/exists.ts",
      "src/nope.ts",
    ]);

    expect(findings.length).toBe(0);
    closeDatabase();
  });

  it("should include suggestion in findings", () => {
    initTestProject({
      "src/config.ts": 'const path = "/Users/dev/project";',
    });

    const findings = scanCustomPatterns(TEST_PROJECT_DIR, ["src/config.ts"]);

    expect(findings[0].suggestion).toContain("environment variable");
    expect(findings[0].allowlistable).toBe(true);
    closeDatabase();
  });
});

// =============================================================================
// Allowlist Tests
// =============================================================================

describe("loadAllowlist", () => {
  afterEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should return empty array when no allowlist exists", () => {
    initTestProject({ "src/index.ts": "export {};" });

    const allowlist = loadAllowlist(TEST_PROJECT_DIR, "F-1");

    expect(allowlist).toEqual([]);
    closeDatabase();
  });

  it("should load entries from JSON file", () => {
    initTestProject({ "src/index.ts": "export {};" });

    const contribDir = join(TEST_PROJECT_DIR, ".specflow", "contrib", "F-1");
    mkdirSync(contribDir, { recursive: true });
    writeFileSync(
      join(contribDir, "allowlist.json"),
      JSON.stringify([
        { file: "src/config.ts", line: 5, pattern: "personal-path" },
      ]),
      "utf-8"
    );

    const allowlist = loadAllowlist(TEST_PROJECT_DIR, "F-1");

    expect(allowlist.length).toBe(1);
    expect(allowlist[0].file).toBe("src/config.ts");
    expect(allowlist[0].line).toBe(5);
    expect(allowlist[0].pattern).toBe("personal-path");
    closeDatabase();
  });

  it("should return empty array for invalid JSON", () => {
    initTestProject({ "src/index.ts": "export {};" });

    const contribDir = join(TEST_PROJECT_DIR, ".specflow", "contrib", "F-1");
    mkdirSync(contribDir, { recursive: true });
    writeFileSync(join(contribDir, "allowlist.json"), "not json", "utf-8");

    const allowlist = loadAllowlist(TEST_PROJECT_DIR, "F-1");

    expect(allowlist).toEqual([]);
    closeDatabase();
  });
});

// =============================================================================
// Full Sanitization Orchestrator Tests
// =============================================================================

describe("runSanitization", () => {
  beforeEach(() => {
    initTestProject({
      "src/index.ts": "export {};",
      "src/clean.ts": "export function add(a: number, b: number) { return a + b; }",
    });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should pass with clean files", () => {
    const report = runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts", "src/clean.ts"],
      { skipGitleaks: true }
    );

    expect(report.pass).toBe(true);
    expect(report.findings.length).toBe(0);
    expect(report.customFindings).toBe(0);
  });

  it("should fail with dirty files", () => {
    // Add a dirty file
    writeFileSync(
      join(TEST_PROJECT_DIR, "src/dirty.ts"),
      'const path = "/Users/alice/work";',
      "utf-8"
    );

    const report = runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/dirty.ts"],
      { skipGitleaks: true }
    );

    expect(report.pass).toBe(false);
    expect(report.findings.length).toBe(1);
    expect(report.customFindings).toBe(1);
  });

  it("should apply allowlist to suppress findings", () => {
    writeFileSync(
      join(TEST_PROJECT_DIR, "src/dirty.ts"),
      'const path = "/Users/alice/work";',
      "utf-8"
    );

    // Create allowlist
    const contribDir = join(TEST_PROJECT_DIR, ".specflow", "contrib", "F-1");
    mkdirSync(contribDir, { recursive: true });
    writeFileSync(
      join(contribDir, "allowlist.json"),
      JSON.stringify([
        { file: "src/dirty.ts", line: 1, pattern: "personal-path" },
      ]),
      "utf-8"
    );

    const report = runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/dirty.ts"],
      { skipGitleaks: true }
    );

    expect(report.pass).toBe(true);
    expect(report.findings.length).toBe(0);
    // customFindings still counts pre-allowlist
    expect(report.customFindings).toBe(1);
  });

  it("should write report to contrib directory", () => {
    runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { skipGitleaks: true }
    );

    const reportPath = join(
      TEST_PROJECT_DIR,
      ".specflow",
      "contrib",
      "F-1",
      "sanitization-report.json"
    );
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    expect(report.pass).toBe(true);
    expect(report.timestamp).toBeDefined();
  });

  it("should update state with pass status", () => {
    createContribState("F-1");

    runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { skipGitleaks: true }
    );

    const state = getContribState("F-1");
    expect(state).not.toBeNull();
    expect(state!.sanitizationPass).toBe(true);
    expect(state!.sanitizationFindings).toBe(0);
  });

  it("should update state with fail status", () => {
    createContribState("F-1");
    writeFileSync(
      join(TEST_PROJECT_DIR, "src/dirty.ts"),
      'const path = "/Users/alice/work";',
      "utf-8"
    );

    runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/dirty.ts"],
      { skipGitleaks: true }
    );

    const state = getContribState("F-1");
    expect(state!.sanitizationPass).toBe(false);
    expect(state!.sanitizationFindings).toBe(1);
  });

  it("should advance gate to 2 on pass", () => {
    createContribState("F-1");
    // Advance to gate 1 first (inventory)
    const { updateContribGate } = require("../../../src/lib/contrib-prep/state");
    updateContribGate("F-1", 1);

    runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { skipGitleaks: true }
    );

    const state = getContribState("F-1");
    expect(state!.gate).toBe(2);
  });

  it("should not advance gate on fail", () => {
    createContribState("F-1");
    const { updateContribGate } = require("../../../src/lib/contrib-prep/state");
    updateContribGate("F-1", 1);

    writeFileSync(
      join(TEST_PROJECT_DIR, "src/dirty.ts"),
      'const path = "/Users/alice/work";',
      "utf-8"
    );

    runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/dirty.ts"],
      { skipGitleaks: true }
    );

    const state = getContribState("F-1");
    expect(state!.gate).toBe(1);
  });

  it("should include timestamp in report", () => {
    const before = new Date().toISOString();
    const report = runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { skipGitleaks: true }
    );
    const after = new Date().toISOString();

    expect(report.timestamp >= before).toBe(true);
    expect(report.timestamp <= after).toBe(true);
  });

  it("should create contrib state if not exists", () => {
    expect(getContribState("F-1")).toBeNull();

    runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      ["src/index.ts"],
      { skipGitleaks: true }
    );

    expect(getContribState("F-1")).not.toBeNull();
  });

  it("should handle empty file list", () => {
    const report = runSanitization(
      TEST_PROJECT_DIR,
      "F-1",
      [],
      { skipGitleaks: true }
    );

    expect(report.pass).toBe(true);
    expect(report.findings.length).toBe(0);
  });
});
