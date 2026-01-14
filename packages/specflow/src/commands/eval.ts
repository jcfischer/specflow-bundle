/**
 * Eval Command
 * CLI for running evaluations and managing test cases
 */

import { Command } from "commander";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  // Database
  initEvalDatabase,
  closeEvalDatabase,
  getEvalDbPath,
  addTestCase,
  getTestCases,
  getTestCasesBySuite,
  deleteTestCase,
  getTestCaseBalance,
  getEvalRuns,
  // Graders
  registerCodeGraders,
  registerModelGraders,
  loadRubric,
  buildGradingPrompt,
  parseGradingResponse,
  // Runner
  runEvals,
  // Reporter
  calculatePassAtK,
  calculatePassCaretK,
  generateMarkdownReport,
  generateJsonReport,
} from "../lib/eval";
import { existsSync as fileExists, readFileSync } from "fs";
import { homedir } from "os";
import Anthropic from "@anthropic-ai/sdk";
import type { AddTestCaseInput, ReportData } from "../lib/eval";

// =============================================================================
// Initialize Graders
// =============================================================================

/**
 * Register all graders on first use
 */
let gradersRegistered = false;

function ensureGradersRegistered(): void {
  if (!gradersRegistered) {
    registerCodeGraders();
    registerModelGraders();
    gradersRegistered = true;
  }
}

// =============================================================================
// Single File Evaluation
// =============================================================================

/**
 * Load API key from environment or known .env files
 */
function loadApiKeyFromEnv(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  const envPaths = [
    `${homedir()}/.claude/.env`,
    `${homedir()}/work/ragent/.env`,
  ];

  for (const envPath of envPaths) {
    if (fileExists(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match) {
        return match[1].trim();
      }
    }
  }

  return undefined;
}

/**
 * Run single file evaluation with a rubric using Claude Haiku
 */
