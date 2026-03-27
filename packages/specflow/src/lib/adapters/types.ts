/**
 * Database Adapter Types
 * Type definitions for pluggable database backends
 */

import type {
  Feature,
  FeatureStatus,
  FeatureStats,
  SpecPhase,
  SkipReason,
  HardenResult,
  ReviewRecord,
  ApprovalGate,
  ProblemType,
  UrgencyType,
  PrimaryUserType,
  IntegrationScopeType,
  UsageContextType,
  DataRequirementsType,
  PerformanceRequirementsType,
  PriorityTradeoffType,
} from "../../types";

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Database configuration
 */
export interface DbConfig {
  backend: "sqlite" | "dolt" | "dolt-cli";
  sqlite?: SqliteConfig;
  dolt?: DoltConfig;
  doltCli?: DoltCliConfig;
}

/**
 * SQLite-specific configuration
 */
export interface SqliteConfig {
  /** Path to SQLite database file */
  path: string;
}

/**
 * Dolt-specific configuration
 */
export interface DoltConfig {
  /** Dolt server host (default: localhost) */
  host?: string;
  /** Dolt server port (default: 3306) */
  port?: number;
  /** Database user (default: root) */
  user?: string;
  /** Database password (default: empty) */
  password?: string;
  /** Database name */
  database: string;
  /** DoltHub remote URL (e.g., "dolthub-org/project") */
  remote?: string;
}

/**
 * Dolt CLI-mode configuration (serverless, no running server)
 */
export interface DoltCliConfig {
  /** Path to the Dolt data directory (default: .specflow/dolt) */
  path: string;
  /** DoltHub remote URL (e.g., "dolthub-org/project") */
  remote?: string;
}

// =============================================================================
// Feature Input Types
// =============================================================================

/**
 * Input for creating a new feature
 */
export interface NewFeature {
  id: string;
  name: string;
  description: string;
  priority: number;
  specPath?: string;
  migratedFrom?: string;

  // Rich decomposition fields (optional)
  problemType?: ProblemType;
  urgency?: UrgencyType;
  primaryUser?: PrimaryUserType;
  integrationScope?: IntegrationScopeType;
  usageContext?: UsageContextType;
  dataRequirements?: DataRequirementsType;
  performanceRequirements?: PerformanceRequirementsType;
  priorityTradeoff?: PriorityTradeoffType;
  uncertainties?: string[];
  clarificationNeeded?: string;
}

/**
 * Filters for querying features
 */
export interface FeatureFilters {
  status?: FeatureStatus;
  phase?: SpecPhase;
  priority?: number;
  limit?: number;
  offset?: number;
}

/**
 * Decomposition field updates
 */
export interface DecompositionUpdate {
  problemType?: ProblemType;
  urgency?: UrgencyType;
  primaryUser?: PrimaryUserType;
  integrationScope?: IntegrationScopeType;
  usageContext?: UsageContextType;
  dataRequirements?: DataRequirementsType;
  performanceRequirements?: PerformanceRequirementsType;
  priorityTradeoff?: PriorityTradeoffType;
  uncertainties?: string[];
  clarificationNeeded?: string;
}

// =============================================================================
// Version Control Types
// =============================================================================

/**
 * Version control status
 */
export interface VCStatus {
  clean: boolean;
  uncommittedChanges?: string[];
  branch?: string;
  remote?: string;
  ahead?: number;
  behind?: number;
}

// =============================================================================
// DatabaseAdapter Interface
// =============================================================================

/**
 * Database adapter interface
 * All database operations go through this interface
 */
export interface DatabaseAdapter {
  // ============================================
  // Connection Lifecycle
  // ============================================

  /**
   * Connect to database with adapter-specific config
   * Must be called before any operations
   */
  connect(config: DbConfig): Promise<void>;

  /**
   * Disconnect from database
   * Clean up connections, close handles
   */
  disconnect(): Promise<void>;

  // ============================================
  // Feature CRUD Operations
  // ============================================

  /**
   * Create a new feature
   * @throws if feature with same ID exists
   */
  createFeature(feature: NewFeature): Promise<void>;

  /**
   * Get feature by ID
   * @returns Feature or null if not found
   */
  getFeature(id: string): Promise<Feature | null>;

  /**
   * Update feature fields
   * @throws if feature not found
   */
  updateFeature(id: string, updates: Partial<Feature>): Promise<void>;

  /**
   * List features with optional filters
   * @returns Array of matching features
   */
  listFeatures(filters?: FeatureFilters): Promise<Feature[]>;

  /**
   * Delete feature by ID
   * @throws if feature not found
   */
  deleteFeature(id: string): Promise<void>;

  /**
   * Update feature status
   */
  updateFeatureStatus(id: string, status: FeatureStatus): Promise<void>;

