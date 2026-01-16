/**
 * Interview Module
 * Progressive disclosure interview system for feature specification
 *
 * Council Design Decision (F-093):
 * - Phases 1-3 are required (core understanding)
 * - Phases 4-8 are optional (progressive disclosure)
 * - Quick mode uses only essential questions from phases 1-3
 */

import type { Feature } from "../types";

// =============================================================================
// Types
// =============================================================================

/**
 * A single interview phase with its questions
 */
export interface InterviewPhase {
  /** Phase number (1-8) */
  number: number;
  /** Display name of the phase */
  name: string;
  /** Whether this phase is required (phases 1-3) */
  required: boolean;
  /** Questions for this phase */
  questions: InterviewQuestion[];
}

/**
 * A single interview question
 */
export interface InterviewQuestion {
  /** Question ID within the phase */
  id: string;
  /** Short header for AskUserQuestion tool */
  header: string;
  /** Full question text */
  question: string;
  /** Whether this is an essential question (used in quick mode) */
  essential: boolean;
  /** Predefined options for the question */
  options: InterviewOption[];
}

/**
 * An option for an interview question
 */
export interface InterviewOption {
  /** Display label */
  label: string;
  /** Description of what this option means */
  description: string;
}

/**
 * Interview configuration
 */
export interface InterviewConfig {
  /** Required phase numbers (always asked) */
  requiredPhases: number[];
  /** Optional phase numbers (asked if user wants to continue) */
  optionalPhases: number[];
  /** Whether running in quick mode (essential questions only) */
  quickMode: boolean;
}

/**
 * Default interview configuration
 */
export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  requiredPhases: [1, 2, 3],
  optionalPhases: [4, 5, 6, 7, 8],
  quickMode: false,
};

/**
 * Quick mode interview configuration
 */
export const QUICK_INTERVIEW_CONFIG: InterviewConfig = {
  requiredPhases: [1, 2, 3],
  optionalPhases: [],
  quickMode: true,
};

// =============================================================================
// Interview Phases Definition
// =============================================================================

/**
 * All interview phases with their questions
 */
