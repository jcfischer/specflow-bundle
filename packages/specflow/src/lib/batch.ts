/**
 * Batch Specification Module
 * Enables non-interactive specification generation from rich decomposition data
 *
 * Council Decision (F-094):
 * - Rich decomposition (Option C) as primary mechanism
 * - Deferred queue (Option D) as fallback via clarification files
 */

import type {
  Feature,
  DecomposedFeature,
  ProblemType,
  UrgencyType,
  PrimaryUserType,
  IntegrationScopeType,
} from "../types";
import { getMissingBatchFields } from "../types";
import { writeFileSync } from "fs";
import { join } from "path";

// =============================================================================
// Types
// =============================================================================

export interface BatchValidationResult {
  /** Whether the feature is ready for batch processing */
  ready: boolean;
  /** Missing required fields (if not ready) */
  missingFields: string[];
  /** Fields with uncertainty markers */
  uncertainFields: string[];
}

export interface ClarificationItem {
  /** Field name needing clarification */
  field: string;
  /** Human-readable question */
  question: string;
  /** Available options (if enum type) */
  options?: string[];
  /** Context about why clarification is needed */
  context?: string;
}

export interface ClarificationFile {
  /** Feature ID */
  featureId: string;
  /** Feature name */
  featureName: string;
  /** Generated timestamp */
  generatedAt: string;
  /** Items needing clarification */
  items: ClarificationItem[];
}

// =============================================================================
// Human-readable mappings for spec generation
// =============================================================================

const PROBLEM_TYPE_DESCRIPTIONS: Record<ProblemType, string> = {
  manual_workaround: "Users currently handle this manually, which is painful and slow",
  impossible: "Users simply cannot accomplish this task with current tools",
  scattered: "Multiple disconnected tools and processes need to be unified",
  quality_issues: "The current approach leads to errors and inconsistency",
};

const URGENCY_DESCRIPTIONS: Record<UrgencyType, string> = {
  external_deadline: "External deadline driving timing (regulation, contract, or market)",
  growing_pain: "The problem is getting worse as usage increases",
  blocking_work: "Other priorities are blocked until this is resolved",
  user_demand: "Users are explicitly and actively requesting this capability",
};

const USER_TYPE_DESCRIPTIONS: Record<PrimaryUserType, string> = {
  developers: "Technical users who build and integrate with the system",
  end_users: "Non-technical users of the application",
  admins: "System administrators and operations team members",
  mixed: "Multiple user types with different needs and workflows",
};

const INTEGRATION_DESCRIPTIONS: Record<IntegrationScopeType, string> = {
  standalone: "Completely new component with minimal dependencies",
  extends_existing: "Extends an existing feature or module",
  multiple_integrations: "Requires connecting several internal systems",
  external_apis: "Requires integration with third-party services or APIs",
};

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate whether a feature is ready for batch specification
 */
export function validateBatchReady(feature: DecomposedFeature): BatchValidationResult {
  const missingFields = getMissingBatchFields(feature);
  const uncertainFields = feature.uncertainties ?? [];

  return {
    ready: missingFields.length === 0,
    missingFields,
    uncertainFields,
  };
}

/**
 * Format validation errors for CLI output
 * Returns empty string if ready (no errors to format)
 */
export function formatBatchErrors(featureId: string, result: BatchValidationResult): string {
  if (result.ready) {
    return "";
  }

  const lines: string[] = [];

  lines.push(`Error: Feature ${featureId} is not ready for batch mode.`);
  lines.push("");

  if (result.missingFields.length > 0) {
    lines.push("Missing required fields:");
    for (const field of result.missingFields) {
      lines.push(`  - ${field}`);
    }
    lines.push("");
  }

  if (result.uncertainFields.length > 0) {
    lines.push("Fields with uncertainty (will generate [TO BE CLARIFIED] markers):");
    for (const field of result.uncertainFields) {
      lines.push(`  - ${field}`);
    }
    lines.push("");
  }

  lines.push("To fix: Run 'specflow enrich " + featureId + "' to add missing data.");

  return lines.join("\n");
}

// =============================================================================
// Prompt Generation
// =============================================================================

/**
 * Build a non-interactive prompt for batch specification
 * Uses rich decomposition data instead of interview
 */
