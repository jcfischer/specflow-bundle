/**
 * Harden Library
 * Acceptance test template generation and parsing for the HARDEN phase
 */

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import type { Feature } from "../types";

// =============================================================================
// Template Generation
// =============================================================================

export interface AcceptanceTest {
  name: string;
  workflow: string;
  expected: string;
}

export interface ParsedResult {
  name: string;
  status: "pass" | "fail" | "skip" | "pending";
  evidence: string | null;
}

/**
 * Get the harden directory path for a feature
 */
export function getHardenDir(featureId: string): string {
  return join(process.cwd(), ".specify", "harden", featureId);
}

/**
 * Get the acceptance test template path for a feature
 */
export function getTemplatePath(featureId: string): string {
  return join(getHardenDir(featureId), "acceptance-test.md");
}

/**
 * Get the results JSON path for a feature
 */
export function getResultsPath(featureId: string): string {
  return join(getHardenDir(featureId), "results.json");
}

/**
 * Generate acceptance test template using AI or fallback
 */
export function generateAcceptanceTemplate(feature: Feature): string {
  const specPath = feature.specPath;
  if (!specPath) {
    return generateFallbackTemplate(feature);
  }

  const specFile = join(specPath, "spec.md");
  const tasksFile = join(specPath, "tasks.md");

  let specContent = "";
  let tasksContent = "";

  if (existsSync(specFile)) {
    specContent = readFileSync(specFile, "utf-8");
  }
  if (existsSync(tasksFile)) {
    tasksContent = readFileSync(tasksFile, "utf-8");
  }

  if (!specContent) {
    return generateFallbackTemplate(feature);
  }

  // Try AI generation via headless Claude
  const prompt = `You are generating acceptance tests for a software feature.

Feature: ${feature.id} — ${feature.name}
Description: ${feature.description}

Spec:
${specContent.slice(0, 3000)}

${tasksContent ? `Tasks:\n${tasksContent.slice(0, 2000)}` : ""}

Generate exactly 3-5 workflow-level acceptance tests. Each test should verify an end-to-end workflow, not a unit test.

Output ONLY the markdown below, no other text:

# Acceptance Tests: ${feature.id} — ${feature.name}

## AT-1: [Descriptive Test Name]
**Workflow:** [Step-by-step description of what to do]
**Expected:** [What the correct outcome looks like]
**Status:** [ ] PASS  [ ] FAIL  [ ] SKIP
**Evidence:**
<!-- Describe what you observed, paste output, or attach screenshot -->

## AT-2: [Next Test Name]
...

(repeat for 3-5 tests)`;

  const result = spawnSync("claude", ["-p", prompt, "--output-format", "text"], {
    encoding: "utf-8",
    timeout: 60000,
    env: {
      ...process.env,
      CLAUDE_CODE_ENTRYPOINT: undefined,
    },
  });

  if (result.status === 0 && result.stdout && result.stdout.includes("## AT-")) {
    return result.stdout.trim();
  }

  // Fallback if Claude unavailable
  return generateFallbackTemplate(feature);
}

/**
 * Generate a static fallback template when AI is unavailable
 */
function generateFallbackTemplate(feature: Feature): string {
  return `# Acceptance Tests: ${feature.id} — ${feature.name}

## AT-1: Happy Path
**Workflow:** Execute the primary use case end-to-end
**Expected:** Feature works as described in the spec
**Status:** [ ] PASS  [ ] FAIL  [ ] SKIP
**Evidence:**
<!-- Describe what you observed -->

## AT-2: Error Handling
**Workflow:** Trigger expected error conditions
**Expected:** Errors are handled gracefully with clear messages
**Status:** [ ] PASS  [ ] FAIL  [ ] SKIP
**Evidence:**
<!-- Describe what you observed -->

## AT-3: Edge Cases
**Workflow:** Test boundary conditions and unusual inputs
**Expected:** Feature handles edge cases without crashing
**Status:** [ ] PASS  [ ] FAIL  [ ] SKIP
**Evidence:**
<!-- Describe what you observed -->`;
}

/**
 * Write the acceptance test template to disk
 */
export function writeTemplate(featureId: string, content: string): string {
  const dir = getHardenDir(featureId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = getTemplatePath(featureId);
  writeFileSync(path, content, "utf-8");
  return path;
}

// =============================================================================
// Template Parsing / Ingestion
// =============================================================================

/**
 * Parse a filled acceptance test template into structured results
 */
export function parseAcceptanceTemplate(content: string): ParsedResult[] {
  const results: ParsedResult[] = [];
  // Split on ## AT- headings
  const blocks = content.split(/^## AT-\d+:\s*/m).slice(1);

  for (const block of blocks) {
    const lines = block.split("\n");
    const name = lines[0]?.trim() || "Unnamed Test";

    // Find status line
    let status: ParsedResult["status"] = "pending";
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes("[x] pass")) {
        status = "pass";
        break;
      } else if (lower.includes("[x] fail")) {
        status = "fail";
        break;
      } else if (lower.includes("[x] skip")) {
        status = "skip";
        break;
      }
    }

    // Extract evidence (everything after **Evidence:** line)
    let evidence: string | null = null;
    const evidenceIdx = lines.findIndex((l) => l.startsWith("**Evidence:**"));
    if (evidenceIdx !== -1) {
      const evidenceLines = lines
        .slice(evidenceIdx + 1)
        .filter((l) => !l.startsWith("<!--") && !l.startsWith("-->") && l.trim() !== "");
      if (evidenceLines.length > 0) {
        evidence = evidenceLines.join("\n").trim();
      }
    }

    results.push({ name, status, evidence });
  }

  return results;
}

/**
 * Write ingested results as JSON
 */
export function writeResults(featureId: string, results: ParsedResult[]): string {
  const dir = getHardenDir(featureId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = getResultsPath(featureId);
  writeFileSync(path, JSON.stringify(results, null, 2), "utf-8");
  return path;
}