  /**
   * Update feature phase
   */
  updateFeaturePhase(id: string, phase: SpecPhase): Promise<void>;

  /**
   * Update feature spec path
   */
  updateFeatureSpecPath(id: string, specPath: string): Promise<void>;

  /**
   * Update feature priority
   */
  updateFeaturePriority(id: string, priority: number): Promise<void>;

  /**
   * Update feature name
   */
  updateFeatureName(id: string, name: string): Promise<void>;

  /**
   * Update feature description
   */
  updateFeatureDescription(id: string, description: string): Promise<void>;

  /**
   * Update feature quick_start flag
   */
  updateFeatureQuickStart(id: string, quickStart: boolean): Promise<void>;

  /**
   * Update feature decomposition fields
   */
  updateFeatureDecomposition(id: string, updates: DecompositionUpdate): Promise<void>;

  /**
   * Skip a feature with validation
   * @returns Success result with optional error message
   */
  skipFeatureWithValidation(id: string, reason: SkipReason, justification: string, duplicateOf?: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Reset a feature to pending state
   */
  resetFeature(id: string): Promise<void>;

  /**
   * Clear all features from the database
   */
  clearAllFeatures(): Promise<void>;

  /**
   * Get the next pending feature (highest priority)
   */
  getNextFeature(): Promise<Feature | null>;

  /**
   * Get the next feature ready for implementation
   */
  getNextReadyFeature(): Promise<Feature | null>;

  /**
   * Get the next feature needing SpecFlow phases
   */
  getNextFeatureNeedingPhases(): Promise<Feature | null>;

  // ============================================
  // Stats and Queries
  // ============================================

  /**
   * Get aggregate statistics
   * @returns Counts by status, phase, etc.
   */
  getStats(): Promise<FeatureStats>;

  // ============================================
  // Extended Lifecycle Operations
  // ============================================

  /**
   * Get harden results for a feature
   */
  getHardenResults(featureId: string): Promise<HardenResult[]>;

  /**
   * Upsert a harden result
   */
  upsertHardenResult(featureId: string, testName: string, status: string, evidence: string | null): Promise<void>;

  /**
   * Clear harden results for a feature
   */
  clearHardenResults(featureId: string): Promise<void>;

  /**
   * Get latest review record for a feature
   */
  getLatestReviewRecord(featureId: string): Promise<ReviewRecord | null>;

  /**
   * Insert a review record
   */
  insertReviewRecord(featureId: string, passed: boolean, checksJson: string, acceptanceJson: string | null): Promise<void>;

  /**
   * Get approval gate for a feature
   */
  getApprovalGate(featureId: string): Promise<ApprovalGate | null>;

  /**
   * Get all pending approvals
   */
  getPendingApprovals(): Promise<ApprovalGate[]>;

  /**
   * Insert an approval gate
   */
  insertApprovalGate(featureId: string): Promise<void>;

  /**
   * Resolve an approval gate
   */
  resolveApprovalGate(featureId: string, status: "approved" | "rejected", reason?: string): Promise<void>;

  // ============================================
  // Version Control Operations (Optional)
  // Dolt-specific, no-op for SQLite
  // ============================================

  /**
   * Initialize version control for database
   * Dolt: dolt init + remote setup
   * SQLite: no-op
   */
  init?(): Promise<void>;

  /**
   * Get version control status
   * Dolt: uncommitted changes, branch info
   * SQLite: { clean: true }
   */
  status?(): Promise<VCStatus>;

  /**
   * Commit changes to version control
   * Dolt: dolt add . && dolt commit
   * SQLite: no-op
   */
  commit?(message: string): Promise<void>;

  /**
   * Push commits to remote
   * Dolt: dolt push origin
   * SQLite: no-op
   */
  push?(remote: string): Promise<void>;

  /**
   * Pull commits from remote
   * Dolt: dolt pull origin
   * SQLite: no-op
   */
  pull?(remote: string): Promise<void>;

  /**
   * Show commit log
   * Dolt: dolt log
   * SQLite: no-op (returns empty array)
   */
  log?(limit?: number): Promise<string[]>;

  /**
   * Show diff
   * Dolt: dolt diff
   * SQLite: no-op (returns empty string)
   */
  diff?(commit?: string): Promise<string>;

  // ============================================
  // Bulk Operations (for migrations)
  // ============================================

  /**
   * Bulk insert rows into a table
   * Used for efficient data migration
   * @param table Table name
   * @param columns Array of column names
   * @param rows Array of row values (each row is an array matching columns)
   */
  bulkInsert?(table: string, columns: string[], rows: any[][]): Promise<void>;

  /**
   * Get row count for a table
   * Used for migration verification
   * @param table Table name
   * @returns Number of rows in the table
   */
  getTableRowCount?(table: string): Promise<number>;
}
