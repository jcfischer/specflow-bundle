/**
 * Contrib Prep Sanitization Module
 * Scans included files for secrets, PII, and personal data
 *
 * Two layers:
 * 1. Gitleaks delegation (secret detection via F-086)
 * 2. Custom pattern scanning (personal paths, emails, IPs, vault refs)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import {
  getContribState,
  createContribState,
  updateContribSanitization,
  updateContribGate,
} from "./state";

// =============================================================================
// Types
// =============================================================================

export interface SanitizationFinding {
  file: string;
  line: number;
  pattern: string;
  match: string;
  suggestion: string;
  allowlistable: boolean;
}

export interface SanitizationReport {
  pass: boolean;
  findings: SanitizationFinding[];
  gitleaksFindings: number;
  customFindings: number;
  timestamp: string;
}

export interface AllowlistEntry {
  file: string;
  line: number;
  pattern: string;
}

// =============================================================================
// Custom Patterns
// =============================================================================

interface PatternDef {
  name: string;
  regex: RegExp;
  suggestion: string;
  /** File extensions to skip (e.g., docs are OK for emails) */
  skipExtensions?: string[];
}

const CUSTOM_PATTERNS: PatternDef[] = [
  {
    name: "personal-path",
    regex: /\/Users\/[^/\s]+\//g,
    suggestion: "Replace with environment variable or relative path",
  },
  {
    name: "personal-path-linux",
    regex: /\/home\/[^/\s]+\//g,
    suggestion: "Replace with environment variable or relative path",
  },
  {
    name: "email-address",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    suggestion: "Remove or replace with placeholder email",
    skipExtensions: [".md", ".txt", ".rst", ".adoc", ".html"],
  },
  {
    name: "hardcoded-ip",
    regex: /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?!255\.255\.255\.255\b)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    suggestion: "Replace with environment variable or configuration",
  },
  {
    name: "vault-reference",
    regex: /(?:vault|op):\/\/[^\s"']+/g,
    suggestion: "Remove vault/1Password reference",
  },
];

// =============================================================================
// Custom Pattern Scanner
// =============================================================================

/**
 * Scan files for custom sanitization patterns
 */
export function scanCustomPatterns(
  projectPath: string,
  files: string[]
): SanitizationFinding[] {
  const findings: SanitizationFinding[] = [];

  for (const file of files) {
    const fullPath = join(projectPath, file);
    if (!existsSync(fullPath)) continue;

    const ext = extname(file).toLowerCase();

    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      // Skip binary files or files we can't read
      continue;
    }

    const lines = content.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of CUSTOM_PATTERNS) {
        // Skip patterns for certain file types
        if (pattern.skipExtensions?.includes(ext)) continue;

        // Reset regex lastIndex for global patterns
        pattern.regex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(line)) !== null) {
          findings.push({
            file,
            line: lineNum + 1,
            pattern: pattern.name,
            match: match[0],
            suggestion: pattern.suggestion,
            allowlistable: true,
          });
        }
      }
    }
  }

  return findings;
}

// =============================================================================
// Gitleaks Delegation
// =============================================================================

/**
 * Check if gitleaks is installed
 */
