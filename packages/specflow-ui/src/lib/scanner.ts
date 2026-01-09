import { readdirSync, statSync, accessSync, constants } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

export interface Project {
  path: string;      // /Users/fischer/work/specflow-ui
  name: string;      // specflow-ui
  dbPath: string;    // /Users/fischer/work/specflow-ui/features.db
  hasError: boolean; // false if readable
}

/**
 * Scan ~/work/ for directories containing features.db
 * Shallow scan only - no recursion
 */
export function scanProjects(): Project[] {
  const workDir = join(homedir(), "work");
  const projects: Project[] = [];

  let entries: string[];
  try {
    entries = readdirSync(workDir);
  } catch {
    // ~/work/ doesn't exist or isn't readable
    return [];
  }

  for (const entry of entries) {
    const projectPath = join(workDir, entry);
    const dbPath = join(projectPath, "features.db");

    // Check if it's a directory
    try {
      const stat = statSync(projectPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    // Check if features.db exists
    try {
      statSync(dbPath);
    } catch {
      // No features.db - not a SpecFlow project
      continue;
    }

    // Check if database is readable
    let hasError = false;
    try {
      accessSync(dbPath, constants.R_OK);
    } catch {
      hasError = true;
    }

    projects.push({
      path: projectPath,
      name: basename(projectPath),
      dbPath,
      hasError,
    });
  }

  // Sort by name
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}
