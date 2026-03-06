/**
 * Specify Command
 * Run SpecFlow SPECIFY phase for a feature
 */

import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
  updateFeatureSpecPath,
  updateFeatureQuickStart,
  getDbPath,
  dbExists,
} from "../lib/database";
import { loadThresholds, toDecimal, formatThreshold } from "../lib/threshold";
import {
  buildProgressivePrompt,
  getInterviewIntro,
  DEFAULT_INTERVIEW_CONFIG,
  QUICK_INTERVIEW_CONFIG,
} from "../lib/interview";
import { getRubric } from "../lib/eval";
import { generateActionableFeedback, formatFeedbackReport } from "../lib/feedback";
import {
  validateBatchReady,
  formatBatchErrors,
  buildBatchPrompt,
  generateClarificationFile,
  writeClarificationFile,
} from "../lib/batch";
import type { DecomposedFeature } from "../types";
import { wrapPhaseExecution } from "../lib/pipeline-interceptor";

export interface SpecifyCommandOptions {
  dryRun?: boolean;
  quick?: boolean;
  batch?: boolean;
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
      // Self-healing: if DB says specify is done but spec.md doesn't exist, re-run
      const specFile = feature.specPath ? join(feature.specPath, "spec.md") : null;
      const artifactMissing = specFile && !existsSync(specFile);

      if (artifactMissing) {
        console.log(`Feature ${featureId} phase is "${feature.phase}" but spec.md is missing — re-running specify`);
        updateFeaturePhase(featureId, "none");
        // Fall through to run specification
      } else {
        console.log(`Feature ${featureId} is already in phase: ${feature.phase}`);
        console.log("Use 'specflow reset' to start over, or continue with next phase.");
        return;
      }
    }

    // In headless mode, auto-enable batch if decomposition data is available
    if (isHeadlessMode() && !options.batch) {
      const decomposedFeature = feature as unknown as DecomposedFeature;
      const batchCheck = validateBatchReady(decomposedFeature);
      if (batchCheck.ready) {
        options.batch = true;
        console.log("[headless] Auto-enabling batch mode (rich decomposition available)");
      }
    }

    // Batch mode validation
    if (options.batch) {
      // Cast feature to include decomposition fields for validation
      const decomposedFeature = feature as unknown as DecomposedFeature;
      const batchValidation = validateBatchReady(decomposedFeature);

      if (!batchValidation.ready) {
        console.error(formatBatchErrors(featureId, batchValidation));
        process.exit(1);
      }

      // Warn about uncertainties (will be marked in spec)
      if (batchValidation.uncertainFields.length > 0) {
        console.log(`\n⚠ Feature has ${batchValidation.uncertainFields.length} uncertain field(s).`);
        console.log("  These will be marked with [TO BE CLARIFIED] in the spec.\n");
      }
    }

    // Create spec directory
    const specDirName = `${featureId.toLowerCase()}-${slugify(feature.name)}`;
    const specPath = join(projectPath, ".specify", "specs", specDirName);

    if (!options.dryRun) {
      mkdirSync(specPath, { recursive: true });
    }

    // Determine interview configuration
    const interviewConfig = options.quick
      ? QUICK_INTERVIEW_CONFIG
      : DEFAULT_INTERVIEW_CONFIG;

    console.log(`\n📋 Starting SPECIFY phase for: ${feature.id} - ${feature.name}\n`);
    if (options.batch) {
      console.log("🔄 Batch mode: Non-interactive specification from rich decomposition");
    } else if (options.quick) {
      console.log("⚡ Quick mode: Essential questions only from phases 1-3");
    }
    console.log(`Spec directory: ${specPath}`);

    if (options.dryRun) {
      console.log("\n[DRY RUN] Would invoke SpecFlow interview for this feature");
      console.log("\nInterview intro:");
      console.log(getInterviewIntro(feature, interviewConfig));
      return;
    }

    // Load app context if available
    const appContextPath = join(projectPath, ".specify", "app-context.md");
    const appContext = existsSync(appContextPath)
      ? readFileSync(appContextPath, "utf-8")
      : null;

    // Build the prompt based on mode (batch vs interactive)
    let prompt: string;
    if (options.batch) {
      // Batch mode: use rich decomposition data instead of interview
      const decomposedFeature = feature as unknown as DecomposedFeature;
      const batchFeature = { ...feature, ...decomposedFeature };
      prompt = buildBatchPrompt(batchFeature, specPath, appContext);

      // Generate clarification file if there are uncertainties
      if (decomposedFeature.uncertainties && decomposedFeature.uncertainties.length > 0) {
        const clarification = generateClarificationFile(decomposedFeature);
        const clarificationPath = writeClarificationFile(clarification, specPath);
        console.log(`📝 Clarification file: ${clarificationPath}`);
      }
    } else {
      // Interactive mode: use progressive interview
      prompt = buildProgressivePrompt(feature, interviewConfig, specPath, appContext);
    }

    // Set spec path before Claude runs (needed for file creation)
    updateFeatureSpecPath(featureId, specPath);
    if (options.quick) {
      updateFeatureQuickStart(featureId, true);
    }

    // Run Claude with the prompt
    console.log("\nInvoking Claude with SpecFlow specify workflow...\n");
    console.log("─".repeat(60));

    const specFile = join(specPath, "spec.md");

    try {
      await wrapPhaseExecution(async () => {
        const result = await runClaude(prompt, projectPath);
        if (!result.success) {
          throw new Error(result.error || "Claude execution failed");
        }
        // In headless mode, claude -p can't write files — extract spec from output
        if (!existsSync(specFile) && isHeadlessMode() && result.output) {
          const extracted = extractMarkdownArtifact(result.output);
          if (extracted) {
            writeFileSync(specFile, extracted);
            console.log("[headless] Extracted spec from Claude output and wrote to spec.md");
          }
        }
        if (!existsSync(specFile)) {
          throw new Error("Claude finished but spec.md was not created");
        }
      }, featureId, feature.name, "specify", projectPath);
    } catch (error) {
      console.error(`\n✗ SPECIFY phase failed: ${error instanceof Error ? error.message : String(error)}`);
      updateFeaturePhase(featureId, "none");
      process.exit(1);
    }

    // Phase succeeded — update and run quality eval
    updateFeaturePhase(featureId, "specify");
    console.log("\n─".repeat(60));
    console.log(`\n📝 Spec created: ${specFile}`);

    // Load configurable thresholds
    const thresholds = loadThresholds(projectPath);
    // Use quick-start threshold if in quick mode
    const threshold = options.quick ? thresholds.quickStartQuality : thresholds.specQuality;
    const thresholdDecimal = toDecimal(threshold);

    // Run quality gate eval
    console.log("\n🔍 Running spec quality evaluation...\n");
    if (options.quick) {
      console.log(`   ⚡ Quick-start threshold: ${formatThreshold(threshold)} (vs ${formatThreshold(thresholds.specQuality)} standard)`);
    } else if (thresholds.source === "constitution") {
      console.log(`   Using threshold from constitution: ${formatThreshold(threshold)}`);
    }
    const evalResult = await runSpecEval(specFile, projectPath, thresholdDecimal);

    if (evalResult.passed) {
      console.log(`\n✓ Quality gate passed (${(evalResult.score * 100).toFixed(0)}% >= ${formatThreshold(threshold)})`);
      console.log(`\n✓ SPECIFY phase complete for ${featureId}`);
      console.log("\nNext: Run 'specflow plan " + featureId + "' for technical planning");
    } else {
      // Generate actionable feedback for quality gate failure
      try {
        const rubricsDir = join(projectPath, ".specify", "rubrics");
        const rubric = await getRubric("spec-quality", rubricsDir);
        const gradeResult = {
          passed: evalResult.passed,
          score: evalResult.score,
          output: evalResult.feedback,
        };
        const feedbackReport = generateActionableFeedback(gradeResult, rubric);
        console.log("\n" + formatFeedbackReport(feedbackReport));
      } catch {
        // Fallback to raw feedback if rubric loading fails
        console.log(`\n⚠ Quality gate failed (${(evalResult.score * 100).toFixed(0)}% < ${formatThreshold(threshold)})`);
        console.log("\nFeedback:");
        console.log(evalResult.feedback);
      }
      console.log("\n─".repeat(60));
      console.log("\nThe spec has quality issues. Review the feedback above.");
      console.log("To revise: edit the spec and run 'specflow eval run --file " + specFile + "'");
      console.log("When passing, run 'specflow plan " + featureId + "' to continue.");
    }
  } finally {
    closeDatabase();
  }
}

