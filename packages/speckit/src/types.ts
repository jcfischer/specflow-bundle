/**
 * SpecKit Types - Spec numbering and registry management
 */

/**
 * Status of a specification
 */
export type SpecStatus = "draft" | "in-progress" | "completed" | "archived";

/**
 * A single spec entry in the registry
 */
export interface SpecEntry {
  /** Unique 3-digit identifier (e.g., "001", "002") */
  id: string;
  /** Feature name/slug (e.g., "clean-inbox", "resona-migration") */
  feature: string;
  /** Skill name the spec belongs to (e.g., "email", "tana") */
  skill: string;
  /** Relative path from skills directory to spec folder */
  path: string;
  /** Current status of the specification */
  status: SpecStatus;
  /** ISO date string when spec was created */
  created: string;
  /** Optional title for display */
  title?: string;
}

/**
 * The spec registry file format
 */
export interface SpecRegistry {
  /** Schema version for forward compatibility */
  version: string;
  /** Last assigned ID number (used to generate next ID) */
  lastId: number;
  /** Array of all registered specs */
  specs: SpecEntry[];
}

/**
 * Options for assigning a new spec ID
 */
export interface AssignOptions {
  /** Feature slug */
  feature: string;
  /** Skill name */
  skill: string;
  /** Path to spec directory (relative to skills) */
  path: string;
  /** Initial status (defaults to "draft") */
  status?: SpecStatus;
  /** Creation date (defaults to today) */
  created?: string;
  /** Optional title */
  title?: string;
}

/**
 * Result of a registry operation
 */
export interface RegistryResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Frontmatter from a spec.md file
 */
export interface SpecFrontmatter {
  id?: string;
  feature: string;
  status: SpecStatus;
  created: string;
}

/**
 * An unregistered spec discovered during scan
 */
export interface UnregisteredSpec {
  /** Feature name/slug derived from directory name */
  feature: string;
  /** Skill name derived from parent directory */
  skill: string;
  /** Relative path from skills directory to spec folder */
  path: string;
  /** Status from frontmatter if available */
  status?: SpecStatus;
  /** Created date from frontmatter if available */
  created?: string;
  /** Full path to spec.md file */
  specPath: string;
}
