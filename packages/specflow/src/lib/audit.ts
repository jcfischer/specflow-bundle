/**
 * Audit Library
 * Spec-reality drift detection checks
 */

import { join } from "path";
import { existsSync } from "fs";
import type { Feature, AuditCheckResult } from "../types";
import { checkFileAlignment } from "./review";

// Phase → expected artifact files
const PHASE_ARTIFACTS: Record<string, string[]> = {
  specify: ["spec.md"],
  plan: ["spec.md", "plan.md"],
  tasks: ["spec.md", "plan.md", "tasks.md"],
  implement: ["spec.md", "plan.md", "tasks.md"],
  harden: ["spec.md", "plan.md", "tasks.md"],
  review: ["spec.md", "plan.md", "tasks.md"],
  approve: ["spec.md", "plan.md", "tasks.md"],
};

/**
 * Check that database status is consistent with phase
 */
export function checkDbStatus(feature: Feature): AuditCheckResult {
  // A feature at implement or beyond should be in_progress or complete
  if (
    (feature.phase === "implement" || feature.phase === "harden" || feature.phase === "review" || feature.phase === "approve") &&
    feature.status === "pending"
  ) {
    return {
      name: "DB status consistency",
      passed: false,
      message: `Phase is '${feature.phase}' but status is 'pending' — expected 'in_progress' or 'complete'`,
    };
  }

  // A complete feature should have a non-none phase
  if (feature.status === "complete" && feature.phase === "none") {
    return {
      name: "DB status consistency",
      passed: false,
      message: "Status is 'complete' but phase is 'none' — no phases were recorded",
    };
  }

  return {
    name: "DB status consistency",
    passed: true,
    message: `Phase '${feature.phase}' consistent with status '${feature.status}'`,
  };
}

/**
 * Check that expected artifacts exist for the current phase
 */
export function checkArtifactCompleteness(feature: Feature): AuditCheckResult {
  if (!feature.specPath) {
    if (feature.phase === "none") {
      return {
        name: "Phase artifacts",
        passed: true,
        message: "No spec path (phase: none) — OK",
      };
    }
    return {
      name: "Phase artifacts",
      passed: false,
      message: `Phase is '${feature.phase}' but no spec path configured`,
    };
  }

  const expected = PHASE_ARTIFACTS[feature.phase] || [];
  const missing: string[] = [];

  for (const file of expected) {
    if (!existsSync(join(feature.specPath, file))) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return {
      name: "Phase artifacts",
      passed: false,
      message: `Missing ${missing.length} artifact(s) for phase '${feature.phase}'`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  return {
    name: "Phase artifacts",
    passed: true,
    message: `All ${expected.length} artifact(s) present for phase '${feature.phase}'`,
  };
}

/**
 * Check spec-code alignment (backtick file references)
 */
export function checkSpecCodeAlignment(feature: Feature, projectPath: string): AuditCheckResult {
  if (!feature.specPath) {
    return {
      name: "Spec-code alignment",
      passed: true,
      message: "No spec path — skipped",
    };
  }

  const alignment = checkFileAlignment(feature.specPath, projectPath);

  if (alignment.references.length === 0) {
    return {
      name: "Spec-code alignment",
      passed: true,
      message: "No file references in spec",
    };
  }

  if (alignment.missing.length > 0) {
    return {
      name: "Spec-code alignment",
      passed: false,
      message: `${alignment.missing.length} referenced file(s) missing`,
      details: alignment.missing.map((m) => `Missing: ${m}`),
    };
  }

  return {
    name: "Spec-code alignment",
    passed: true,
    message: `All ${alignment.references.length} referenced file(s) found`,
  };
}

/**
 * Run all audit checks for a feature
 */
export function runFeatureAudit(feature: Feature, projectPath: string): AuditCheckResult[] {
  return [
    checkDbStatus(feature),
    checkArtifactCompleteness(feature),
    checkSpecCodeAlignment(feature, projectPath),
  ];
}