/**
 * Run Claude CLI with a prompt
 */
async function runClaude(
  prompt: string,
  cwd: string
): Promise<{ success: boolean; output: string; error?: string }> {
  // Headless mode: use claude -p --output-format json
  if (isHeadlessMode()) {
    console.log("[headless] Running specify phase via claude -p...");
    const systemPrompt =
      "You are a specification agent. Follow the instructions exactly. " +
      "Output the complete specification as markdown. " +
      "Start with a # heading. " +
      "Output [PHASE COMPLETE: SPECIFY] after the spec content.";
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
 * @param specFile - Path to spec file to evaluate
 * @param projectPath - Path to project root
 * @param threshold - Optional threshold override (0-1 decimal)
 */
async function runSpecEval(
  specFile: string,
  projectPath: string,
  threshold?: number
): Promise<{ passed: boolean; score: number; feedback: string }> {
  return new Promise((resolve) => {
    // Build arguments for specflow eval
    const args = [
      "eval",
      "run",
      "--file",
      specFile,
      "--rubric",
      "spec-quality",
      "--json",
    ];

    // Add threshold override if provided
    if (threshold !== undefined) {
      args.push("--threshold", threshold.toString());
    }

    // Run specflow eval with the spec file and spec-quality rubric
    const proc = spawn(
      "specflow",
      args,
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

    proc.on("close", (_code) => {
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
