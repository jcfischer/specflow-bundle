/**
 * Add Command
 * Add a new feature to the queue after initial init
 *
 * Supports explicit feature IDs and auto-detection of existing artifacts.
 * Use this instead of direct database manipulation.
 */

import { existsSync } from "fs";
import { join, resolve } from "path";
import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getFeature,
  addFeature,
  getDbPath,
  dbExists,
  updateFeaturePhase,
} from "../lib/database";
import type { SpecPhase } from "../types";

export interface AddCommandOptions {
  priority?: string;
  id?: string;
  specPath?: string;
}

/**
 * Generate the next feature ID, matching existing format (F-001, F-027, etc.)
 */
function generateNextId(existingFeatures: { id: string }[]): string {
  if (existingFeatures.length === 0) {
    return "F-001";
  }

  // Extract numeric parts and padding width from F-XXX IDs
  let maxPadding = 3; // Default to 3 digits
  const ids: number[] = [];

  for (const f of existingFeatures) {
    const match = f.id.match(/^F-(\d+)$/);
    if (match) {
      const numStr = match[1];
      ids.push(parseInt(numStr, 10));
      // Track the padding width used in existing IDs
      if (numStr.length > maxPadding) {
        maxPadding = numStr.length;
      }
    }
  }

  if (ids.length === 0) {
    return "F-001";
  }

  const maxId = Math.max(...ids);
  const nextId = maxId + 1;

  // Pad to match existing format (at least 3 digits)
  return `F-${String(nextId).padStart(maxPadding, "0")}`;
}

/**
 * Validate that a feature ID matches the F-NNN pattern
 */
function isValidFeatureId(id: string): boolean {
  return /^F-\d+$/.test(id);
}

/**
 * Detect existing artifacts in a spec directory and determine the appropriate phase.
 * Checks in reverse order (highest phase first): tasks.md > plan.md > spec.md
 * Returns the phase AFTER the highest detected artifact (i.e., the next phase to run).
 */
function detectArtifacts(specPath: string): {
  phase: SpecPhase;
  detected: string[];
} {
  const absPath = resolve(specPath);
  const detected: string[] = [];

  const hasSpec = existsSync(join(absPath, "spec.md"));
  const hasPlan = existsSync(join(absPath, "plan.md"));
  const hasTasks = existsSync(join(absPath, "tasks.md"));

  if (hasSpec) detected.push("spec.md");
  if (hasPlan) detected.push("plan.md");
  if (hasTasks) detected.push("tasks.md");

  // Determine starting phase based on highest artifact found
  // The phase represents what has been COMPLETED, so we set the phase to the highest completed one
  let phase: SpecPhase = "none";
  if (hasTasks) {
    phase = "tasks";
  } else if (hasPlan) {
    phase = "plan";
  } else if (hasSpec) {
    phase = "specify";
  }

  return { phase, detected };
}

/**
 * Add a new feature to the queue
 */
export async function addCommand(
  name: string,
  description: string,
  options: AddCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // Determine feature ID: explicit or auto-generated
    let newId: string;
    if (options.id) {
      if (!isValidFeatureId(options.id)) {
        console.error(`Error: Invalid feature ID '${options.id}'. Must match F-NNN pattern (e.g., F-001, F-104).`);
        process.exit(1);
      }

      // Check for duplicate
      const existing = getFeature(options.id);
      if (existing) {
        console.error(`Error: Feature '${options.id}' already exists: ${existing.name}`);
        process.exit(1);
      }

      newId = options.id;
    } else {
      const features = getFeatures();
      newId = generateNextId(features);
    }

    const priority = options.priority ? parseInt(options.priority, 10) : 999;

    addFeature({
      id: newId,
      name,
      description,
      priority,
      specPath: options.specPath ?? undefined,
    });

    console.log(`Added feature ${newId}: ${name}`);
    console.log(`  Description: ${description}`);
    console.log(`  Priority: ${priority}`);

    // Auto-detect artifacts if spec-path provided
    if (options.specPath) {
      console.log(`  Spec Path: ${options.specPath}`);

      if (existsSync(resolve(options.specPath))) {
        const { phase, detected } = detectArtifacts(options.specPath);

        if (detected.length > 0) {
          console.log(`  Detected: ${detected.map(d => `${d} ✓`).join(", ")}`);

          if (phase !== "none") {
            updateFeaturePhase(newId, phase);
            console.log(`  Starting at phase: ${phase}`);
          }
        }
      } else {
        console.log(`  Warning: Spec path '${options.specPath}' does not exist yet.`);
      }
    }

    console.log("");
    console.log(`Next: Run 'specflow specify ${newId}' to create specification.`);
  } finally {
    closeDatabase();
  }
}
