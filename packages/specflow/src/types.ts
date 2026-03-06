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
export type FeatureStatus = "pending" | "in_progress" | "complete" | "skipped" | "blocked";

/**
 * Reason for skipping a feature
 * Required when marking a feature as skipped
 */
export type SkipReason =
  | "duplicate"           // Feature is a duplicate of another
  | "deferred"            // Feature deferred to a later milestone
  | "blocked"             // Feature blocked by external dependency
  | "out_of_scope"        // Feature determined to be out of scope
  | "superseded";         // Feature replaced by different approach

/**
 * SpecFlow phase for a feature
 * Each feature must progress through: specify -> plan -> tasks -> implement
 * Extended lifecycle adds: harden -> review -> approve (opt-in)
 */
export type SpecPhase = "none" | "specify" | "plan" | "tasks" | "implement" | "harden" | "review" | "approve";

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
  /** Current SpecFlow phase (none -> specify -> plan -> tasks -> implement) */
  phase: SpecPhase;
  /** Path to detailed spec directory (if specified) */
  specPath: string | null;
  /** When the feature was created */
  createdAt: Date;
  /** When implementation started */
  startedAt: Date | null;
  /** When implementation completed */
  completedAt: Date | null;
  /** Original ID from SpecKit registry migration (e.g., "035") */
  migratedFrom: string | null;
  /** Whether this feature was specified in quick mode */
  quickStart: boolean;

  // ==========================================================================
  // Rich Decomposition Fields (for batch mode)
  // Populated from decomposition when available
  // ==========================================================================

  /** What type of problem this solves */
  problemType?: ProblemType;
  /** Why this is needed now */
  urgency?: UrgencyType;
  /** Who uses this feature */
  primaryUser?: PrimaryUserType;
  /** How it integrates with existing systems */
  integrationScope?: IntegrationScopeType;
  /** How often the feature is used */
  usageContext?: UsageContextType;
  /** What data the feature needs */
  dataRequirements?: DataRequirementsType;
  /** Performance requirements */
  performanceRequirements?: PerformanceRequirementsType;
  /** What matters most for this feature */
  priorityTradeoff?: PriorityTradeoffType;
  /** Fields where decomposition couldn't determine a value */
  uncertainties?: string[];
  /** Free-form notes on what needs human input */
  clarificationNeeded?: string;

  // ==========================================================================
  // Skip Audit Trail (populated when status = skipped)
  // ==========================================================================

  /** Why the feature was skipped */
  skipReason?: SkipReason;
  /** Detailed justification for the skip decision */
  skipJustification?: string;
  /** When the skip was validated */
  skipValidatedAt?: Date;
  /** If duplicate, which feature it duplicates */
  skipDuplicateOf?: string;
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
 * Problem type from interview question 1.1
 * Maps to: "What specific problem does this feature solve?"
 */
export type ProblemType =
  | "manual_workaround"    // Users do this manually but it's painful/slow
  | "impossible"           // Users simply cannot do this today
  | "scattered"            // Multiple tools/processes that should be unified
  | "quality_issues";      // Current approach leads to errors or inconsistency

/**
 * Urgency type from interview question 1.2
 * Maps to: "Why is solving this problem important NOW?"
 */
export type UrgencyType =
  | "external_deadline"    // Regulation, contract, or market timing
  | "growing_pain"         // Problem is getting worse as usage increases
  | "blocking_work"        // Can't proceed with other priorities until done
  | "user_demand";         // Users are explicitly requesting this

/**
 * Primary user type from interview question 2.1
 * Maps to: "Who is the PRIMARY user of this feature?"
 */
export type PrimaryUserType =
  | "developers"           // Technical users building or integrating
  | "end_users"            // Non-technical users of the application
  | "admins"               // System administrators or operations team
  | "mixed";               // Multiple user types with different needs

/**
 * Integration scope from interview question 3.1
 * Maps to: "What existing systems does this feature need to integrate with?"
 */
export type IntegrationScopeType =
  | "standalone"           // Completely new, minimal dependencies
  | "extends_existing"     // Adds to an existing feature or module
  | "multiple_integrations" // Needs to connect several systems
  | "external_apis";       // Requires third-party service integration

/**
 * Usage context from interview question 2.2 (optional)
 */
export type UsageContextType =
  | "daily"                // Part of regular, frequent tasks
  | "occasional"           // Used periodically when needed
  | "one_time"             // Configure once and rarely touch again
  | "emergency";           // Only used in specific situations

/**
 * Data requirements from interview question 3.2 (optional)
 */
export type DataRequirementsType =
  | "existing_only"        // Uses data already in the system
  | "new_model"            // Requires new database tables/schemas
  | "external_data"        // Needs to fetch data from external sources
  | "user_generated";      // Users will create/input new data

/**
 * Performance requirements from interview question 4.1 (optional)
 */
export type PerformanceRequirementsType =
  | "realtime"             // Must respond instantly (<100ms)
  | "interactive"          // Fast enough for smooth UX (<1s)
  | "background"           // Can process asynchronously
  | "none";                // Performance is not critical

/**
 * Priority tradeoff from interview question 4.2 (optional)
 */