export const INTERVIEW_PHASES: InterviewPhase[] = [
  {
    number: 1,
    name: "Problem & Pain",
    required: true,
    questions: [
      {
        id: "1.1",
        header: "Core Problem",
        question: "What specific problem does this feature solve, and what do users do today without it?",
        essential: true,
        options: [
          { label: "Manual workaround", description: "Users do this manually but it's painful/slow" },
          { label: "Currently impossible", description: "Users simply cannot do this today" },
          { label: "Scattered solutions", description: "Multiple tools/processes that should be unified" },
          { label: "Quality issues", description: "Current approach leads to errors or inconsistency" },
        ],
      },
      {
        id: "1.2",
        header: "Urgency",
        question: "Why is solving this problem important NOW rather than later?",
        essential: true,
        options: [
          { label: "External deadline", description: "Regulation, contract, or market timing" },
          { label: "Growing pain", description: "Problem is getting worse as usage increases" },
          { label: "Blocking work", description: "Can't proceed with other priorities until this is done" },
          { label: "User demand", description: "Users are explicitly requesting this" },
        ],
      },
    ],
  },
  {
    number: 2,
    name: "Users & Context",
    required: true,
    questions: [
      {
        id: "2.1",
        header: "Primary User",
        question: "Who is the PRIMARY user of this feature?",
        essential: true,
        options: [
          { label: "Developers", description: "Technical users building or integrating" },
          { label: "End users", description: "Non-technical users of the application" },
          { label: "Admins/Ops", description: "System administrators or operations team" },
          { label: "Mixed audience", description: "Multiple user types with different needs" },
        ],
      },
      {
        id: "2.2",
        header: "Usage Context",
        question: "In what context will users primarily use this feature?",
        essential: false,
        options: [
          { label: "Daily workflow", description: "Part of regular, frequent tasks" },
          { label: "Occasional task", description: "Used periodically when needed" },
          { label: "One-time setup", description: "Configure once and rarely touch again" },
          { label: "Emergency use", description: "Only used in specific situations" },
        ],
      },
    ],
  },
  {
    number: 3,
    name: "Technical Context",
    required: true,
    questions: [
      {
        id: "3.1",
        header: "Existing Systems",
        question: "What existing systems or code does this feature need to integrate with?",
        essential: true,
        options: [
          { label: "New standalone", description: "Completely new, minimal dependencies" },
          { label: "Extends existing", description: "Adds to an existing feature or module" },
          { label: "Multiple integrations", description: "Needs to connect several systems" },
          { label: "External APIs", description: "Requires third-party service integration" },
        ],
      },
      {
        id: "3.2",
        header: "Data Requirements",
        question: "What data does this feature need to work with?",
        essential: false,
        options: [
          { label: "Existing data only", description: "Uses data already in the system" },
          { label: "New data model", description: "Requires new database tables/schemas" },
          { label: "External data", description: "Needs to fetch data from external sources" },
          { label: "User-generated", description: "Users will create/input new data" },
        ],
      },
    ],
  },
  {
    number: 4,
    name: "Constraints & Tradeoffs",
    required: false,
    questions: [
      {
        id: "4.1",
        header: "Performance",
        question: "What are the performance requirements for this feature?",
        essential: false,
        options: [
          { label: "Real-time (<100ms)", description: "Must respond instantly" },
          { label: "Interactive (<1s)", description: "Fast enough for smooth UX" },
          { label: "Background OK", description: "Can process asynchronously" },
          { label: "No strict requirement", description: "Performance is not critical" },
        ],
      },
      {
        id: "4.2",
        header: "Priority Tradeoff",
        question: "If you had to choose, which is most important?",
        essential: false,
        options: [
          { label: "Speed of delivery", description: "Ship fast, iterate later" },
          { label: "Code quality", description: "Well-architected, maintainable" },
          { label: "Feature completeness", description: "All requirements before release" },
          { label: "User experience", description: "Polish and ease of use" },
        ],
      },
    ],
  },
  {
    number: 5,
    name: "User Experience",
    required: false,
    questions: [
      {
        id: "5.1",
        header: "Discovery",
        question: "How should users discover and access this feature?",
        essential: false,
        options: [
          { label: "Main navigation", description: "Prominent, always visible" },
          { label: "Contextual", description: "Appears when relevant" },
          { label: "Settings/config", description: "In preferences or admin area" },
          { label: "Command/keyboard", description: "Via command palette or shortcuts" },
        ],
      },
      {
        id: "5.2",
        header: "Error Handling",
        question: "How should errors be communicated to users?",
        essential: false,
        options: [
          { label: "Inline feedback", description: "Errors shown where they occur" },
          { label: "Toast/notification", description: "Non-blocking alert messages" },
          { label: "Modal/blocking", description: "Require acknowledgment before continuing" },
          { label: "Silent + log", description: "Log for debugging, don't disturb user" },
        ],
      },
    ],
  },
  {
    number: 6,
    name: "Edge Cases",
    required: false,
    questions: [
      {
        id: "6.1",
        header: "Failure Mode",
        question: "What's the worst thing that could go wrong with this feature?",
        essential: false,
        options: [
          { label: "Data loss", description: "User loses important data" },
          { label: "Security breach", description: "Unauthorized access or exposure" },
          { label: "System crash", description: "Feature brings down other systems" },
          { label: "Poor UX", description: "Confusing or frustrating experience" },
        ],
      },
      {
        id: "6.2",
        header: "Recovery",
        question: "How should the system recover from failures?",
        essential: false,
        options: [
          { label: "Auto-retry", description: "Automatically attempt again" },
          { label: "User choice", description: "Let user decide to retry or cancel" },
          { label: "Rollback", description: "Undo partial changes automatically" },
          { label: "Manual intervention", description: "Admin/support must resolve" },
        ],
      },
    ],
  },
  {
    number: 7,
    name: "Success Criteria",
    required: false,
    questions: [
      {
        id: "7.1",
        header: "Definition of Done",
        question: "What must be true for this feature to be considered complete?",
        essential: false,
        options: [
          { label: "Core functionality", description: "Basic feature works" },
          { label: "Full test coverage", description: "All paths tested" },
          { label: "Documentation", description: "User and dev docs complete" },
          { label: "Performance validated", description: "Meets performance targets" },
        ],
      },
      {
        id: "7.2",
        header: "Success Metric",
        question: "How will you measure if this feature is successful?",
        essential: false,
        options: [
          { label: "Usage adoption", description: "Percentage of users using it" },
          { label: "Time saved", description: "Reduction in task completion time" },
          { label: "Error reduction", description: "Fewer support tickets or bugs" },
          { label: "User satisfaction", description: "Feedback scores or NPS" },
        ],
      },
    ],
  },
  {
    number: 8,
    name: "Scope & Future",
    required: false,
    questions: [
      {
        id: "8.1",
        header: "MVP Scope",
        question: "What's the minimum viable version of this feature?",
        essential: false,
        options: [
          { label: "Single use case", description: "Solve one scenario perfectly" },
          { label: "Basic CRUD", description: "Create, read, update, delete" },
          { label: "Read-only first", description: "Display only, no modifications" },
          { label: "Manual fallback", description: "Automated with manual option" },
        ],
      },
      {
        id: "8.2",
        header: "Out of Scope",
        question: "What should explicitly NOT be included in this version?",
        essential: false,
        options: [
          { label: "Advanced config", description: "Customization beyond basics" },
          { label: "Edge platforms", description: "Mobile, tablet, etc." },
          { label: "Bulk operations", description: "Processing multiple items at once" },
          { label: "Reporting/analytics", description: "Metrics and dashboards" },
        ],
      },
    ],
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get phases by their numbers
 */
export function getPhases(phaseNumbers: number[]): InterviewPhase[] {
  return INTERVIEW_PHASES.filter((p) => phaseNumbers.includes(p.number));
}

/**
 * Get required phases
 */
export function getRequiredPhases(): InterviewPhase[] {
  return INTERVIEW_PHASES.filter((p) => p.required);
}

/**
 * Get optional phases
 */
export function getOptionalPhases(): InterviewPhase[] {
  return INTERVIEW_PHASES.filter((p) => !p.required);
}

/**
 * Get questions for a phase, optionally filtered to essential only
 */
export function getPhaseQuestions(phase: InterviewPhase, essentialOnly: boolean): InterviewQuestion[] {
  if (essentialOnly) {
    return phase.questions.filter((q) => q.essential);
  }
  return phase.questions;
}

/**
 * Get all questions for given phases
 */
export function getAllQuestions(
  phases: InterviewPhase[],
  essentialOnly: boolean
): InterviewQuestion[] {
  return phases.flatMap((p) => getPhaseQuestions(p, essentialOnly));
}

// =============================================================================
// Prompt Building
// =============================================================================

/**
 * Build a progressive interview prompt for the specify phase
 *
 * @param feature - The feature being specified
 * @param config - Interview configuration
 * @param specPath - Path where spec.md will be written
 * @param appContext - Optional app context from init interview
 * @returns Prompt string for Claude
 */
export function buildProgressivePrompt(
  feature: Feature,
  config: InterviewConfig,
  specPath: string,
  appContext?: string | null
): string {
  const requiredPhases = getPhases(config.requiredPhases);
  const optionalPhases = getPhases(config.optionalPhases);

  const contextSection = appContext
    ? `## App Context (from init interview)

${appContext}

The app-level interview is complete. Use this context to inform feature-specific questions—focus on what's unique to this feature rather than re-covering app-level concerns.

`
    : "";

  const requiredPhasesText = requiredPhases
    .map((p) => `${p.number}. **${p.name}** (required)`)
    .join("\n");

  const optionalPhasesText = optionalPhases.length > 0
    ? optionalPhases.map((p) => `${p.number}. **${p.name}** (optional)`).join("\n")
    : "";

  const quickModeInstructions = config.quickMode
    ? `
## Quick Mode Active

This is a QUICK START specification. Focus on essential questions only from phases 1-3.
Generate a spec with \`[TO BE REFINED]\` markers for sections that need more detail.
Add this header to the spec:

\`\`\`markdown
---
quick-start: true
created: ${new Date().toISOString()}
status: draft
---

# Specification: ${feature.name}

> ⚡ **QUICK START SPEC** - Refine before production use
\`\`\`
`
    : "";

  const progressiveInstructions = !config.quickMode && optionalPhases.length > 0
    ? `
## Progressive Disclosure

After completing the required phases (1-3), ask the user:

"I have enough information to create a basic specification. Would you like to:
1. **Continue** - Answer more questions for a more detailed spec (phases 4-8)
2. **Generate now** - Create the spec with [TO BE REFINED] markers for optional sections"

If user chooses to continue, proceed through phases 4-8.
If user chooses to generate now, create the spec with [TO BE REFINED] markers.
`
    : "";

  const questionInstructions = requiredPhases
    .map((phase) => {
      const questions = getPhaseQuestions(phase, config.quickMode);
      const questionList = questions
        .map((q) => `   - **${q.header}**: ${q.question}`)
        .join("\n");
      return `### Phase ${phase.number}: ${phase.name}
${questionList}`;
    })
    .join("\n\n");

  return `# Feature Specification Interview

## Context & Motivation

Progressive disclosure interviews gather requirements in layers—core understanding first (phases 1-3), then optional depth (phases 4-8). This approach respects users' time while ensuring critical requirements are captured. Research shows that front-loading all questions leads to superficial answers, while progressive disclosure achieves 40% more actionable requirements.

## Feature to Specify

**ID:** ${feature.id}
**Name:** ${feature.name}
**Description:** ${feature.description}

${contextSection}## Interview Structure

This interview uses progressive disclosure:

**Required Phases (always asked):**
${requiredPhasesText}

${optionalPhasesText ? `**Optional Phases (if user wants more detail):**\n${optionalPhasesText}\n` : ""}
${quickModeInstructions}
${progressiveInstructions}

## Required Phase Questions

${questionInstructions}

## Example Interview Flow

\`\`\`
Phase 1: Problem & Pain
─────────────────────────
You: "What specific problem does this feature solve?"
User: "Manual workaround - users export data to Excel, clean it, then re-import"
You: "Why is solving this now rather than later important?"
User: "Blocking work - the analytics team needs this before Q2 planning"

[Adapt follow-up based on answers]
You: "You mentioned Excel export/import. How often does this happen?"
User: "Daily for some users, weekly for others"

Phase 2: Users & Context
─────────────────────────
You: "Who is the primary user of this feature?"
User: "End users - specifically data analysts"
...

[After Phase 3, if not quick mode]
You: "I have enough context for a basic spec. Would you like to continue
      with optional phases for more detail, or generate now?"
\`\`\`

## Instructions

### Conducting the Interview

1. **Use AskUserQuestion tool** for each phase question
2. **Adapt questions** based on feature type and previous answers
3. **Ask follow-ups** when answers reveal complexity or ambiguity
4. **After phase 3**: Ask if user wants to continue (unless quick mode)

### Creating the Specification

Write the specification at: ${specPath}/spec.md

Include these sections:
- Overview (brief description)
- User scenarios with Given/When/Then acceptance criteria
- Functional requirements (FR-1, FR-2, etc.)
- Non-functional requirements (if applicable)
- Success criteria
- Assumptions (if any)
- \`[TO BE REFINED]\` markers for any incomplete sections

Keep the specification focused on *what* and *why*—implementation details, technology choices, and code belong in later phases.

## Output Format

### On Success

\`\`\`
[PHASE COMPLETE: SPECIFY]
Feature: ${feature.id}
Spec: ${specPath}/spec.md
Phases completed: X/8${config.quickMode ? " (quick mode)" : ""}
\`\`\`

### On Blocker

\`\`\`
[PHASE BLOCKED: SPECIFY]
Feature: ${feature.id}
Reason: [explanation of what's blocking]
Suggestion: [how to resolve]
\`\`\``;
}

/**
 * Get the interview introduction message
 */
export function getInterviewIntro(feature: Feature, config: InterviewConfig): string {
  const phaseList = config.quickMode
    ? "1. Problem & Pain\n2. Users & Context\n3. Technical Context"
    : `1. Problem & Pain - What we're really solving
2. Users & Context - Who benefits and how
3. Technical Context - What exists today
4. Constraints & Tradeoffs - What matters most (optional)
5. User Experience - How it should feel (optional)
6. Edge Cases - What could go wrong (optional)
7. Success Criteria - How we know it's done (optional)
8. Scope & Future - What's in and out (optional)`;

  const quickNote = config.quickMode
    ? "\n\n⚡ **Quick Mode**: We'll focus on essential questions to create a draft spec quickly."
    : "";

  return `I'll help you specify **${feature.name}**. Before writing any specification, I want to understand your requirements through a series of questions.

This interview covers:
${phaseList}${quickNote}

Let's begin.`;
}
