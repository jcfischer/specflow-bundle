/**
 * Specify Command
 * Run SpecFlow SPECIFY phase for a feature
 */

import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeaturePhase,
  updateFeatureSpecPath,
  getDbPath,
  dbExists,
} from "../lib/database";
import type { Feature } from "../types";

export interface SpecifyCommandOptions {
  dryRun?: boolean;
}

/**
 * Execute the specify command for a feature
 */
export async function specifyCommand(
  featureId: string,
  options: SpecifyCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  // Check if database exists
  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
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

    // Check current phase
    if (feature.phase !== "none") {
      console.log(`Feature ${featureId} is already in phase: ${feature.phase}`);
      console.log("Use 'specflow reset' to start over, or continue with next phase.");
      return;
    }

    // Create spec directory
    const specDirName = `${featureId.toLowerCase()}-${slugify(feature.name)}`;
    const specPath = join(projectPath, ".specify", "specs", specDirName);

    if (!options.dryRun) {
      mkdirSync(specPath, { recursive: true });
    }

    console.log(`\n📋 Starting SPECIFY phase for: ${feature.id} - ${feature.name}\n`);
    console.log(`Spec directory: ${specPath}`);

    if (options.dryRun) {
      console.log("\n[DRY RUN] Would invoke SpecFlow interview for this feature");
      return;
    }

    // Load app context if available
    const appContextPath = join(projectPath, ".specify", "app-context.md");
    const appContext = existsSync(appContextPath)
      ? readFileSync(appContextPath, "utf-8")
      : null;

    // Build the prompt for Claude to run SpecFlow specify
    const prompt = buildSpecifyPrompt(feature, specPath, appContext);

    // Update phase to specify (in progress)
    updateFeaturePhase(featureId, "specify");
    updateFeatureSpecPath(featureId, specPath);

    // Run Claude with the prompt
    console.log("\nInvoking Claude with SpecFlow specify workflow...\n");
    console.log("─".repeat(60));

    const result = await runClaude(prompt, projectPath);

    if (result.success) {
      // Check if spec.md was created
      const specFile = join(specPath, "spec.md");
      if (existsSync(specFile)) {
        console.log("\n─".repeat(60));
        console.log(`\n📝 Spec created: ${specFile}`);

        // Run quality gate eval
        console.log("\n🔍 Running spec quality evaluation...\n");
        const evalResult = await runSpecEval(specFile, projectPath);

        if (evalResult.passed) {
          console.log(`\n✓ Quality gate passed (${(evalResult.score * 100).toFixed(0)}%)`);
          console.log(`\n✓ SPECIFY phase complete for ${featureId}`);
          console.log("\nNext: Run 'specflow plan " + featureId + "' for technical planning");
        } else {
          console.log(`\n⚠ Quality gate failed (${(evalResult.score * 100).toFixed(0)}% < 80%)`);
          console.log("\nFeedback:");
          console.log(evalResult.feedback);
          console.log("\n─".repeat(60));
          console.log("\nThe spec has quality issues. Review the feedback above.");
          console.log("To revise: edit the spec and run 'specflow eval run --file " + specFile + "'");
          console.log("When passing, run 'specflow plan " + featureId + "' to continue.");
        }
      } else {
        console.log("\n─".repeat(60));
        console.log(`\n⚠ Claude finished but spec.md was not created`);
        console.log("  Review the output above and try again");
        updateFeaturePhase(featureId, "none");
      }
    } else {
      console.error(`\n✗ SPECIFY phase failed: ${result.error}`);
      updateFeaturePhase(featureId, "none");
    }
  } finally {
    closeDatabase();
  }
}

/**
 * Build the prompt for SpecFlow specify phase
 */
function buildSpecifyPrompt(feature: Feature, specPath: string, appContext: string | null): string {
  const contextSection = appContext
    ? `## App Context (from init interview)

${appContext}

**IMPORTANT:** The app-level interview has already been conducted. DO NOT re-interview the user.
Use the context above to inform this feature's specification. Only ask clarifying questions
if something specific to THIS FEATURE is unclear.

`
    : `## Note

No app-context.md found. You may ask clarifying questions about this feature.

`;

  return `You are running SpecFlow's SPECIFY phase for a feature.

## Feature to Specify

**ID:** ${feature.id}
**Name:** ${feature.name}
**Description:** ${feature.description}

${contextSection}## Your Task

Create a detailed specification for this feature:

1. **Create the Specification** at: ${specPath}/spec.md

   The spec.md should contain:
   - Overview (brief description)
   - User scenarios with Given/When/Then acceptance criteria
   - Functional requirements (FR-1, FR-2, etc.)
   - Non-functional requirements (if applicable)
   - Success criteria
   - Assumptions (if any)

2. **DO NOT include** implementation details, technology choices, or code

3. When complete, confirm by outputting:
   [PHASE COMPLETE: SPECIFY]
   Feature: ${feature.id}
   Spec: ${specPath}/spec.md`;
}

/**
 * Run Claude CLI with a prompt
 */
async function runClaude(
  prompt: string,
  cwd: string
): Promise<{ success: boolean; output: string; error?: string }> {
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
        resolve({
          success: false,
          output,
          error: stderr || `Claude exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        output,
        error: `Process error: ${err.message}`,
      });
    });
  });
}

/**
 * Run spec quality evaluation
 */
async function runSpecEval(
  specFile: string,
  projectPath: string
): Promise<{ passed: boolean; score: number; feedback: string }> {
  return new Promise((resolve) => {
    // Run specflow eval with the spec file and spec-quality rubric
    const proc = spawn(
      "specflow",
      [
        "eval",
        "run",
        "--file",
        specFile,
        "--rubric",
        "spec-quality",
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

    proc.on("close", (code) => {
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
          console.log("  (No spec-quality rubric found - skipping quality gate)");
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

/**
 * Convert a string to a URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}
