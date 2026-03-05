/**
 * Status Command
 * Display feature queue and progress statistics
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  getStats,
  getDbPath,
  dbExists,
  isLegacyLocation,
  migrateDatabase,
} from "../lib/database";
import { getContribState } from "../lib/contrib-prep";
import { getGateTitle } from "../lib/contrib-prep/gates";
import type { Feature, FeatureStats } from "../types";

// =============================================================================
// Status Display
// =============================================================================

export interface StatusOptions {
  json?: boolean;
  featureId?: string;
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

    // Single feature detail view
    if (options.featureId) {
      const feature = getFeature(options.featureId);
      if (!feature) {
        console.error(`Error: Feature ${options.featureId} not found.`);
        process.exit(1);
      }
      if (options.json) {
        console.log(JSON.stringify({
          id: feature.id,
          name: feature.name,
          description: feature.description,
          status: feature.status,
          phase: feature.phase,
          priority: feature.priority,
          specPath: feature.specPath,
          quickStart: feature.quickStart,
          createdAt: feature.createdAt.toISOString(),
          startedAt: feature.startedAt?.toISOString() ?? null,
          completedAt: feature.completedAt?.toISOString() ?? null,
        }, null, 2));
      } else {
        outputFeatureDetail(feature);
      }
      return;
    }

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
      quickStart: f.quickStart,
      createdAt: f.createdAt.toISOString(),
      startedAt: f.startedAt?.toISOString() ?? null,
      completedAt: f.completedAt?.toISOString() ?? null,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputFeatureDetail(feature: Feature): void {
  console.log(`\n📋 Feature: ${feature.id}\n`);
  console.log(`  Name:        ${feature.name}`);
  console.log(`  Description: ${feature.description}`);
  console.log(`  Status:      ${getStatusIcon(feature.status)} ${feature.status}`);
  console.log(`  Phase:       ${getPhaseIcon(feature.phase)} ${feature.phase}`);
  console.log(`  Priority:    ${feature.priority}`);
  console.log(`  Spec Path:   ${feature.specPath ?? "(not set)"}`);
  console.log(`  Quick Start: ${feature.quickStart ? "yes" : "no"}`);
  console.log(`  Created:     ${feature.createdAt.toISOString()}`);
  if (feature.startedAt) {
    console.log(`  Started:     ${feature.startedAt.toISOString()}`);
  }
  if (feature.completedAt) {
    console.log(`  Completed:   ${feature.completedAt.toISOString()}`);
  }
  console.log("");
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
    const quickIndicator = feature.quickStart ? "⚡ " : "";
    const nameMaxLen = feature.quickStart ? 28 : 30;
    console.log(
      padRight(feature.id, 8) +
      padRight(`${statusIcon} ${feature.status}`, 14) +
      padRight(`${phaseIcon} ${feature.phase || "none"}`, 12) +
      padRight(String(feature.priority), 10) +
      quickIndicator + truncate(feature.name, nameMaxLen)
    );
  }

  console.log("─".repeat(85));

  // Contrib prep section — show any active contrib preps
  const contribPreps = features
    .filter((f) => {
      const cs = getContribState(f.id);
      return cs !== null;
    })
    .map((f) => ({ feature: f, state: getContribState(f.id)! }));

  if (contribPreps.length > 0) {
    console.log("\nContrib Prep:");
    console.log("─".repeat(85));
    for (const { feature, state } of contribPreps) {
      const gateLabel = state.gate >= 5
        ? "Complete"
        : getGateTitle(state.gate + 1);
      const progress = `Gate ${state.gate}/5`;
      const details: string[] = [];
      if (state.inventoryIncluded > 0) {
        details.push(`${state.inventoryIncluded} files`);
      }
      if (state.sanitizationFindings > 0) {
        details.push(`${state.sanitizationFindings} findings`);
      }
      if (state.tagName) {
        details.push(`tag: ${state.tagName}`);
      }
      const detailStr = details.length > 0 ? ` (${details.join(", ")})` : "";
      console.log(`  ${feature.id} — ${progress} → ${gateLabel}${detailStr}`);
    }
    console.log("─".repeat(85));
  }

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
    case "blocked":
      return "⊗";
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
    case "harden":
      return "⑤";
    case "review":
      return "⑥";
    case "approve":
      return "⑦";
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