export function buildBatchPrompt(
  feature: Feature & DecomposedFeature,
  specPath: string,
  appContext?: string | null
): string {
  // Build context sections from decomposition data
  const problemContext = feature.problemType
    ? PROBLEM_TYPE_DESCRIPTIONS[feature.problemType]
    : "[TO BE CLARIFIED: problem type]";

  const urgencyContext = feature.urgency
    ? URGENCY_DESCRIPTIONS[feature.urgency]
    : "[TO BE CLARIFIED: urgency]";

  const userContext = feature.primaryUser
    ? USER_TYPE_DESCRIPTIONS[feature.primaryUser]
    : "[TO BE CLARIFIED: primary user]";

  const integrationContext = feature.integrationScope
    ? INTEGRATION_DESCRIPTIONS[feature.integrationScope]
    : "[TO BE CLARIFIED: integration scope]";

  // Build optional context sections
  const optionalSections: string[] = [];

  if (feature.usageContext) {
    optionalSections.push(`- **Usage Pattern**: ${feature.usageContext} workflow`);
  }
  if (feature.dataRequirements) {
    optionalSections.push(`- **Data**: ${feature.dataRequirements.replace(/_/g, " ")}`);
  }
  if (feature.performanceRequirements) {
    optionalSections.push(`- **Performance**: ${feature.performanceRequirements} response time`);
  }
  if (feature.priorityTradeoff) {
    optionalSections.push(`- **Priority**: Optimize for ${feature.priorityTradeoff}`);
  }

  const optionalContext = optionalSections.length > 0
    ? `\n### Additional Context\n${optionalSections.join("\n")}`
    : "";

  // Handle uncertainties
  const uncertaintyNote = feature.uncertainties && feature.uncertainties.length > 0
    ? `\n## Uncertainty Markers\n\nThe following aspects need human clarification. Mark these sections with [TO BE CLARIFIED]:\n${feature.uncertainties.map(u => `- ${u}`).join("\n")}\n`
    : "";

  const appContextSection = appContext
    ? `## App Context\n\n${appContext}\n\n`
    : "";

  return `# Batch Specification Generation

## Context & Motivation

Batch mode generates specifications non-interactively using pre-gathered requirements from the decomposition phase. This enables parallel specification of multiple features without blocking on user input—useful when processing an entire feature backlog or when requirements are already well-understood. Batch-generated specs include \`[TO BE CLARIFIED]\` markers for any gaps, allowing quick review and targeted refinement.

## Feature to Specify

**ID:** ${feature.id}
**Name:** ${feature.name}
**Description:** ${feature.description}
**Dependencies:** ${Array.isArray(feature.dependencies) && feature.dependencies.length > 0 ? feature.dependencies.join(", ") : "None"}
**Priority:** ${feature.priority}

${appContextSection}## Pre-Gathered Requirements (from decomposition)

### Problem & Pain
${problemContext}

### Urgency
${urgencyContext}

### Primary User
${userContext}

### Integration Scope
${integrationContext}
${optionalContext}
${uncertaintyNote}

## Instructions

This is batch mode—generate the specification directly from the requirements above without user interaction.

### Creating the Specification

Write the specification at: ${specPath}/spec.md

Include these sections:
- Overview (brief description based on the decomposition)
- User scenarios with Given/When/Then acceptance criteria
- Functional requirements (FR-1, FR-2, etc.)
- Non-functional requirements (derived from context above)
- Success criteria
- Assumptions (if any)
- \`[TO BE CLARIFIED]\` markers for any uncertain sections

Keep the specification focused on *what* and *why*—implementation details, technology choices, and code belong in later phases.

### Example Output Structure

\`\`\`markdown
# Specification: ${feature.name}

## Overview
[Brief description derived from feature decomposition]

## User Scenarios

### Scenario 1: [Primary Use Case]
- **Given** [initial context]
- **When** [action taken]
- **Then** [expected outcome]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | [Derived from problem context] | High |
| FR-2 | [Derived from user needs] | Medium |

## Non-Functional Requirements
- Performance: [Derived from performanceRequirements if available]
- [TO BE CLARIFIED]: [Any uncertain aspects]

## Success Criteria
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]
\`\`\`

## Output Format

### On Success

\`\`\`
[PHASE COMPLETE: SPECIFY]
Feature: ${feature.id}
Spec: ${specPath}/spec.md
Mode: batch (non-interactive)
Clarifications needed: [count of TO BE CLARIFIED markers]
\`\`\`

### On Blocker

\`\`\`
[PHASE BLOCKED: SPECIFY]
Feature: ${feature.id}
Reason: [explanation of what's blocking]
Suggestion: [how to resolve]
\`\`\``;
}

// =============================================================================
// Clarification File Generation
// =============================================================================

/**
 * Generate a clarification file for uncertain fields
 */
export function generateClarificationFile(
  feature: DecomposedFeature
): ClarificationFile {
  const items: ClarificationItem[] = [];

  // Add items for missing required fields
  const missingFields = getMissingBatchFields(feature);
  for (const field of missingFields) {
    items.push(fieldToClarificationItem(field));
  }

  // Add items for explicitly uncertain fields
  if (feature.uncertainties) {
    for (const field of feature.uncertainties) {
      if (!missingFields.includes(field)) {
        items.push({
          field,
          question: `Please clarify the "${field}" aspect of this feature.`,
          context: feature.clarificationNeeded ?? undefined,
        });
      }
    }
  }

  const clarification: ClarificationFile = {
    featureId: feature.id,
    featureName: feature.name,
    generatedAt: new Date().toISOString(),
    items,
  };

  return clarification;
}

/**
 * Write clarification file to disk
 */
export function writeClarificationFile(
  clarification: ClarificationFile,
  specPath: string
): string {
  const filePath = join(specPath, ".clarification.json");
  writeFileSync(filePath, JSON.stringify(clarification, null, 2));
  return filePath;
}

/**
 * Convert a field name to a clarification item with proper question
 */
function fieldToClarificationItem(field: string): ClarificationItem {
  const fieldMappings: Record<string, ClarificationItem> = {
    problemType: {
      field: "problemType",
      question: "What specific problem does this feature solve, and what do users do today without it?",
      options: ["manual_workaround", "impossible", "scattered", "quality_issues"],
    },
    urgency: {
      field: "urgency",
      question: "Why is solving this problem important NOW rather than later?",
      options: ["external_deadline", "growing_pain", "blocking_work", "user_demand"],
    },
    primaryUser: {
      field: "primaryUser",
      question: "Who is the PRIMARY user of this feature?",
      options: ["developers", "end_users", "admins", "mixed"],
    },
    integrationScope: {
      field: "integrationScope",
      question: "What existing systems or code does this feature need to integrate with?",
      options: ["standalone", "extends_existing", "multiple_integrations", "external_apis"],
    },
  };

  return fieldMappings[field] ?? {
    field,
    question: `Please provide details for "${field}".`,
  };
}
