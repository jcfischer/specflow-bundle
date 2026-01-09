/**
 * Registry Management - Spec numbering and tracking
 */
import { readFile, writeFile, mkdir, access, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, basename } from "node:path";
import type {
  SpecRegistry,
  SpecEntry,
  AssignOptions,
  RegistryResult,
  SpecStatus,
  UnregisteredSpec,
} from "./types";

/**
 * Format a number as a 3-digit zero-padded string
 */
export function formatId(num: number): string {
  return num.toString().padStart(3, "0");
}

/**
 * Generate numbered directory name: "035-feature-name"
 */
export function numberedDirName(id: string, feature: string): string {
  return `${id}-${feature}`;
}

/**
 * Extract ID from numbered directory name: "035-feature-name" -> "035"
 */
export function extractIdFromDir(dirName: string): string | null {
  const match = dirName.match(/^(\d{3})-/);
  return match ? match[1] : null;
}

/**
 * Extract feature from numbered directory name: "035-feature-name" -> "feature-name"
 */
export function extractFeatureFromDir(dirName: string): string | null {
  const match = dirName.match(/^\d{3}-(.+)$/);
  return match ? match[1] : null;
}

/**
 * Create a new empty registry
 */
export function createRegistry(): SpecRegistry {
  return {
    version: "1.0.0",
    lastId: 0,
    specs: [],
  };
}

/**
 * Load registry from file
 */
export async function loadRegistry(
  path: string
): Promise<RegistryResult<SpecRegistry>> {
  try {
    await access(path);
  } catch {
    return {
      success: false,
      error: `Registry file not found: ${path}`,
    };
  }

  try {
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as SpecRegistry;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse registry: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Save registry to file
 */
export async function saveRegistry(
  path: string,
  registry: SpecRegistry
): Promise<RegistryResult> {
  try {
    // Create parent directories if needed
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(registry, null, 2));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save registry: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Get the next available ID number
 */
export function getNextId(registry: SpecRegistry): number {
  return registry.lastId + 1;
}

/**
 * Assign a new spec ID and add to registry
 * Mutates the registry in place and returns the assigned entry
 */
export function assignSpec(
  registry: SpecRegistry,
  options: AssignOptions
): RegistryResult<SpecEntry> {
  const { feature, skill, path, status = "draft", created, title } = options;

  // Check for duplicate
  const existing = findSpecByFeature(registry, feature, skill);
  if (existing) {
    return {
      success: false,
      error: `Spec for feature "${feature}" in skill "${skill}" already exists with ID ${existing.id}`,
    };
  }

  // Assign new ID
  const nextNum = getNextId(registry);
  const id = formatId(nextNum);

  const entry: SpecEntry = {
    id,
    feature,
    skill,
    path,
    status,
    created: created || new Date().toISOString().split("T")[0],
    ...(title && { title }),
  };

  // Update registry
  registry.lastId = nextNum;
  registry.specs.push(entry);

  return { success: true, data: entry };
}

/**
 * Filter options for listing specs
 */
export interface ListOptions {
  skill?: string;
  status?: SpecStatus;
}

/**
 * List all specs with optional filtering
 */
export function listSpecs(
  registry: SpecRegistry,
  options?: ListOptions
): SpecEntry[] {
  let result = [...registry.specs];

  if (options?.skill) {
    result = result.filter((s) => s.skill === options.skill);
  }

  if (options?.status) {
    result = result.filter((s) => s.status === options.status);
  }

  return result;
}

/**
 * Find a spec by its ID
 */
export function findSpecById(
  registry: SpecRegistry,
  id: string
): SpecEntry | undefined {
  return registry.specs.find((s) => s.id === id);
}

/**
 * Find a spec by feature name and skill
 */
export function findSpecByFeature(
  registry: SpecRegistry,
  feature: string,
  skill: string
): SpecEntry | undefined {
  return registry.specs.find((s) => s.feature === feature && s.skill === skill);
}

/**
 * Update the status of a spec by ID
 * Mutates the registry in place and returns the updated entry
 */
export function updateStatus(
  registry: SpecRegistry,
  id: string,
  status: SpecStatus
): RegistryResult<SpecEntry> {
  const spec = findSpecById(registry, id);

  if (!spec) {
    return {
      success: false,
      error: `Spec with ID "${id}" not found`,
    };
  }

  spec.status = status;

  return { success: true, data: spec };
}

/**
 * Parse YAML frontmatter from spec.md content
 */
function parseFrontmatter(
  content: string
): Partial<{ status: SpecStatus; created: string; feature: string }> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const frontmatter = match[1];
  const result: Partial<{ status: SpecStatus; created: string; feature: string }> = {};

  // Parse status
  const statusMatch = frontmatter.match(/status:\s*["']?([\w-]+)["']?/);
  if (statusMatch) {
    result.status = statusMatch[1] as SpecStatus;
  }

  // Parse created
  const createdMatch = frontmatter.match(/created:\s*["']?(\d{4}-\d{2}-\d{2})["']?/);
  if (createdMatch) {
    result.created = createdMatch[1];
  }

  // Parse feature
  const featureMatch = frontmatter.match(/feature:\s*["']?([\w-]+)["']?/);
  if (featureMatch) {
    result.feature = featureMatch[1];
  }

  return result;
}

/**
 * Find all spec.md files in .specify/specs directories
 */
async function findSpecFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string, depth: number = 0): Promise<void> {
    // Limit depth to avoid infinite recursion
    if (depth > 5) return;

    try {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.name === "spec.md") {
          // Check if this is in a .specify/specs/<feature>/ directory
          const parts = fullPath.split("/");
          const specifyIdx = parts.findIndex((p) => p === ".specify");
          if (specifyIdx >= 0 && parts[specifyIdx + 1] === "specs") {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore directories we can't read
    }
  }

  await walk(dir);
  return results;
}

/**
 * Scan a directory for unregistered specs
 * Looks for .specify/specs/<feature>/spec.md pattern
 */
export async function scanSpecs(
  skillsDir: string,
  registry: SpecRegistry
): Promise<RegistryResult<UnregisteredSpec[]>> {
  const unregistered: UnregisteredSpec[] = [];

  try {
    const specFiles = await findSpecFiles(skillsDir);

    for (const specPath of specFiles) {
      // Extract skill and feature from path
      // Path format: .../skill-name/.specify/specs/feature-name/spec.md
      const relativePath = relative(skillsDir, specPath);
      const parts = relativePath.split("/");

      // parts[0] = skill-name
      // parts[1] = .specify
      // parts[2] = specs
      // parts[3] = feature-name
      // parts[4] = spec.md
      if (parts.length < 5) continue;

      const skill = parts[0];
      const dirName = parts[3];
      // Support both numbered (035-feature-name) and unnumbered (feature-name) directories
      const feature = extractFeatureFromDir(dirName) || dirName;
      const specDir = join(skill, ".specify", "specs", dirName);

      // Check if already registered
      if (findSpecByFeature(registry, feature, skill)) {
        continue;
      }

      // Read and parse frontmatter
      let status: SpecStatus | undefined;
      let created: string | undefined;

      try {
        const content = await readFile(specPath, "utf-8");
        const parsed = parseFrontmatter(content);
        status = parsed.status;
        created = parsed.created;
      } catch {
        // Ignore read errors, just use defaults
      }

      unregistered.push({
        feature,
        skill,
        path: specDir,
        status,
        created,
        specPath,
      });
    }

    return { success: true, data: unregistered };
  } catch (err) {
    return {
      success: false,
      error: `Failed to scan directory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
