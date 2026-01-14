/**
 * Eval Module
 * Re-exports all evaluation infrastructure components
 */

// =============================================================================
// Types
// =============================================================================

export type {
  TestCase,
  TestCaseType,
  EvalResult,
  EvalRun,
  Rubric,
  RubricCriterion,
  GradeContext,
  GradeResult,
  GraderType,
  RunOptions,
  ReportOptions,
} from "./types";

// =============================================================================
// Database
// =============================================================================

export {
  // Initialization
  initEvalDatabase,
  closeEvalDatabase,
  getEvalDbPath,
  EVAL_DB_FILENAME,
  // Test cases
  addTestCase,
  getTestCase,
  getTestCases,
  getTestCasesBySuite,
  deleteTestCase,
  getTestCaseBalance,
  // Eval runs
  addEvalRun,
  getEvalRun,
  getEvalRuns,
  // Eval results
  addEvalResult,
  getEvalResults,
} from "./database";

export type { AddTestCaseInput, AddEvalRunInput, AddEvalResultInput } from "./database";

// =============================================================================
// Graders
// =============================================================================

export {
  // Registry
  graderRegistry,
  createGraderRegistry,
  registerGrader,
  getGraderForTestCase,
} from "./graders";

export type { Grader, GraderFactory, GraderRegistry } from "./graders";

// =============================================================================
// Code-Based Graders
// =============================================================================

export {
  fileExistsGrader,
  schemaValidGrader,
  phaseGateGrader,
  sectionPresentGrader,
  registerCodeGraders,
} from "./graders/code-based";

// =============================================================================
// Model-Based Graders
// =============================================================================

export {
  parseRubricYaml,
  validateRubric,
  loadRubric,
  getRubric,
  clearRubricCache,
  buildGradingPrompt,
  parseGradingResponse,
  modelGrader,
  registerModelGraders,
} from "./graders/model-based";

export type { RubricValidation } from "./graders/model-based";

// =============================================================================
// Runner
// =============================================================================

export { runEvals } from "./runner";

export type { EvalRunnerOptions, EvalRunnerResult, EvalResultWithTest } from "./runner";

// =============================================================================
// Reporter
// =============================================================================

export {
  calculatePassAtK,
  calculatePassCaretK,
  generateMarkdownReport,
  generateJsonReport,
} from "./reporter";

export type { ReportData } from "./reporter";
