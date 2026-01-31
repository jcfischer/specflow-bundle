/**
 * Contrib Prep Patterns Module
 * File classification patterns for contribution inventory
 */

// =============================================================================
// Classification Result
// =============================================================================

export type FileClassification = "include" | "exclude" | "review";

export interface ClassificationResult {
  classification: FileClassification;
  reason: string;
}

// =============================================================================
// Exclusion Patterns
// =============================================================================

/** Files/directories that are always excluded (secrets, personal config, state) */
const AUTO_EXCLUDE_EXACT: string[] = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  "settings.json",
  ".specflow/features.db",
  ".specflow/features.db-shm",
  ".specflow/features.db-wal",
  ".specflow/evals.db",
  ".specflow/evals.db-shm",
  ".specflow/evals.db-wal",
  "bun.lock",
];

/** Directory prefixes that are always excluded */
const AUTO_EXCLUDE_DIRS: string[] = [
  "node_modules/",
  ".git/",
  "MEMORY/",
  ".specflow/contrib/",
  ".specflow/specs/",
];

/** File extensions that are always excluded */
const AUTO_EXCLUDE_EXTENSIONS: string[] = [
  ".db",
  ".db-shm",
  ".db-wal",
  ".sqlite",
  ".sqlite-shm",
  ".sqlite-wal",
];

/** Glob-like patterns for exclusion */
const AUTO_EXCLUDE_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/,          // .env files at root
  /\/\.env(\..+)?$/,         // .env files in subdirectories
  /\.secret[s]?$/i,          // *.secret, *.secrets
  /credentials/i,            // anything with credentials in name
  /\.pem$/,                  // certificate files
  /\.key$/,                  // key files
  /id_rsa/,                  // SSH keys
  /id_ed25519/,              // SSH keys
];

// =============================================================================
// Inclusion Patterns
// =============================================================================

/** Directory prefixes that are auto-included */
const AUTO_INCLUDE_DIRS: string[] = [
  "src/",
  "tests/",
  "test/",
  "templates/",
  "migrations/",
  "docs/",
  "workflows/",
  "prompts/",
  "evals/",
  "scripts/",
];

/** Files that are auto-included at root level */
const AUTO_INCLUDE_EXACT: string[] = [
  "package.json",
  "tsconfig.json",
  "README.md",
  "LICENSE",
  "LICENSE.md",
  "CHANGELOG.md",
  ".gitignore",
  "bunfig.toml",
];

// =============================================================================
// Classification
// =============================================================================

/**
 * Classify a file path as include, exclude, or review
 */
export function classifyFile(filePath: string): ClassificationResult {
  // Normalize: remove leading ./
  const normalized = filePath.replace(/^\.\//, "");

  // Check exact exclusions first
  if (AUTO_EXCLUDE_EXACT.includes(normalized)) {
    return { classification: "exclude", reason: "Sensitive configuration file" };
  }

  // Check directory exclusions
  for (const dir of AUTO_EXCLUDE_DIRS) {
    if (normalized.startsWith(dir)) {
      return { classification: "exclude", reason: `Excluded directory: ${dir}` };
    }
  }

  // Check extension exclusions
  for (const ext of AUTO_EXCLUDE_EXTENSIONS) {
    if (normalized.endsWith(ext)) {
      return { classification: "exclude", reason: `Database/binary file (${ext})` };
    }
  }

  // Check regex exclusions
  for (const pattern of AUTO_EXCLUDE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { classification: "exclude", reason: "Matches secret/credential pattern" };
    }
  }

  // Check exact inclusions
  if (AUTO_INCLUDE_EXACT.includes(normalized)) {
    return { classification: "include", reason: "Standard project file" };
  }

  // Check directory inclusions
  for (const dir of AUTO_INCLUDE_DIRS) {
    if (normalized.startsWith(dir)) {
      return { classification: "include", reason: `Source directory: ${dir}` };
    }
  }

  // Everything else needs human review
  return { classification: "review", reason: "Not matched by auto-classification rules" };
}

/**
 * Get a human-readable exclusion reason for common patterns
 */
export function getExclusionReason(filePath: string): string {
  const result = classifyFile(filePath);
  return result.reason;
}
