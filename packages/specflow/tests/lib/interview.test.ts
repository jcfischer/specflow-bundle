/**
 * Interview Module Tests
 */

import { describe, it, expect } from "bun:test";
import {
  InterviewPhase,
  InterviewConfig,
  INTERVIEW_PHASES,
  DEFAULT_INTERVIEW_CONFIG,
  QUICK_INTERVIEW_CONFIG,
  getPhases,
  getRequiredPhases,
  getOptionalPhases,
  getPhaseQuestions,
  getAllQuestions,
  buildProgressivePrompt,
  getInterviewIntro,
} from "../../src/lib/interview";
import type { Feature } from "../../src/types";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockFeature: Feature = {
  id: "F-1",
  name: "User Authentication",
  description: "Allow users to log in with magic links",
  priority: 1,
  status: "pending",
  phase: "none",
  specPath: null,
  createdAt: new Date(),
  startedAt: null,
  completedAt: null,
  migratedFrom: null,
  quickStart: false,
};

// =============================================================================
// Types Tests
// =============================================================================

describe("INTERVIEW_PHASES", () => {
  it("should have 8 phases", () => {
    expect(INTERVIEW_PHASES).toHaveLength(8);
  });

  it("should have phases numbered 1-8", () => {
    const numbers = INTERVIEW_PHASES.map((p) => p.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("should have phases 1-3 as required", () => {
    const required = INTERVIEW_PHASES.filter((p) => p.required);
    expect(required).toHaveLength(3);
    expect(required.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("should have phases 4-8 as optional", () => {
    const optional = INTERVIEW_PHASES.filter((p) => !p.required);
    expect(optional).toHaveLength(5);
    expect(optional.map((p) => p.number)).toEqual([4, 5, 6, 7, 8]);
  });

  it("should have expected phase names", () => {
    const names = INTERVIEW_PHASES.map((p) => p.name);
    expect(names).toEqual([
      "Problem & Pain",
      "Users & Context",
      "Technical Context",
      "Constraints & Tradeoffs",
      "User Experience",
      "Edge Cases",
      "Success Criteria",
      "Scope & Future",
    ]);
  });

  it("should have at least one essential question per required phase", () => {
    const requiredPhases = INTERVIEW_PHASES.filter((p) => p.required);
    for (const phase of requiredPhases) {
      const essential = phase.questions.filter((q) => q.essential);
      expect(essential.length).toBeGreaterThan(0);
    }
  });

  it("should have questions with valid structure", () => {
    for (const phase of INTERVIEW_PHASES) {
      expect(phase.questions.length).toBeGreaterThan(0);
      for (const question of phase.questions) {
        expect(question.id).toBeTruthy();
        expect(question.header).toBeTruthy();
        expect(question.question).toBeTruthy();
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        for (const option of question.options) {
          expect(option.label).toBeTruthy();
          expect(option.description).toBeTruthy();
        }
      }
    }
  });
});

describe("DEFAULT_INTERVIEW_CONFIG", () => {
  it("should have correct required phases", () => {
    expect(DEFAULT_INTERVIEW_CONFIG.requiredPhases).toEqual([1, 2, 3]);
  });

  it("should have correct optional phases", () => {
    expect(DEFAULT_INTERVIEW_CONFIG.optionalPhases).toEqual([4, 5, 6, 7, 8]);
  });

  it("should not be in quick mode", () => {
    expect(DEFAULT_INTERVIEW_CONFIG.quickMode).toBe(false);
  });
});

describe("QUICK_INTERVIEW_CONFIG", () => {
  it("should have correct required phases", () => {
    expect(QUICK_INTERVIEW_CONFIG.requiredPhases).toEqual([1, 2, 3]);
  });

  it("should have no optional phases", () => {
    expect(QUICK_INTERVIEW_CONFIG.optionalPhases).toEqual([]);
  });

  it("should be in quick mode", () => {
    expect(QUICK_INTERVIEW_CONFIG.quickMode).toBe(true);
  });
});

// =============================================================================
// Helper Functions Tests
// =============================================================================

describe("getPhases", () => {
  it("should return phases by number", () => {
    const phases = getPhases([1, 3, 5]);
    expect(phases).toHaveLength(3);
    expect(phases.map((p) => p.number)).toEqual([1, 3, 5]);
  });

  it("should return empty array for non-existent phases", () => {
    const phases = getPhases([99, 100]);
    expect(phases).toHaveLength(0);
  });

  it("should return phases in original order", () => {
    const phases = getPhases([8, 1, 4]);
    expect(phases.map((p) => p.number)).toEqual([1, 4, 8]);
  });
});

describe("getRequiredPhases", () => {
  it("should return only required phases", () => {
    const required = getRequiredPhases();
    expect(required).toHaveLength(3);
    expect(required.every((p) => p.required)).toBe(true);
  });
});

describe("getOptionalPhases", () => {
  it("should return only optional phases", () => {
    const optional = getOptionalPhases();
    expect(optional).toHaveLength(5);
    expect(optional.every((p) => !p.required)).toBe(true);
  });
});

describe("getPhaseQuestions", () => {
  it("should return all questions when essentialOnly is false", () => {
    const phase1 = INTERVIEW_PHASES[0];
    const questions = getPhaseQuestions(phase1, false);
    expect(questions).toHaveLength(phase1.questions.length);
  });

  it("should return only essential questions when essentialOnly is true", () => {
    const phase1 = INTERVIEW_PHASES[0];
    const questions = getPhaseQuestions(phase1, true);
    expect(questions.every((q) => q.essential)).toBe(true);
  });
});

describe("getAllQuestions", () => {
  it("should return questions from all given phases", () => {
    const phases = getPhases([1, 2]);
    const questions = getAllQuestions(phases, false);
    const totalExpected = phases.reduce((sum, p) => sum + p.questions.length, 0);
    expect(questions).toHaveLength(totalExpected);
  });

  it("should return only essential questions when essentialOnly is true", () => {
    const phases = getPhases([1, 2, 3]);
    const questions = getAllQuestions(phases, true);
    expect(questions.every((q) => q.essential)).toBe(true);
  });
});

// =============================================================================
// Prompt Building Tests
// =============================================================================

describe("buildProgressivePrompt", () => {
  it("should include feature details", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("F-1");
    expect(prompt).toContain("User Authentication");
    expect(prompt).toContain("magic links");
  });

  it("should include spec path", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("/test/specs/f-1-auth/spec.md");
  });

  it("should include required phases", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("Problem & Pain");
    expect(prompt).toContain("Users & Context");
    expect(prompt).toContain("Technical Context");
    expect(prompt).toContain("(required)");
  });

  it("should include optional phases for default config", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("Constraints & Tradeoffs");
    expect(prompt).toContain("(optional)");
  });

  it("should include progressive disclosure instructions for default config", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("Progressive Disclosure");
    expect(prompt).toContain("Would you like to");
  });

  it("should include quick mode instructions when enabled", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      QUICK_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("Quick Mode Active");
    expect(prompt).toContain("quick-start: true");
    expect(prompt).toContain("QUICK START SPEC");
  });

  it("should not include progressive disclosure for quick mode", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      QUICK_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).not.toContain("Progressive Disclosure");
  });

  it("should include app context when provided", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth",
      "This is a React app with TypeScript"
    );
    expect(prompt).toContain("App Context");
    expect(prompt).toContain("React app with TypeScript");
    expect(prompt).toContain("app-level interview is complete");
  });

  it("should include question details for required phases", () => {
    const prompt = buildProgressivePrompt(
      mockFeature,
      DEFAULT_INTERVIEW_CONFIG,
      "/test/specs/f-1-auth"
    );
    expect(prompt).toContain("Core Problem");
    expect(prompt).toContain("Primary User");
    expect(prompt).toContain("Existing Systems");
  });
});

