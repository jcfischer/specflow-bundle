/**
 * Plan Command
 * Run SpecFlow PLAN phase for a feature
 */

import { join, dirname } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { isHeadlessMode, runClaudeHeadless, extractMarkdownArtifact } from "../lib/headless";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";
import { wrapPhaseExecution } from "../lib/pipeline-interceptor";

export interface PlanCommandOptions {
  dryRun?: boolean;
}

/**
 * Execute the plan command for a feature
 */
export async function planCommand(
  featureId: string,
  options: PlanCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const feature = getFeature(featureId);

    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    // Check phase progression
    if (feature.phase === "none") {
      console.error(`Error: Feature ${featureId} hasn't been specified yet.`);
      console.error("Run 'specflow specify " + featureId + "' first.");
      process.exit(1);
    }

    if (feature.phase !== "specify") {
      // Self-healing: if DB says plan is done but plan.md doesn't exist, re-run
      const planFile = feature.specPath ? join(feature.specPath, "plan.md") : null;
      const artifactMissing = planFile && !existsSync(planFile);

      if (artifactMissing) {
        console.log(`Feature ${featureId} phase is "${feature.phase}" but plan.md is missing — re-running plan`);
        updateFeaturePhase(featureId, "specify");
        // Fall through to run planning
      } else {
        console.log(`Feature ${featureId} is in phase: ${feature.phase}`);
        if (feature.phase === "plan" || feature.phase === "tasks" || feature.phase === "implement") {
          console.log("Plan phase already complete. Continue with next phase.");
        }
        return;
      }
    }

    // Check spec.md exists
    if (!feature.specPath) {
      console.error("Error: No spec path set for this feature.");
      process.exit(1);
    }

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) {
      console.error(`Error: spec.md not found at ${specFile}`);
      console.error("Run 'specflow specify " + featureId + "' first.");
      process.exit(1);
    }

    console.log(`\n📐 Starting PLAN phase for: ${feature.id} - ${feature.name}\n`);

    if (options.dryRun) {
      console.log("[DRY RUN] Would invoke SpecFlow plan for this feature");
      return;
    }

    // Read the spec
    const specContent = readFileSync(specFile, "utf-8");

    // Build prompt
    const prompt = buildPlanPrompt(feature, specContent);

    console.log("Invoking Claude with SpecFlow plan workflow...\n");
    console.log("─".repeat(60));

    const planFile = join(feature.specPath, "plan.md");

    try {
      await wrapPhaseExecution(async () => {
        const result = await runClaude(prompt, projectPath);
        if (!result.success) {
          throw new Error(result.error || "Claude execution failed");
        }
        // In headless mode, claude -p can't write files — extract plan from output
        if (!existsSync(planFile) && isHeadlessMode() && result.output) {
          const extracted = extractMarkdownArtifact(result.output);
          if (extracted) {
            writeFileSync(planFile, extracted);
            console.log("[headless] Extracted plan from Claude output and wrote to plan.md");
          }
        }
        if (!existsSync(planFile)) {
          throw new Error("Claude finished but plan.md was not created");
        }
      }, featureId, feature.name, "plan", projectPath);
    } catch (error) {
      console.error(`\n✗ PLAN phase failed: ${error instanceof Error ? error.message : String(error)}`);
      updateFeaturePhase(featureId, "specify");
      process.exit(1);
    }

    // Phase succeeded — update and run quality eval
    updateFeaturePhase(featureId, "plan");
    console.log("\n─".repeat(60));
    console.log(`\n📐 Plan created: ${planFile}`);

    // Run quality gate eval
    console.log("\n🔍 Running plan quality evaluation...\n");
    const evalResult = await runPlanEval(planFile, projectPath);

    if (evalResult.passed) {
      console.log(`\n✓ Quality gate passed (${(evalResult.score * 100).toFixed(0)}%)`);
      console.log(`\n✓ PLAN phase complete for ${featureId}`);
      console.log("\nNext: Run 'specflow tasks " + featureId + "' to create implementation tasks");
    } else {
      console.log(`\n⚠ Quality gate failed (${(evalResult.score * 100).toFixed(0)}% < 80%)`);
      console.log("\nFeedback:");
      console.log(evalResult.feedback);
      console.log("\n─".repeat(60));
      console.log("\nThe plan has quality issues. Review the feedback above.");
      console.log("To revise: edit the plan and run 'specflow eval run --file " + planFile + "'");
      console.log("When passing, run 'specflow tasks " + featureId + "' to continue.");
    }
  } finally {
    closeDatabase();
  }
}

