/**
 * Migrate Registry Command
 * Migrates specs from SpecKit's global JSON registry to project-local SQLite databases
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { createInterface } from "readline";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  getFeature,
  updateFeatureStatus,
  updateFeaturePhase,
  SPECFLOW_DIR,
  DB_FILENAME,
  ensureSpecflowDir,
} from "../lib/database";
import type { FeatureStatus, SpecPhase } from "../types";

// =============================================================================
// Types
// =============================================================================

interface SpecEntry {
  id: string;
  feature: string;
  skill: string;
  path: string;
  status: "draft" | "in-progress" | "completed" | "archived";
  created: string;
  title?: string;
}

interface SpecRegistry {
  version: string;
  lastId: number;
  specs: SpecEntry[];
}

interface MigrationResult {
  skill: string;
  projectPath: string;
  specsImported: number;
  specsSkipped: number;
  specsUpdated: number;
  errors: string[];
}

// =============================================================================
// Project Path Mapping
// =============================================================================

const PROJECT_PATHS: Record<string, string | null> = {
  // Skills in ~/.claude/skills/
  "CORE": "/Users/fischer/.claude/skills/CORE",
  "Sentinel": "/Users/fischer/.claude/skills/Sentinel",
  "SpecFlow": "/Users/fischer/.claude/skills/SpecFlow",
  "email": "/Users/fischer/.claude/skills/email",
  "tana": "/Users/fischer/.claude/skills/tana",

  // Work directory projects
  "supertag-cli": "/Users/fischer/work/supertag-cli",
  "healthcare-report-automation": "/Users/fischer/work/healthcare-report-automation",
  "ragent": "/Users/fischer/work/ragent",
  "kai-launcher": "/Users/fischer/work/kai-launcher",
  "pg-backup": "/Users/fischer/work/pg-backup",
  "claude-pii": "/Users/fischer/work/claude-pii",
  "claude-code-router": "/Users/fischer/work/claude-code-router",
  "kai-raycast": "/Users/fischer/work/kai-raycast",
  "kai-improvement-roadmap": "/Users/fischer/work/kai-improvement-roadmap",

  // DA/KAI subdirectory
  "finance": "/Users/fischer/work/DA/KAI/skills/finance",
  "daily-briefing": "/Users/fischer/work/DA/KAI/skills/daily-briefing",
  "KAI": "/Users/fischer/work/DA/KAI",

  // Projects directory
  "music-visualizer": "/Users/fischer/Projects/music-visualizer",

  // Web projects
  "course-platform": "/Users/fischer/work/web/course-platform",

  // Unknown/missing - will prompt
  "remix": null,
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert 3-digit ID to F-N format
 * "035" -> "F-35"
 * "001" -> "F-1"
 */
function convertId(oldId: string): string {
  const num = parseInt(oldId, 10);
  return `F-${num}`;
}

/**
 * Convert SpecKit status to SpecFlow status/phase
 */
function convertStatus(status: string): { status: FeatureStatus; phase: SpecPhase } {
  switch (status) {
    case "completed":
      return { status: "complete", phase: "implement" };
    case "in-progress":
      return { status: "in_progress", phase: "specify" };
    case "archived":
      return { status: "complete", phase: "implement" };
    case "draft":
    default:
      return { status: "pending", phase: "none" };
  }
}

/**
 * Prompt user for input
 */
async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Resolve spec path relative to project
 */
function resolveSpecPath(projectPath: string, specEntry: SpecEntry): string | null {
  // The path in registry is relative like "email/.specify/specs/imap-drafts"
  // We need to extract just the spec directory part
  const parts = specEntry.path.split("/");
  const specifyIndex = parts.indexOf(".specify");

  if (specifyIndex === -1) {
    return null;
  }

  // Get everything from .specify onwards
  const specRelativePath = parts.slice(specifyIndex).join("/");
  return join(projectPath, specRelativePath);
}

// =============================================================================
// Migration Logic
// =============================================================================

async function migrateProject(
  skill: string,
  projectPath: string,
  specs: SpecEntry[],
  dryRun: boolean
): Promise<MigrationResult> {
  const result: MigrationResult = {
    skill,
    projectPath,
    specsImported: 0,
    specsSkipped: 0,
    specsUpdated: 0,
    errors: [],
  };

  if (dryRun) {
    console.log(`\n[DRY RUN] Would migrate ${specs.length} specs to ${projectPath}`);
    for (const spec of specs) {
      const newId = convertId(spec.id);
      console.log(`  ${spec.id} -> ${newId}: ${spec.feature}`);
    }
    result.specsImported = specs.length;
    return result;
  }

  // Ensure .specflow directory exists
  ensureSpecflowDir(projectPath);

  // Initialize database
  const dbPath = join(projectPath, SPECFLOW_DIR, DB_FILENAME);
  try {
    initDatabase(dbPath);
  } catch (error) {
    result.errors.push(`Failed to initialize database: ${error}`);
    return result;
  }

  // Migrate each spec
  for (const spec of specs) {
    const newId = convertId(spec.id);

    try {
      // Check if feature already exists
      const existing = getFeature(newId);
      const converted = convertStatus(spec.status);

      if (existing) {
        // Compare dates and update if JSON is newer
        const existingDate = existing.createdAt;
        const jsonDate = new Date(spec.created);

        if (jsonDate > existingDate) {
          // Update existing record with status and phase
          updateFeatureStatus(newId, converted.status);
          updateFeaturePhase(newId, converted.phase);
          console.log(`  🔄 ${newId} updated: ${spec.feature} (${spec.status})`);
          result.specsUpdated++;
        } else {
          console.log(`  ⏭ ${newId} exists, skipping`);
          result.specsSkipped++;
        }
        continue;
      }

      // Resolve spec path
      const specPath = resolveSpecPath(projectPath, spec);

      // Add feature to database
      addFeature({
        id: newId,
        name: spec.feature,
        description: `Migrated from SpecKit registry (original ID: ${spec.id})`,
        priority: parseInt(spec.id, 10), // Use original ID as priority to preserve order
        specPath: specPath || undefined,
        migratedFrom: spec.id,
      });

      // Apply the status and phase from original registry
      if (converted.status !== "pending") {
        updateFeatureStatus(newId, converted.status);
      }
      if (converted.phase !== "none") {
        updateFeaturePhase(newId, converted.phase);
      }

      const statusStr = spec.status !== "draft" ? ` (${spec.status})` : "";
      console.log(`  ✓ ${spec.id} -> ${newId}: ${spec.feature}${statusStr}`);
      result.specsImported++;
    } catch (error) {
      result.errors.push(`Failed to import ${spec.id}: ${error}`);
    }
  }

  closeDatabase();
  return result;
}

