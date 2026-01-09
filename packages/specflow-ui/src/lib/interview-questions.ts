/**
 * F-10: Interview Questions
 * Defines the 8 interview phases and their questions for project requirements gathering.
 */

export interface Question {
  id: string;
  text: string;
  placeholder?: string;
}

export interface Phase {
  id: number;
  name: string;
  description: string;
  questions: Question[];
}

export const INTERVIEW_PHASES: Phase[] = [
  {
    id: 1,
    name: "Problem Space",
    description: "Understanding the core problem and its urgency",
    questions: [
      {
        id: "1-1",
        text: "What's the real problem you're trying to solve?",
        placeholder: "Describe the core problem in plain language...",
      },
      {
        id: "1-2",
        text: "Why is this problem important to solve now?",
        placeholder: "What makes this urgent or timely...",
      },
      {
        id: "1-3",
        text: "What happens if we don't solve it?",
        placeholder: "Describe the consequences of inaction...",
      },
    ],
  },
  {
    id: 2,
    name: "Users & Stakeholders",
    description: "Identifying who will use and benefit from the solution",
    questions: [
      {
        id: "2-1",
        text: "Who are the primary users of this solution?",
        placeholder: "Describe the main user personas...",
      },
      {
        id: "2-2",
        text: "What is their technical level?",
        placeholder: "Beginner, intermediate, expert? Developer, end-user?",
      },
      {
        id: "2-3",
        text: "What constraints do users have?",
        placeholder: "Time, budget, environment, accessibility needs...",
      },
    ],
  },
  {
    id: 3,
    name: "Existing Context",
    description: "Understanding what already exists and integration points",
    questions: [
      {
        id: "3-1",
        text: "What already exists that this builds on or replaces?",
        placeholder: "Existing systems, tools, or processes...",
      },
      {
        id: "3-2",
        text: "What integration points are needed?",
        placeholder: "APIs, databases, external services, file formats...",
      },
    ],
  },
  {
    id: 4,
    name: "Constraints & Tradeoffs",
    description: "Balancing speed, quality, and cost",
    questions: [
      {
        id: "4-1",
        text: "What's more important: speed, quality, or cost?",
        placeholder: "Rank these priorities and explain why...",
      },
      {
        id: "4-2",
        text: "What are the performance requirements?",
        placeholder: "Response time, throughput, scalability needs...",
      },
      {
        id: "4-3",
        text: "What security considerations apply?",
        placeholder: "Authentication, authorization, data sensitivity...",
      },
    ],
  },
  {
    id: 5,
    name: "User Experience",
    description: "How users will discover and interact with the solution",
    questions: [
      {
        id: "5-1",
        text: "How will users discover and start using this?",
        placeholder: "Onboarding, documentation, discovery path...",
      },
      {
        id: "5-2",
        text: "What mental model should users have?",
        placeholder: "How should users think about this tool/system?",
      },
    ],
  },
  {
    id: 6,
    name: "Edge Cases & Failure Modes",
    description: "Planning for when things go wrong",
    questions: [
      {
        id: "6-1",
        text: "What's the worst case scenario?",
        placeholder: "What could go catastrophically wrong?",
      },
      {
        id: "6-2",
        text: "How should the system behave under load or stress?",
        placeholder: "Graceful degradation, rate limiting, queuing...",
      },
      {
        id: "6-3",
        text: "How should external failures be handled?",
        placeholder: "Network issues, API failures, missing data...",
      },
    ],
  },
  {
    id: 7,
    name: "Success Criteria",
    description: "Defining what 'done' looks like",
    questions: [
      {
        id: "7-1",
        text: "What defines success for this project?",
        placeholder: "Measurable outcomes, key results...",
      },
      {
        id: "7-2",
        text: "What's the minimum viable version?",
        placeholder: "The smallest thing that delivers value...",
      },
    ],
  },
  {
    id: 8,
    name: "Future & Scope",
    description: "What might change and what's out of scope",
    questions: [
      {
        id: "8-1",
        text: "What might change or evolve over time?",
        placeholder: "Anticipated future requirements...",
      },
      {
        id: "8-2",
        text: "What is explicitly out of scope?",
        placeholder: "Things we're intentionally NOT doing...",
      },
    ],
  },
];

export const TOTAL_PHASES = INTERVIEW_PHASES.length;

/**
 * Get a phase by its ID (1-indexed)
 */
export function getPhase(phaseId: number): Phase | undefined {
  return INTERVIEW_PHASES.find((p) => p.id === phaseId);
}

/**
 * Check if a phase ID is valid
 */
export function isValidPhase(phaseId: number): boolean {
  return phaseId >= 1 && phaseId <= TOTAL_PHASES;
}