async function runSingleFileEval(
  filePath: string,
  rubricName: string,
  projectPath: string
): Promise<{ passed: boolean; score: number | null; output: string; error?: string }> {
  // Resolve file path
  const fullPath = filePath.startsWith("/") ? filePath : join(projectPath, filePath);

  if (!fileExists(fullPath)) {
    return {
      passed: false,
      score: null,
      output: "",
      error: `File not found: ${fullPath}`,
    };
  }

  // Load rubric - try project-local first, then SpecFlow bundled
  const projectRubricPath = join(projectPath, "evals", "rubrics", `${rubricName}.yaml`);
  const bundledRubricPath = join(homedir(), ".claude", "skills", "SpecFlow", "evals", "rubrics", `${rubricName}.yaml`);

  let rubric;
  try {
    if (fileExists(projectRubricPath)) {
      rubric = await loadRubric(projectRubricPath);
    } else if (fileExists(bundledRubricPath)) {
      rubric = await loadRubric(bundledRubricPath);
    } else {
      return {
        passed: false,
        score: null,
        output: "",
        error: `Rubric not found: ${rubricName}.yaml (checked ${projectRubricPath} and ${bundledRubricPath})`,
      };
    }
  } catch (error) {
    return {
      passed: false,
      score: null,
      output: "",
      error: `Failed to load rubric: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Read file content
  const content = readFileSync(fullPath, "utf-8");

  // Build grading prompt
  const prompt = buildGradingPrompt(rubric, content);

  // Get API key
  const apiKey = loadApiKeyFromEnv();
  if (!apiKey) {
    return {
      passed: false,
      score: null,
      output: "",
      error: "ANTHROPIC_API_KEY not found in environment or ~/.claude/.env",
    };
  }

  // Call Claude Haiku
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text from response
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Parse and return result
    return parseGradingResponse(responseText, rubric);
  } catch (error) {
    return {
      passed: false,
      score: null,
      output: "",
      error: `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =============================================================================
// Commands
// =============================================================================

/**
 * Run evaluations
 */
async function runEvalsCommand(options: {
  suite?: string[];
  skipModel?: boolean;
  verbose?: boolean;
  k?: string;
  json?: boolean;
  output?: string;
  file?: string;
  rubric?: string;
}): Promise<void> {
  const projectPath = process.cwd();
  const dbPath = getEvalDbPath(projectPath);

  // Ensure directory exists
  const specflowDir = join(projectPath, ".specflow");
  if (!existsSync(specflowDir)) {
    console.error("No .specflow directory found. Run 'specflow init' first.");
    process.exit(1);
  }

  ensureGradersRegistered();
  initEvalDatabase(dbPath);

  try {
    // If --file and --rubric provided, run single file evaluation
    if (options.file && options.rubric) {
      const result = await runSingleFileEval(options.file, options.rubric, projectPath);

      if (options.json) {
        console.log(JSON.stringify({
          results: [result],
          passed: result.passed ? 1 : 0,
          failed: result.passed ? 0 : 1,
        }, null, 2));
      } else {
        console.log(`Score: ${((result.score ?? 0) * 100).toFixed(0)}%`);
        console.log(`Status: ${result.passed ? "PASSED" : "FAILED"}`);
        console.log(`\n${result.output}`);
      }

      process.exit(result.passed ? 0 : 1);
    }

    const result = await runEvals({
      projectPath,
      dbPath,
      suites: options.suite,
      skipModel: options.skipModel,
      verbose: options.verbose,
    });

    // Calculate pass@k if requested
    let passAtK: Record<number, number> | undefined;
    let passCaretK: number | undefined;

    if (options.k) {
      const k = parseInt(options.k, 10);
      const passingResults = result.results.map((r) => ({ passed: r.passed }));
      passAtK = {
        1: calculatePassAtK(passingResults, 1),
        [k]: calculatePassAtK(passingResults, k),
      };
      passCaretK = calculatePassCaretK(passingResults, k);
    }

    // Build report data
    const reportData: ReportData = {
      runId: result.runId,
      timestamp: new Date(),
      suites: result.suites,
      totalTests: result.totalTests,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      durationMs: result.durationMs,
      passRate: result.totalTests > 0 ? result.passed / result.totalTests : 0,
      passAtK,
      passCaretK,
      results: result.results,
    };

    // Generate output
    if (options.json) {
      const output = generateJsonReport(reportData);
      if (options.output) {
        writeFileSync(options.output, output);
        console.log(`Report written to ${options.output}`);
      } else {
        console.log(output);
      }
    } else {
      const output = generateMarkdownReport(reportData);
      if (options.output) {
        writeFileSync(options.output, output);
        console.log(`Report written to ${options.output}`);
      } else {
        console.log(output);
      }
    }

    // Exit with appropriate code
    process.exit(result.failed > 0 ? 1 : 0);
  } finally {
    closeEvalDatabase();
  }
}

/**
 * List test cases
 */
async function listTestCasesCommand(options: {
  suite?: string;
  json?: boolean;
}): Promise<void> {
  const projectPath = process.cwd();
  const dbPath = getEvalDbPath(projectPath);

  if (!existsSync(dbPath)) {
    console.error("No eval database found. Run 'specflow eval run' first.");
    process.exit(1);
  }

  initEvalDatabase(dbPath);

  try {
    const testCases = options.suite
      ? getTestCasesBySuite(options.suite)
      : getTestCases();

    const balance = getTestCaseBalance();

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            testCases: testCases.map((tc) => ({
              id: tc.id,
              name: tc.name,
              suite: tc.suite,
              type: tc.type,
              graderType: tc.graderType,
            })),
            balance,
          },
          null,
          2
        )
      );
    } else {
      console.log("# Test Cases\n");

      if (testCases.length === 0) {
        console.log("No test cases found.");
      } else {
        console.log("| ID | Name | Suite | Type | Grader |");
        console.log("|----|------|-------|------|--------|");
        for (const tc of testCases) {
          console.log(
            `| ${tc.id} | ${tc.name} | ${tc.suite} | ${tc.type} | ${tc.graderType} |`
          );
        }
      }

      console.log("\n## Balance");
      console.log(`- Positive: ${balance.positive}`);
      console.log(`- Negative: ${balance.negative}`);
      console.log(`- Total: ${balance.total}`);
      console.log(`- Ratio: ${(balance.ratio * 100).toFixed(1)}% positive`);
    }
  } finally {
    closeEvalDatabase();
  }
}

/**
 * Add a test case
 */
