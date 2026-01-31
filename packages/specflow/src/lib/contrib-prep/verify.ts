/**
 * Contrib Prep Verification Module
 * Validates the contrib branch independently against the inventory
 *
 * Checks:
 * 1. Inventory match — files on contrib branch match expected list
 * 2. Re-sanitization — no secrets/PII on contrib branch
 * 3. Dependency check — no imports reference external/absolute paths
 * 4. Isolation test — `bun test` passes on contrib branch (optional)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { scanCustomPatterns } from "./sanitize";
import {
  getContribState,
  createContribState,
  updateContribVerification,
  updateContribGate,
} from "./state";
import { getCurrentBranch, branchExists } from "./extract";

// =============================================================================
// Types
// =============================================================================

export interface VerificationCheck {
  name: string;
  pass: boolean;
  details: string;
}

export interface VerificationReport {
  pass: boolean;
  checks: VerificationCheck[];
  timestamp: string;
}

export interface VerificationOptions {
  /** Skip `bun test` isolation check */
  skipTests?: boolean;
  /** Skip re-sanitization check */
  skipSanitize?: boolean;
}

// =============================================================================
// Individual Checks
// =============================================================================

/**
 * Check that files on the contrib branch match the expected list.
 * Returns extras and missing files.
 */
export function checkInventoryMatch(
  projectPath: string,
  expectedFiles: string[]
): VerificationCheck {
  const actualFiles = execSync("git ls-files", {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: "pipe",
  })
    .trim()
    .split("\n")
    .filter((f) => f.length > 0);

  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);

  const extras = actualFiles.filter((f) => !expectedSet.has(f));
  const missing = expectedFiles.filter((f) => !actualSet.has(f));

  const pass = extras.length === 0 && missing.length === 0;

  let details = `Expected: ${expectedFiles.length}, Found: ${actualFiles.length}`;
  if (extras.length > 0) {
    details += `\nExtra files: ${extras.join(", ")}`;
  }
  if (missing.length > 0) {
    details += `\nMissing files: ${missing.join(", ")}`;
  }

  return { name: "inventory-match", pass, details };
}

/**
 * Re-run sanitization on the contrib branch files.
 */
export function checkSanitization(
  projectPath: string,
  files: string[]
): VerificationCheck {
  const findings = scanCustomPatterns(projectPath, files);
  const pass = findings.length === 0;

  let details = `Findings: ${findings.length}`;
  if (findings.length > 0) {
    const summaries = findings
      .slice(0, 5)
      .map((f) => `${f.file}:${f.line} [${f.pattern}]`);
    details += `\n${summaries.join("\n")}`;
    if (findings.length > 5) {
      details += `\n... and ${findings.length - 5} more`;
    }
  }

  return { name: "sanitization", pass, details };
}

/**
 * Check for external/absolute path references in imports.
 * Scans .ts, .js, .tsx, .jsx files for import statements with absolute paths.
 */
export function checkDependencies(
  projectPath: string,
  files: string[]
): VerificationCheck {
  const codeExtensions = new Set([".ts", ".js", ".tsx", ".jsx", ".mts", ".mjs"]);
  const externalRefs: string[] = [];

  // Patterns that indicate external/absolute path imports
  const importPatterns = [
    // import from "/Users/..." or "/home/..."
    /(?:import|require)\s*\(?.*['"]\/(?:Users|home)\/[^'"]+['"]/g,
    // import from absolute paths starting with /
    /(?:import|require)\s*\(?.*['"]\/[a-zA-Z][^'"]*['"]/g,
  ];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!codeExtensions.has(ext)) continue;

    const fullPath = join(projectPath, file);
    if (!existsSync(fullPath)) continue;

    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of importPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          externalRefs.push(`${file}:${i + 1}`);
        }
      }
    }
  }

  const pass = externalRefs.length === 0;
  let details = `External references: ${externalRefs.length}`;
  if (externalRefs.length > 0) {
    details += `\n${externalRefs.slice(0, 5).join("\n")}`;
    if (externalRefs.length > 5) {
      details += `\n... and ${externalRefs.length - 5} more`;
    }
  }

  return { name: "dependencies", pass, details };
}

/**
 * Run `bun test` on the contrib branch to verify isolation.
 */
export function checkTests(projectPath: string): VerificationCheck {
  try {
    const output = execSync("bun test", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 120000,
    });
    return {
      name: "tests",
      pass: true,
      details: `Tests passed\n${output.trim().split("\n").slice(-3).join("\n")}`,
    };
  } catch (error: any) {
    const stderr = error.stderr?.toString() ?? "";
    const stdout = error.stdout?.toString() ?? "";
    return {
      name: "tests",
      pass: false,
      details: `Tests failed\n${(stderr || stdout).trim().split("\n").slice(-5).join("\n")}`,
    };
  }
}

// =============================================================================
// Orchestrator
// =============================================================================

/**
 * Run full verification on the contrib branch.
 *
 * Switches to the contrib branch, runs all checks, switches back,
 * writes the report, and updates state.
 */
export function runVerification(
  projectPath: string,
  featureId: string,
  contribBranch: string,
  expectedFiles: string[],
  options: VerificationOptions = {}
): VerificationReport {
  // Verify contrib branch exists
  if (!branchExists(projectPath, contribBranch)) {
    throw new Error(
      `Contrib branch '${contribBranch}' does not exist. Run --extract first.`
    );
  }

  const originalBranch = getCurrentBranch(projectPath);
  const checks: VerificationCheck[] = [];

  try {
    // Switch to contrib branch
    execSync(`git checkout "${contribBranch}"`, {
      cwd: projectPath,
      stdio: "pipe",
    });

    // 1. Inventory match
    checks.push(checkInventoryMatch(projectPath, expectedFiles));

    // 2. Re-sanitization (on the contrib branch files)
    if (!options.skipSanitize) {
      const contribFiles = execSync("git ls-files", {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: "pipe",
      })
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      checks.push(checkSanitization(projectPath, contribFiles));
    }

    // 3. Dependency check
    const contribFilesForDeps = execSync("git ls-files", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    })
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);

    checks.push(checkDependencies(projectPath, contribFilesForDeps));

    // 4. Isolation test (optional)
    if (!options.skipTests) {
      checks.push(checkTests(projectPath));
    }
  } finally {
    // Always return to original branch
    try {
      execSync(`git checkout "${originalBranch}"`, {
        cwd: projectPath,
        stdio: "pipe",
      });
    } catch {
      // Best effort
    }
  }

  const pass = checks.every((c) => c.pass);

  // Write report
  const contribDir = join(projectPath, ".specflow", "contrib", featureId);
  if (!existsSync(contribDir)) {
    mkdirSync(contribDir, { recursive: true });
  }

  const report: VerificationReport = {
    pass,
    checks,
    timestamp: new Date().toISOString(),
  };

  const reportPath = join(contribDir, "verification-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  // Update state
  let state = getContribState(featureId);
  if (!state) {
    state = createContribState(featureId);
  }
  updateContribVerification(featureId, pass);

  // Advance to gate 5 if passing and not already there
  if (pass && state.gate < 5) {
    updateContribGate(featureId, 5);
  }

  return report;
}
