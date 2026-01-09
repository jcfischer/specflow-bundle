/**
 * SpecFlow Type Definitions
 * Core types for feature queue management and agent orchestration
 */

// =============================================================================
// Feature Status
// =============================================================================

/**
 * Status of a feature in the queue
 */
export type FeatureStatus = "pending" | "in_progress" | "complete" | "skipped";

/**
 * SpecKit phase for a feature
 * Each feature must progress through: specify -> plan -> tasks -> implement
 */
export type SpecPhase = "none" | "specify" | "plan" | "tasks" | "implement";

// =============================================================================
// Feature
// =============================================================================

/**
 * A unit of work in the feature queue
 */
export interface Feature {
  /** Unique feature ID (e.g., "F-1", "F-2") */
  id: string;
  /** Short feature name */
  name: string;
  /** Description of what this feature does */
  description: string;
  /** Priority (lower = higher priority, implement first) */
  priority: number;
  /** Current status */
  status: FeatureStatus;
  /** Current SpecKit phase (none -> specify -> plan -> tasks -> implement) */
  phase: SpecPhase;
  /** Path to detailed spec directory (if specified) */
  specPath: string | null;
  /** When the feature was created */
  createdAt: Date;
  /** When implementation started */
  startedAt: Date | null;
  /** When implementation completed */
  completedAt: Date | null;
}

// =============================================================================
// App Context
// =============================================================================

/**
 * Application-level context shared with all feature implementations
 */
export interface AppContext {
  /** Absolute path to project root */
  projectPath: string;
  /** Path to app-level specification */
  appSpecPath: string;
  /** Path to .specify/memory/ directory */
  memoryPath: string;
  /** Technology stack (e.g., ["TypeScript", "Bun", "SQLite"]) */
  stack: string[];
  /** Architectural patterns from spec */
  patterns: string[];
}

// =============================================================================
// Run Session
// =============================================================================

/**
 * Tracks current execution session state
 */
export interface RunSession {
  /** When this run session started */
  startedAt: Date;
  /** Currently executing feature ID (if any) */
  currentFeatureId: string | null;
  /** Number of features completed in this session */
  featuresCompleted: number;
  /** Last error message (if any) */
  lastError: string | null;
}

// =============================================================================
// Feature Stats
// =============================================================================

/**
 * Aggregate statistics about the feature queue
 */
export interface FeatureStats {
  /** Total number of features */
  total: number;
  /** Features not yet started */
  pending: number;
  /** Features currently being implemented */
  inProgress: number;
  /** Features successfully completed */
  complete: number;
  /** Features skipped/deferred */
  skipped: number;
  /** Percentage complete (0-100) */
  percentComplete: number;
}

// =============================================================================
// Decomposed Feature
// =============================================================================

/**
 * Feature as output from decomposition (before adding to queue)
 */
export interface DecomposedFeature {
  /** Feature ID (e.g., "F-1") */
  id: string;
  /** Short feature name */
  name: string;
  /** Description of what this feature does */
  description: string;
  /** IDs of features this depends on */
  dependencies: string[];
  /** Priority (derived from dependencies) */
  priority: number;
}

// =============================================================================
// Feature Context
// =============================================================================

/**
 * Context prepared for a feature implementation agent
 */
export interface FeatureContext {
  /** App-level context */
  app: AppContext;
  /** The feature to implement */
  feature: Feature;
  /** Detailed spec content (if available) */
  specContent: string | null;
  /** Plan content (if available) */
  planContent: string | null;
  /** Tasks content (if available) */
  tasksContent: string | null;
}

// =============================================================================
// Run Options
// =============================================================================

/**
 * Options for the runner loop
 */
export interface RunOptions {
  /** Maximum features to implement (0 = unlimited) */
  maxFeatures: number;
  /** Delay between features in seconds */
  delaySeconds: number;
  /** Dry run (show what would happen without executing) */
  dryRun: boolean;
}

// =============================================================================
// Run Result
// =============================================================================

/**
 * Result of implementing a single feature
 */
export interface RunResult {
  /** Whether implementation succeeded */
  success: boolean;
  /** Feature ID */
  featureId: string;
  /** Output from the agent */
  output: string;
  /** Error message if failed */
  error: string | null;
  /** Whether feature was blocked (not failed) */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  blockReason: string | null;
}
