/**
 * Grader Interface Module
 * Defines core grader abstractions for evaluation infrastructure
 */

import type { GradeContext, GradeResult, GraderType, TestCase } from "../types";

// =============================================================================
// Grader Interface
// =============================================================================

/**
 * A grader evaluates a test case and returns a result.
 * Graders can be code-based (deterministic) or model-based (LLM-as-judge).
 */
export interface Grader {
  /** Unique grader name (e.g., "file-exists", "spec-quality") */
  name: string;
  /** Grader type: code (deterministic) or model (LLM-based) */
  type: GraderType;
  /**
   * Execute the grader on a test case
   * @param testCase - The test case to evaluate
   * @param context - Evaluation context (project path, etc.)
   * @returns Grade result with pass/fail, optional score, and output
   */
  grade(testCase: TestCase, context: GradeContext): Promise<GradeResult>;
}

// =============================================================================
// Grader Factory
// =============================================================================

/**
 * Factory for creating grader instances from configuration.
 * Each grader type has a factory that knows how to instantiate it.
 */
export interface GraderFactory {
  /** Factory name (matches grader name) */
  name: string;
  /**
   * Create a grader instance from configuration
   * @param config - Grader-specific configuration from test case
   * @returns Configured grader instance
   */
  create(config: Record<string, unknown>): Grader;
}

// =============================================================================
// Grader Registry
// =============================================================================

/**
 * Registry for managing available graders.
 * Allows dynamic registration and lookup of grader factories.
 */
export interface GraderRegistry {
  /** Map of grader name to factory */
  graders: Map<string, GraderFactory>;
  /**
   * Register a grader factory
   * @param factory - The factory to register
   */
  register(factory: GraderFactory): void;
  /**
   * Get a grader factory by name
   * @param name - Grader name
   * @returns Factory or undefined if not found
   */
  get(name: string): GraderFactory | undefined;
  /**
   * Check if a grader is registered
   * @param name - Grader name
   * @returns true if registered
   */
  has(name: string): boolean;
  /**
   * List all registered grader names
   * @returns Array of grader names
   */
  list(): string[];
}

// =============================================================================
// Default Registry Implementation
// =============================================================================

/**
 * Create a new grader registry
 */
export function createGraderRegistry(): GraderRegistry {
  const graders = new Map<string, GraderFactory>();

  return {
    graders,
    register(factory: GraderFactory): void {
      graders.set(factory.name, factory);
    },
    get(name: string): GraderFactory | undefined {
      return graders.get(name);
    },
    has(name: string): boolean {
      return graders.has(name);
    },
    list(): string[] {
      return Array.from(graders.keys());
    },
  };
}

// =============================================================================
// Global Registry Instance
// =============================================================================

/**
 * Global grader registry singleton.
 * Register all graders here for use by the eval runner.
 */
export const graderRegistry = createGraderRegistry();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a grader for a test case
 * @param testCase - Test case with grader configuration
 * @returns Configured grader instance
 * @throws Error if grader not found
 */
export function getGraderForTestCase(testCase: TestCase): Grader {
  // Extract grader name from config or use a default based on grader type
  const graderName = (testCase.graderConfig.grader as string) ?? testCase.graderType;

  const factory = graderRegistry.get(graderName);
  if (!factory) {
    throw new Error(`Unknown grader: ${graderName}. Available: ${graderRegistry.list().join(", ")}`);
  }

  return factory.create(testCase.graderConfig);
}

/**
 * Register a grader factory with the global registry
 * @param factory - Factory to register
 */
export function registerGrader(factory: GraderFactory): void {
  graderRegistry.register(factory);
}

// =============================================================================
// Re-exports
// =============================================================================

export type { GradeContext, GradeResult, GraderType, TestCase };