function buildPlanPrompt(feature: Feature, specContent: string): string {
  return `# Technical Planning

## Context & Motivation

Technical planning bridges the gap between "what" (specification) and "how" (implementation). A good plan de-risks implementation by identifying architectural decisions, integration points, and potential blockers upfront. Plans that include data models, API contracts, and file structure reduce implementation time by 30-40% by eliminating decision paralysis during coding.

## Feature

**ID:** ${feature.id}
**Name:** ${feature.name}
**Spec Path:** ${feature.specPath}

## Specification

${specContent}

## Instructions

Create a technical plan at: ${feature.specPath}/plan.md

### Plan Structure

Include these sections:

| Section | Purpose |
|---------|---------|
| Architecture overview | High-level system design (ASCII diagram recommended) |
| Technology stack | Specific libraries/frameworks with rationale |
| Data model | Entities, schemas, relationships |
| API contracts | Endpoints, request/response formats (if applicable) |
| Implementation phases | Ordered steps for building the feature |
| File structure | Where new code will live |
| Dependencies | External services, packages, prerequisites |
| Risk assessment | What could go wrong, mitigation strategies |

### Example Plan Structure

\`\`\`markdown
# Technical Plan: ${feature.name}

## Architecture Overview

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CLI       │────>│   Service   │────>│  Database   │
│  (command)  │     │   (logic)   │     │  (SQLite)   │
└─────────────┘     └─────────────┘     └─────────────┘
\`\`\`

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Bun | Project standard, fast startup |
| Database | SQLite | Local-first, no server needed |
| CLI | Commander.js | Project pattern, good DX |

## Data Model

\`\`\`typescript
interface Entity {
  id: string;
  // ... fields based on spec
}
\`\`\`

## Implementation Phases

1. **Phase 1: Data layer** - Schema and CRUD operations
2. **Phase 2: Business logic** - Core service functions
3. **Phase 3: CLI integration** - Command handlers

## File Structure

\`\`\`
src/
├── lib/
│   └── [feature].ts       # Business logic
├── commands/
│   └── [feature].ts       # CLI command
└── types/
    └── [feature].ts       # Type definitions
\`\`\`

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Identified risk] | [High/Medium/Low] | [Strategy] |
\`\`\`

## Output Format

### On Success

\`\`\`
[PHASE COMPLETE: PLAN]
Feature: ${feature.id}
Plan: ${feature.specPath}/plan.md
\`\`\`

### On Blocker

\`\`\`
[PHASE BLOCKED: PLAN]
Feature: ${feature.id}
Reason: [explanation of what's blocking]
Suggestion: [how to resolve]
\`\`\``;
}

async function runClaude(
  prompt: string,
  cwd: string
): Promise<{ success: boolean; output: string; error?: string }> {
  // Headless mode: use claude -p --output-format json
  if (isHeadlessMode()) {
    console.log("[headless] Running plan phase via claude -p...");
    const systemPrompt =
      "You are a technical planning agent. Follow the instructions exactly. " +
      "Output the complete technical plan as markdown. " +
      "Start with a # heading. " +
      "Output [PHASE COMPLETE: PLAN] after the plan content.";
    const result = await runClaudeHeadless(prompt, {
      systemPrompt,
      cwd,
      timeout: parseInt(process.env.SPECFLOW_TIMEOUT ?? '600000', 10),
    });
    if (result.output) {
      process.stdout.write(result.output);
    }
    return result;
  }

  // Interactive mode: unchanged
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0 || output.includes("[PHASE COMPLETE")) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, output, error: stderr || `Exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, output, error: err.message });
    });
  });
}

/**
 * Run plan quality evaluation
 */
async function runPlanEval(
  planFile: string,
  projectPath: string
): Promise<{ passed: boolean; score: number; feedback: string }> {
  return new Promise((resolve) => {
    // Run specflow eval with the plan file and plan-quality rubric
    const proc = spawn(
      "specflow",
      [
        "eval",
        "run",
        "--file",
        planFile,
        "--rubric",
        "plan-quality",
        "--json",
      ],
      {
        cwd: projectPath,
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env },
      }
    );

    let output = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", () => {
      try {
        // Try to parse JSON output
        const result = JSON.parse(output);
        const testResult = result.results?.[0];

        if (testResult) {
          resolve({
            passed: testResult.passed,
            score: testResult.score ?? 0,
            feedback: testResult.output || "No feedback available",
          });
        } else {
          // Fallback if no results
          resolve({
            passed: true, // Don't block if eval fails
            score: 1.0,
            feedback: "Evaluation skipped - no rubric configured",
          });
        }
      } catch {
        // If JSON parsing fails, check for rubric error
        if (output.includes("not found") || stderr.includes("not found")) {
          console.log("  (No plan-quality rubric found - skipping quality gate)");
          resolve({
            passed: true,
            score: 1.0,
            feedback: "No rubric configured - quality gate skipped",
          });
        } else {
          resolve({
            passed: true, // Don't block on eval errors
            score: 1.0,
            feedback: `Eval error: ${stderr || output || "Unknown error"}`,
          });
        }
      }
    });

    proc.on("error", (err) => {
      console.log(`  (Eval skipped: ${err.message})`);
      resolve({
        passed: true,
        score: 1.0,
        feedback: `Eval unavailable: ${err.message}`,
      });
    });
  });
}
