/**
 * Status Command
 * Display feature queue and progress statistics
 */

import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getStats,
  getDbPath,
  dbExists,
  isLegacyLocation,
  migrateDatabase,
} from "../lib/database";
import type { Feature, FeatureStats } from "../types";

// =============================================================================
// Status Display
// =============================================================================

export interface StatusOptions {
  json?: boolean;
}

/**
 * Execute the status command
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const projectPath = process.cwd();

  // Check if database exists
  if (!dbExists(projectPath)) {
    if (options.json) {
      console.log(JSON.stringify({ error: "No SpecFlow database found", stats: emptyStats(), features: [] }));
    } else {
      console.log("No SpecFlow database found in current directory.");
      console.log("Run 'specflow init' to initialize a project.");
    }
    return;
  }

  // Auto-migrate legacy location if needed
  if (isLegacyLocation(projectPath)) {
    migrateDatabase(projectPath);
    console.log("✓ Migrated database to .specflow/features.db\n");
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const features = getFeatures();
    const stats = getStats();

    if (options.json) {
      outputJson(features, stats);
    } else {
      outputTable(features, stats);
    }
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Output Formatting
// =============================================================================

function outputJson(features: Feature[], stats: FeatureStats): void {
  const output = {
    stats,
    features: features.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      status: f.status,
      phase: f.phase,
      priority: f.priority,
      specPath: f.specPath,
      createdAt: f.createdAt.toISOString(),
      startedAt: f.startedAt?.toISOString() ?? null,
      completedAt: f.completedAt?.toISOString() ?? null,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputTable(features: Feature[], stats: FeatureStats): void {
  // Header
  console.log("\n📊 SpecFlow Status\n");

  // Stats summary
  console.log(`${stats.total} features | ${stats.complete} complete | ${stats.inProgress} in progress | ${stats.pending} pending | ${stats.skipped} skipped`);
  console.log(`Progress: ${stats.percentComplete}%\n`);

  if (features.length === 0) {
    console.log("No features in queue.");
    console.log("Run 'specflow init' to decompose an app specification.\n");
    return;
  }

  // Progress bar
  const barWidth = 40;
  const filled = Math.round((stats.percentComplete / 100) * barWidth);
  const empty = barWidth - filled;
  console.log(`[${"█".repeat(filled)}${"░".repeat(empty)}] ${stats.percentComplete}%\n`);

  // Feature table
  console.log("Features:");
  console.log("─".repeat(85));
  console.log(
    padRight("ID", 8) +
    padRight("Status", 14) +
    padRight("Phase", 12) +
    padRight("Priority", 10) +
    "Name"
  );
  console.log("─".repeat(85));

  for (const feature of features) {
    const statusIcon = getStatusIcon(feature.status);
    const phaseIcon = getPhaseIcon(feature.phase);
    console.log(
      padRight(feature.id, 8) +
      padRight(`${statusIcon} ${feature.status}`, 14) +
      padRight(`${phaseIcon} ${feature.phase || "none"}`, 12) +
      padRight(String(feature.priority), 10) +
      truncate(feature.name, 30)
    );
  }

  console.log("─".repeat(85));
  console.log("");
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "pending":
      return "○";
    case "in_progress":
      return "◐";
    case "complete":
      return "●";
    case "skipped":
      return "⊘";
    default:
      return "?";
  }
}

function getPhaseIcon(phase: string): string {
  switch (phase) {
    case "none":
      return "○";
    case "specify":
      return "①";
    case "plan":
      return "②";
    case "tasks":
      return "③";
    case "implement":
      return "④";
    default:
      return "○";
  }
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function emptyStats(): FeatureStats {
  return {
    total: 0,
    pending: 0,
    inProgress: 0,
    complete: 0,
    skipped: 0,
    percentComplete: 0,
  };
}