describe("getInterviewIntro", () => {
  it("should include feature name", () => {
    const intro = getInterviewIntro(mockFeature, DEFAULT_INTERVIEW_CONFIG);
    expect(intro).toContain("User Authentication");
  });

  it("should list all 8 phases for default config", () => {
    const intro = getInterviewIntro(mockFeature, DEFAULT_INTERVIEW_CONFIG);
    expect(intro).toContain("Problem & Pain");
    expect(intro).toContain("Scope & Future");
    expect(intro).toContain("(optional)");
  });

  it("should only list 3 phases for quick mode", () => {
    const intro = getInterviewIntro(mockFeature, QUICK_INTERVIEW_CONFIG);
    expect(intro).toContain("Problem & Pain");
    expect(intro).toContain("Technical Context");
    expect(intro).not.toContain("Constraints & Tradeoffs");
  });

  it("should include quick mode note when enabled", () => {
    const intro = getInterviewIntro(mockFeature, QUICK_INTERVIEW_CONFIG);
    expect(intro).toContain("Quick Mode");
    expect(intro).toContain("essential questions");
  });

  it("should not include quick mode note for default config", () => {
    const intro = getInterviewIntro(mockFeature, DEFAULT_INTERVIEW_CONFIG);
    expect(intro).not.toContain("Quick Mode");
  });
});