export type PriorityTradeoffType =
  | "speed"                // Ship fast, iterate later
  | "quality"              // Well-architected, maintainable
  | "completeness"         // All requirements before release
  | "ux";                  // Polish and ease of use

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

  // ==========================================================================
  // Rich Decomposition Fields (for batch mode)
  // Required for --batch flag
  // ==========================================================================

  /** What type of problem this solves (required for batch) */
  problemType?: ProblemType;
  /** Why this is needed now (required for batch) */
  urgency?: UrgencyType;
  /** Who uses this feature (required for batch) */
  primaryUser?: PrimaryUserType;
  /** How it integrates with existing systems (required for batch) */
  integrationScope?: IntegrationScopeType;

  // ==========================================================================
  // Optional Rich Fields (for richer specs)
  // ==========================================================================

  /** How often the feature is used */
  usageContext?: UsageContextType;
  /** What data the feature needs */
  dataRequirements?: DataRequirementsType;
  /** Performance requirements */
  performanceRequirements?: PerformanceRequirementsType;
  /** What matters most for this feature */
  priorityTradeoff?: PriorityTradeoffType;

  // ==========================================================================
  // Uncertainty Handling (for fallback mechanism)
  // ==========================================================================

  /** Fields where decomposition couldn't determine a value */
  uncertainties?: string[];
  /** Free-form notes on what needs human input */
  clarificationNeeded?: string;
}

/**
 * Required fields for batch mode specification
 */
export const BATCH_REQUIRED_FIELDS = [
  "problemType",
  "urgency",
  "primaryUser",
  "integrationScope",
] as const;

/**
 * Type guard to check if a feature has all required batch fields
 */
export function isBatchReady(feature: DecomposedFeature): feature is DecomposedFeature & {
  problemType: ProblemType;
  urgency: UrgencyType;
  primaryUser: PrimaryUserType;
  integrationScope: IntegrationScopeType;
} {
  return (
    feature.problemType !== undefined &&
    feature.urgency !== undefined &&
    feature.primaryUser !== undefined &&
    feature.integrationScope !== undefined
  );
}

/**
 * Get missing batch fields for a feature
 */
export function getMissingBatchFields(feature: DecomposedFeature): string[] {
  const missing: string[] = [];
  if (!feature.problemType) missing.push("problemType");
  if (!feature.urgency) missing.push("urgency");
  if (!feature.primaryUser) missing.push("primaryUser");
  if (!feature.integrationScope) missing.push("integrationScope");
  return missing;
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

// =============================================================================
// Lifecycle Extension Types (F-089)
// =============================================================================

export interface HardenResult {
  id: number;
  featureId: string;
  testName: string;
  status: "pass" | "fail" | "skip" | "pending";
  evidence: string | null;
  ingestedAt: Date;
}

export interface ReviewRecord {
  id: number;
  featureId: string;
  reviewedAt: Date;
  passed: boolean;
  checksJson: string | null;
  acceptanceJson: string | null;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalGate {
  id: number;
  featureId: string;
  status: ApprovalStatus;
  triggeredAt: Date;
  resolvedAt: Date | null;
  rejectionReason: string | null;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  duration: number;
  output?: string;
}

export interface AlignmentResult {
  matched: number;
  missing: string[];
  references: string[];
}

export interface InboxItem {
  featureId: string;
  name: string;
  priority: "P0" | "P1" | "P2";
  verdict: string;
  timeInQueue: string;
  timeInQueueMs: number;
  action: string;
}

export interface AuditCheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

// =============================================================================
// Pipeline Visibility Types (F-090)
// =============================================================================

export type FailureType =
  | "typecheck"
  | "lint"
  | "test_failure"
  | "acceptance_failure"
  | "timeout"
  | "dependency"
  | "validation"
  | "unknown";

export type FailureRoute = "auto-fix" | "retry" | "escalate";

export type PipelineEventType =
  | "phase.started"
  | "phase.completed"
  | "phase.failed"
  | "gate.pending"
  | "gate.resolved"
  | "pipeline.blocked"
  | "pipeline.clear"
  | "session.started"
  | "session.ended";

export interface PipelineFeature {
  id: string;
  name: string;
  phase: SpecPhase;
  status: FeatureStatus;
  started_at: string;
  last_transition: string;
  session_id: string;
  blocked_reason: string | null;
  metrics: PipelineMetrics;
}

export interface PipelineMetrics {
  specs_complete?: number;
  specs_total?: number;
  tests_passing?: number;
  tests_total?: number;
}

export interface PipelineFailure {
  feature_id: string;
  phase: SpecPhase;
  failure_type: FailureType;
  failure_route: FailureRoute;
  message: string;
  occurred_at: string;
  recovered: boolean;
  retry_count: number;
}

export interface PipelineState {
  version: 1;
  updated_at: string;
  project: string;
  session_id: string;
  features: PipelineFeature[];
  failures: PipelineFailure[];
}

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: string;
  session_id: string;
  feature_id?: string;
  phase?: SpecPhase;
  data?: Record<string, unknown>;
}

export interface NotificationConfig {
  file: { enabled: boolean; path: string };
  webhook: { enabled: boolean; url: string | null };
  hooks: string[];
}