export function isGitleaksInstalled(): boolean {
  try {
    execSync("gitleaks version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan project with gitleaks and return findings
 */
export function scanGitleaks(
  projectPath: string
): SanitizationFinding[] {
  if (!isGitleaksInstalled()) {
    throw new Error(
      "gitleaks is not installed. Install via: brew install gitleaks\n" +
        "Or see: https://github.com/jcfischer/pai-secret-scanning"
    );
  }

  const tmpReport = join(projectPath, ".specflow", "tmp-gitleaks-report.json");

  try {
    // gitleaks detect exits 1 if leaks found, 0 if clean
    execSync(
      `gitleaks detect --source "${projectPath}" --no-banner --report-format json --report-path "${tmpReport}"`,
      { stdio: "pipe", timeout: 60000 }
    );
    // Exit 0 = no leaks
    return [];
  } catch (error: any) {
    // Exit 1 = leaks found, parse the report
    if (existsSync(tmpReport)) {
      try {
        const report = JSON.parse(readFileSync(tmpReport, "utf-8"));
        return parseGitleaksReport(report);
      } finally {
        // Clean up temp file
        try {
          const { unlinkSync } = require("fs");
          unlinkSync(tmpReport);
        } catch {
          // ignore cleanup errors
        }
      }
    }

    // If no report file, re-throw the error
    throw new Error(`gitleaks scan failed: ${error.message}`);
  }
}

/**
 * Parse gitleaks JSON report into our finding format
 */
function parseGitleaksReport(report: any[]): SanitizationFinding[] {
  if (!Array.isArray(report)) return [];

  return report.map((entry) => ({
    file: entry.File || entry.file || "unknown",
    line: entry.StartLine || entry.startLine || 0,
    pattern: `gitleaks:${entry.RuleID || entry.ruleID || "unknown"}`,
    match: entry.Secret
      ? entry.Secret.substring(0, 20) + "..."
      : entry.Match?.substring(0, 20) + "..." || "***",
    suggestion: `Secret detected by gitleaks rule: ${entry.RuleID || entry.ruleID || "unknown"}`,
    allowlistable: true,
  }));
}

// =============================================================================
// Allowlist
// =============================================================================

/**
 * Load allowlist for a feature
 */
export function loadAllowlist(
  projectPath: string,
  featureId: string
): AllowlistEntry[] {
  const allowlistPath = join(
    projectPath,
    ".specflow",
    "contrib",
    featureId,
    "allowlist.json"
  );

  if (!existsSync(allowlistPath)) return [];

  try {
    return JSON.parse(readFileSync(allowlistPath, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Check if a finding is allowlisted
 */
function isAllowlisted(
  finding: SanitizationFinding,
  allowlist: AllowlistEntry[]
): boolean {
  return allowlist.some(
    (entry) =>
      entry.file === finding.file &&
      entry.line === finding.line &&
      entry.pattern === finding.pattern
  );
}

// =============================================================================
// Orchestrator
// =============================================================================

/**
 * Run full sanitization scan on included files
 */
export function runSanitization(
  projectPath: string,
  featureId: string,
  includedFiles: string[],
  options: { skipGitleaks?: boolean } = {}
): SanitizationReport {
  // Run custom patterns
  const customFindings = scanCustomPatterns(projectPath, includedFiles);

  // Run gitleaks (unless skipped, e.g., in tests)
  let gitleaksFindings: SanitizationFinding[] = [];
  if (!options.skipGitleaks) {
    try {
      gitleaksFindings = scanGitleaks(projectPath);
    } catch (error: any) {
      // If gitleaks not installed, warn but continue
      console.warn(`Warning: ${error.message}`);
    }
  }

  // Combine findings
  let allFindings = [...gitleaksFindings, ...customFindings];

  // Apply allowlist
  const allowlist = loadAllowlist(projectPath, featureId);
  if (allowlist.length > 0) {
    allFindings = allFindings.filter((f) => !isAllowlisted(f, allowlist));
  }

  const pass = allFindings.length === 0;

  // Write report
  const contribDir = join(projectPath, ".specflow", "contrib", featureId);
  if (!existsSync(contribDir)) {
    mkdirSync(contribDir, { recursive: true });
  }

  const report: SanitizationReport = {
    pass,
    findings: allFindings,
    gitleaksFindings: gitleaksFindings.length,
    customFindings: customFindings.length,
    timestamp: new Date().toISOString(),
  };

  const reportPath = join(contribDir, "sanitization-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  // Update state
  let state = getContribState(featureId);
  if (!state) {
    state = createContribState(featureId);
  }
  updateContribSanitization(featureId, pass, allFindings.length);

  // Advance to gate 2 if passing and not already past it
  if (pass && state.gate < 2) {
    updateContribGate(featureId, 2);
  }

  return report;
}
