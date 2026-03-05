/**
 * Review Library
 * Evidence compilation for the REVIEW phase
 */

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import type { Feature, CheckResult, AlignmentResult, HardenResult } from "../types";

// =============================================================================
// Automated Checks
// =============================================================================

/**
 * Run automated checks (tests, typecheck) on the project
 */
export function runAutomatedChecks(projectPath: string): CheckResult[] {
  const checks: CheckResult[] = [];

  // Test check
  const testStart = Date.now();
  const testResult = spawnSync("bun", ["test"], {
    encoding: "utf-8",
    timeout: 120000,
    cwd: projectPath,
  });
  checks.push({
    name: "Tests",
    passed: testResult.status === 0,
    duration: Date.now() - testStart,
    output: testResult.status !== 0 ? (testResult.stderr || testResult.stdout)?.slice(0, 500) : undefined,
  });

  // TypeScript check (if tsconfig exists)
  const tsconfigPath = join(projectPath, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tscStart = Date.now();
    const tscResult = spawnSync("bunx", ["tsc", "--noEmit"], {
      encoding: "utf-8",
      timeout: 60000,
      cwd: projectPath,
    });
    checks.push({
      name: "TypeCheck",
      passed: tscResult.status === 0,
      duration: Date.now() - tscStart,
      output: tscResult.status !== 0 ? (tscResult.stdout || tscResult.stderr)?.slice(0, 500) : undefined,
    });
  }

  return checks;
}

// =============================================================================
// File Alignment
// =============================================================================

/**
 * Check file alignment between spec references and actual files
 */
export function checkFileAlignment(specPath: string, projectPath: string): AlignmentResult {
  const specFile = join(specPath, "spec.md");
  if (!existsSync(specFile)) {
    return { matched: 0, missing: [], references: [] };
  }

  const content = readFileSync(specFile, "utf-8");

  // Extract backtick file references (e.g., `src/lib/foo.ts`)
  const refPattern = /`((?:src|lib|packages|tests?|commands?)\/[^`]+\.[a-z]+)`/g;
  const references: string[] = [];
  let match;
  while ((match = refPattern.exec(content)) !== null) {
    if (!references.includes(match[1])) {
      references.push(match[1]);
    }
  }

  const missing: string[] = [];
  let matched = 0;

  for (const ref of references) {
    if (existsSync(join(projectPath, ref))) {
      matched++;
    } else {
      missing.push(ref);
    }
  }

  return { matched, missing, references };
}

// =============================================================================
// Review Package Generation
// =============================================================================

export interface ReviewPackage {
  markdown: string;
  json: ReviewJson;
}

export interface ReviewJson {
  featureId: string;
  featureName: string;
  reviewedAt: string;
  passed: boolean;
  checks: CheckResult[];
  alignment: AlignmentResult;
  acceptanceTests: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    pending: number;
  } | null;
}

/**
 * Compile a review package from all evidence
 */
export function compileReviewPackage(
  feature: Feature,
  checks: CheckResult[],
  alignment: AlignmentResult,
  hardenResults: HardenResult[]
): ReviewPackage {
  const now = new Date().toISOString();

  // Compute acceptance test stats
  let acceptanceTests: ReviewJson["acceptanceTests"] = null;
  if (hardenResults.length > 0) {
    acceptanceTests = {
      total: hardenResults.length,
      pass: hardenResults.filter((r) => r.status === "pass").length,
      fail: hardenResults.filter((r) => r.status === "fail").length,
      skip: hardenResults.filter((r) => r.status === "skip").length,
      pending: hardenResults.filter((r) => r.status === "pending").length,
    };
  }

  // Determine overall verdict
  const checksPass = checks.every((c) => c.passed);
  const atsPass = acceptanceTests ? acceptanceTests.fail === 0 && acceptanceTests.pending === 0 : true;
  const alignmentOk = alignment.missing.length === 0;
  const passed = checksPass && atsPass;

  const verdict = passed ? "ALL PASS" : "NEEDS ATTENTION";

  // Build markdown
  let md = `# Review Package: ${feature.id} — ${feature.name}\n\n`;
  md += `**Verdict: ${verdict}**\n`;
  md += `**Reviewed:** ${now}\n\n`;

  // Automated checks
  md += `## Automated Checks\n\n`;
  md += `| Check | Result | Duration |\n`;
  md += `|-------|--------|----------|\n`;
  for (const c of checks) {
    const icon = c.passed ? "✓ PASS" : "✗ FAIL";
    const dur = c.duration < 1000 ? `${c.duration}ms` : `${(c.duration / 1000).toFixed(1)}s`;
    md += `| ${c.name} | ${icon} | ${dur} |\n`;
  }
  md += "\n";

  // File alignment
  md += `## File Alignment\n\n`;
  if (alignment.references.length === 0) {
    md += `No file references found in spec.\n\n`;
  } else {
    md += `${alignment.matched}/${alignment.references.length} spec references found in codebase\n\n`;
    if (alignment.missing.length > 0) {
      md += `**Missing:**\n`;
      for (const m of alignment.missing) {
        md += `- \`${m}\`\n`;
      }
      md += "\n";
    }
  }

  // Acceptance tests
  if (acceptanceTests) {
    md += `## Acceptance Tests\n\n`;
    md += `| Test | Status |\n`;
    md += `|------|--------|\n`;
    for (const r of hardenResults) {
      const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : r.status === "skip" ? "⊘" : "○";
      md += `| ${r.testName} | ${icon} ${r.status.toUpperCase()} |\n`;
    }
    md += "\n";
  }

  // Decision
  md += `## Decision\n\n`;
  md += "```bash\n";
  md += `specflow approve ${feature.id}    # Accept this feature\n`;
  md += `specflow reject ${feature.id} --reason "..."  # Return to implement\n`;
  md += "```\n";

  const json: ReviewJson = {
    featureId: feature.id,
    featureName: feature.name,
    reviewedAt: now,
    passed,
    checks,
    alignment,
    acceptanceTests,
  };

  return { markdown: md, json };
}

/**
 * Get the review directory path for a feature
 */
export function getReviewDir(featureId: string): string {
  return join(process.cwd(), ".specify", "review", featureId);
}

/**
 * Write review package to disk
 */
export function writeReviewPackage(featureId: string, pkg: ReviewPackage): { mdPath: string; jsonPath: string } {
  const dir = getReviewDir(featureId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const mdPath = join(dir, "review-package.md");
  const jsonPath = join(dir, "review.json");

  writeFileSync(mdPath, pkg.markdown, "utf-8");
  writeFileSync(jsonPath, JSON.stringify(pkg.json, null, 2), "utf-8");

  return { mdPath, jsonPath };
}
