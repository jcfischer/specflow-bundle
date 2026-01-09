/**
 * Add Command
 * Add a new feature to the queue after initial init
 *
 * Auto-generates the next F-XXX ID based on existing features.
 * Use this instead of direct database manipulation.
 */

import {
  initDatabase,
  closeDatabase,
  getFeatures,
  addFeature,
  getDbPath,
  dbExists,
} from "../lib/database";

export interface AddCommandOptions {
  priority?: string;
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

    const features = getFeatures();
    const newId = generateNextId(features);
    const priority = options.priority ? parseInt(options.priority, 10) : 999;

    addFeature({
      id: newId,
      name,
      description,
      priority,
    });

    console.log(`Added feature ${newId}: ${name}`);
    console.log(`  Description: ${description}`);
    console.log(`  Priority: ${priority}`);
    console.log("");
    console.log(`Next: Run 'specflow specify ${newId}' to create specification.`);
  } finally {
    closeDatabase();
  }
}
