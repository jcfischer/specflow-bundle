/**
 * Contrib Prep Module
 * Contribution preparation workflow for extracting code from private trunk
 */

export {
  getContribState,
  createContribState,
  updateContribGate,
  updateContribInventory,
  updateContribSanitization,
  updateContribTag,
  updateContribBranch,
  updateContribVerification,
  deleteContribState,
} from "./state";

export type { ContribPrepState } from "./state";

export { classifyFile, getExclusionReason } from "./patterns";
export type { FileClassification, ClassificationResult } from "./patterns";

export { generateInventory, getTrackedFiles } from "./inventory";
export type { InventoryEntry, InventoryResult } from "./inventory";

export {
  scanCustomPatterns,
  scanGitleaks,
  isGitleaksInstalled,
  runSanitization,
  loadAllowlist,
} from "./sanitize";
export type {
  SanitizationFinding,
  SanitizationReport,
  AllowlistEntry,
} from "./sanitize";

export {
  runExtraction,
  isWorkingTreeClean,
  tagExists,
  branchExists,
  getCurrentBranch,
  getRefHash,
} from "./extract";
export type { ExtractionOptions, ExtractionResult } from "./extract";

export {
  runVerification,
  checkInventoryMatch,
  checkSanitization,
  checkDependencies,
  checkTests,
} from "./verify";
export type {
  VerificationCheck,
  VerificationReport,
  VerificationOptions,
} from "./verify";

export {
  getGateTitle,
  interactiveApprover,
  createAutoApprover,
  createRejectAtGateApprover,
  buildInventoryGateContext,
  buildSanitizationGateContext,
  buildPreExtractionGateContext,
  buildPostExtractionGateContext,
  buildVerificationGateContext,
} from "./gates";
export type { GateContext, GateApprover } from "./gates";

export { runContribWorkflow } from "./workflow";
export type { WorkflowOptions, WorkflowResult } from "./workflow";