async function addTestCaseCommand(
  jsonConfig: string,
  options: { file?: string }
): Promise<void> {
  const projectPath = process.cwd();
  const dbPath = getEvalDbPath(projectPath);

  // Ensure directory exists
  const specflowDir = join(projectPath, ".specflow");
  if (!existsSync(specflowDir)) {
    console.error("No .specflow directory found. Run 'specflow init' first.");
    process.exit(1);
  }

  initEvalDatabase(dbPath);

  try {
    let config: AddTestCaseInput;

    if (options.file) {
      const content = await Bun.file(options.file).text();
      config = JSON.parse(content);
    } else {
      config = JSON.parse(jsonConfig);
    }

    // Validate required fields
    if (!config.id || !config.name || !config.suite || !config.type || !config.graderType) {
      console.error(
        "Missing required fields. Required: id, name, suite, type, graderType"
      );
      process.exit(1);
    }

    if (!config.graderConfig) {
      config.graderConfig = {};
    }

    addTestCase(config);
    console.log(`✓ Added test case: ${config.id} (${config.name})`);
  } catch (error) {
    console.error(`Failed to add test case: ${error}`);
    process.exit(1);
  } finally {
    closeEvalDatabase();
  }
}

/**
 * Remove a test case
 */
async function removeTestCaseCommand(
  testCaseId: string,
  options: { force?: boolean }
): Promise<void> {
  const projectPath = process.cwd();
  const dbPath = getEvalDbPath(projectPath);

  if (!existsSync(dbPath)) {
    console.error("No eval database found.");
    process.exit(1);
  }

  initEvalDatabase(dbPath);

  try {
    const balance = getTestCaseBalance();
    const testCases = getTestCases();
    const testCase = testCases.find((tc) => tc.id === testCaseId);

    if (!testCase) {
      console.error(`Test case not found: ${testCaseId}`);
      process.exit(1);
    }

    // Warn if removing would unbalance test suite
    if (!options.force) {
      if (testCase.type === "negative" && balance.negative <= 1) {
        console.error(
          "Warning: Removing this would leave no negative test cases."
        );
        console.error("Use --force to proceed anyway.");
        process.exit(1);
      }
    }

    deleteTestCase(testCaseId);
    console.log(`✓ Removed test case: ${testCaseId}`);
  } finally {
    closeEvalDatabase();
  }
}

/**
 * Show eval history
 */
async function historyCommand(options: {
  limit?: string;
  json?: boolean;
}): Promise<void> {
  const projectPath = process.cwd();
  const dbPath = getEvalDbPath(projectPath);

  if (!existsSync(dbPath)) {
    console.error("No eval database found. Run 'specflow eval run' first.");
    process.exit(1);
  }

  initEvalDatabase(dbPath);

  try {
    const limit = options.limit ? parseInt(options.limit, 10) : 10;
    const runs = getEvalRuns(limit);

    if (options.json) {
      console.log(JSON.stringify(runs, null, 2));
    } else {
      console.log("# Eval History\n");

      if (runs.length === 0) {
        console.log("No eval runs found.");
      } else {
        console.log("| Run ID | Timestamp | Passed | Failed | Duration |");
        console.log("|--------|-----------|--------|--------|----------|");
        for (const run of runs) {
          const ts = new Date(run.timestamp).toISOString().split("T")[0];
          console.log(
            `| ${run.id} | ${ts} | ${run.passed} | ${run.failed} | ${run.durationMs}ms |`
          );
        }
      }
    }
  } finally {
    closeEvalDatabase();
  }
}

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register eval commands with the main program
 */
export function evalCommand(program: Command): void {
  const eval_ = program
    .command("eval")
    .description("Run evaluations and manage test cases");

  eval_
    .command("run")
    .description("Run all evaluations")
    .option("--suite <suites...>", "Run specific suites only")
    .option("--skip-model", "Skip model-based evaluations")
    .option("--verbose", "Show detailed output")
    .option("-k <number>", "Calculate pass@k metrics")
    .option("--json", "Output as JSON")
    .option("--output <file>", "Write report to file")
    .option("--file <file>", "Evaluate a single file")
    .option("--rubric <rubric>", "Rubric to use for single file evaluation (e.g., spec-quality, plan-quality)")
    .action(runEvalsCommand);

  eval_
    .command("list")
    .description("List all test cases")
    .option("--suite <suite>", "Filter by suite")
    .option("--json", "Output as JSON")
    .action(listTestCasesCommand);

  eval_
    .command("add-case")
    .description("Add a new test case")
    .argument("[json]", "Test case configuration as JSON")
    .option("--file <file>", "Load configuration from JSON file")
    .action(addTestCaseCommand);

  eval_
    .command("remove-case")
    .description("Remove a test case")
    .argument("<test-case-id>", "Test case ID to remove")
    .option("--force", "Force removal even if it unbalances the suite")
    .action(removeTestCaseCommand);

  eval_
    .command("history")
    .description("Show eval run history")
    .option("--limit <n>", "Number of runs to show", "10")
    .option("--json", "Output as JSON")
    .action(historyCommand);
}