// =============================================================================
// Main Command
// =============================================================================

export async function migrateRegistryCommand(options: {
  dryRun?: boolean;
  registry?: string;
}): Promise<void> {
  const { dryRun = false, registry } = options;

  // Default registry path (archived location)
  const registryPath = registry || "/Users/fischer/.claude/skills/_archived/SpecKit/spec-registry.json";

  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║        SpecKit to SpecFlow Migration                           ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log();

  if (dryRun) {
    console.log("🔍 Running in DRY RUN mode - no changes will be made\n");
  }

  // Read registry
  if (!existsSync(registryPath)) {
    console.error(`❌ Registry not found: ${registryPath}`);
    process.exit(1);
  }

  let registry_data: SpecRegistry;
  try {
    const content = readFileSync(registryPath, "utf-8");
    registry_data = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to read registry: ${error}`);
    process.exit(1);
  }

  console.log(`📖 Loaded registry with ${registry_data.specs.length} specs (lastId: ${registry_data.lastId})\n`);

  // Group specs by skill
  const specsBySkill = new Map<string, SpecEntry[]>();
  for (const spec of registry_data.specs) {
    const existing = specsBySkill.get(spec.skill) || [];
    existing.push(spec);
    specsBySkill.set(spec.skill, existing);
  }

  console.log(`📊 Found ${specsBySkill.size} unique skills:\n`);
  for (const [skill, specs] of specsBySkill) {
    console.log(`  ${skill}: ${specs.length} specs`);
  }
  console.log();

  // Resolve project paths
  const resolvedPaths = new Map<string, string>();
  const skippedSkills: string[] = [];

  for (const skill of specsBySkill.keys()) {
    let projectPath = PROJECT_PATHS[skill];

    // If path is null or doesn't exist, prompt user
    if (!projectPath || !existsSync(projectPath)) {
      if (dryRun) {
        console.log(`⚠ Skill '${skill}' - project path unknown or missing`);
        skippedSkills.push(skill);
        continue;
      }

      console.log(`\n⚠ Project '${skill}' not found at expected path.`);
      const answer = await prompt(`  Enter path (or 'skip' to ignore): `);

      if (answer.toLowerCase() === "skip" || !answer) {
        skippedSkills.push(skill);
        continue;
      }

      projectPath = resolve(answer);
      if (!existsSync(projectPath)) {
        console.log(`  ❌ Path does not exist: ${projectPath}`);
        skippedSkills.push(skill);
        continue;
      }
    }

    resolvedPaths.set(skill, projectPath);
  }

  console.log(`\n📁 Will migrate to ${resolvedPaths.size} projects`);
  if (skippedSkills.length > 0) {
    console.log(`⏭ Skipping ${skippedSkills.length} skills: ${skippedSkills.join(", ")}`);
  }
  console.log();

  // Perform migration
  const results: MigrationResult[] = [];

  for (const [skill, projectPath] of resolvedPaths) {
    const specs = specsBySkill.get(skill) || [];
    console.log(`\n🔄 Migrating '${skill}' (${specs.length} specs) to ${projectPath}`);

    const result = await migrateProject(skill, projectPath, specs, dryRun);
    results.push(result);

    if (result.errors.length > 0) {
      console.log(`  ⚠ Errors:`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                      Migration Summary                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  let totalImported = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const result of results) {
    totalImported += result.specsImported;
    totalSkipped += result.specsSkipped;
    totalUpdated += result.specsUpdated;
    totalErrors += result.errors.length;
  }

  console.log(`  ✓ Imported:  ${totalImported}`);
  console.log(`  ⏭ Skipped:   ${totalSkipped}`);
  console.log(`  🔄 Updated:   ${totalUpdated}`);
  console.log(`  ❌ Errors:    ${totalErrors}`);
  console.log(`  ⏭ Skills skipped: ${skippedSkills.length}`);
  console.log();

  if (dryRun) {
    console.log("💡 Run without --dry-run to perform actual migration");
  } else {
    console.log("✅ Migration complete!");
    console.log("\nNext steps:");
    console.log("  1. Verify with: cd <project> && specflow status");
    console.log("  2. Archive SpecKit: mv ~/.claude/skills/SpecKit ~/.claude/skills/_archived/");
  }
}
