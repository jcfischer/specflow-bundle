/**
 * Pipeline Command Group
 * Visibility and control for SpecFlow pipeline state
 *
 * Subcommands:
 *   specflow pipeline           — Show pipeline state
 *   specflow pipeline --watch   — Live-updating view
 *   specflow pipeline events    — Show event log
 *   specflow pipeline clear     — Acknowledge failure
 *   specflow pipeline retry     — Retry failed phase
 *   specflow pipeline run       — Run full pipeline (legacy)
 */

import type { Command } from "commander";
import { loadPipelineState, clearFailure } from "../lib/pipeline-state";
import { readEvents, parseDuration } from "../lib/events";
import { getSessionId } from "../lib/session";
import { pipelineRunCommand } from "./pipeline-run";
import type { PipelineState, PipelineEvent } from "../types";
import { existsSync, watchFile, unwatchFile } from "fs";
import { join } from "path";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
  updateFeaturePhase,
} from "../lib/database";

export function pipelineCommand(program: Command): void {
  const pipeline = program
    .command("pipeline")
    .description("Pipeline visibility and control");

  // Default action: show pipeline state
  pipeline
    .option("--json", "Output as JSON")
    .option("--watch", "Live-updating view")
    .action((options: { json?: boolean; watch?: boolean }) => {
      const projectPath = process.cwd();
      if (options.watch) {
        watchPipeline(projectPath);
      } else {
        showPipelineState(projectPath, options.json);
      }
    });

  // Run subcommand (legacy pipeline runner)
  pipeline
    .command("run <feature-id>")
    .description("Run full SpecFlow pipeline for a feature")
    .option("--stop-after <phase>", "Stop after this phase")
    .action((featureId: string, options: { stopAfter?: string }) =>
      pipelineRunCommand(featureId, { stopAfter: options.stopAfter })
    );

  // Events subcommand
  pipeline
    .command("events")
    .description("Show pipeline event log")
    .option("--since <duration>", "Filter events newer than duration (e.g., 1h, 30m, 2d)")
    .option("--type <type>", "Filter by event type")
    .option("--feature <id>", "Filter by feature ID")
    .option("--limit <n>", "Max events to show", "20")
    .option("--json", "Output as JSON")
    .action((options: { since?: string; type?: string; feature?: string; limit?: string; json?: boolean }) => {
      showEvents(process.cwd(), options);
    });

  // Clear subcommand
  pipeline
    .command("clear <feature-id>")
    .description("Acknowledge and clear a failure for a feature")
    .action((featureId: string) => {
      clearFeatureFailure(process.cwd(), featureId);
    });

  // Retry subcommand
  pipeline
    .command("retry <feature-id>")
    .description("Reset a feature to retry its failed phase")
    .action((featureId: string) => {
      retryFeature(process.cwd(), featureId);
    });
}

function showPipelineState(projectPath: string, json?: boolean): void {
  const state = loadPipelineState(projectPath);

  if (!state || (state.features.length === 0 && state.failures.length === 0)) {
    if (json) {
      console.log(JSON.stringify({ features: [], failures: [] }, null, 2));
    } else {
      console.log("No features in pipeline. Pipeline state is created automatically on phase transitions.");
    }
    return;
  }

  if (json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`\nSpecFlow Pipeline — ${state.project}`);
  console.log(`Session: ${state.session_id.slice(0, 8)}… | Updated: ${state.updated_at}\n`);

  if (state.features.length > 0) {
    console.log("Features:");
    for (const f of state.features) {
      const statusIcon = f.status === "blocked" ? "⊗" : f.status === "complete" ? "✓" : "●";
      console.log(
        `  ${statusIcon} ${f.id.padEnd(8)} ${f.name.padEnd(25).slice(0, 25)} ${f.phase.padEnd(12)} ${f.status}`
      );
    }
  }

  const activeFailures = state.failures.filter((f) => !f.recovered);
  if (activeFailures.length > 0) {
    console.log("\nActive Failures:");
    for (const f of activeFailures) {
      console.log(`  ✗ ${f.feature_id} [${f.failure_type}] ${f.message.slice(0, 60)}`);
      console.log(`    Route: ${f.failure_route} | Phase: ${f.phase}`);
    }
    console.log(`\n  Clear: specflow pipeline clear <feature-id>`);
    console.log(`  Retry: specflow pipeline retry <feature-id>`);
  }

  console.log();
}

function watchPipeline(projectPath: string): void {
  const pipelinePath = join(projectPath, ".specflow", "pipeline.json");

  const render = () => {
    process.stdout.write("\x1Bc"); // Clear terminal
    showPipelineState(projectPath);
    console.log("Watching... (Ctrl+C to exit)");
  };

  render();

  if (existsSync(pipelinePath)) {
    watchFile(pipelinePath, { interval: 1000 }, render);
  } else {
    // Poll until file appears
    const interval = setInterval(() => {
      if (existsSync(pipelinePath)) {
        clearInterval(interval);
        render();
        watchFile(pipelinePath, { interval: 1000 }, render);
      }
    }, 1000);
  }

  process.on("SIGINT", () => {
    unwatchFile(pipelinePath);
    process.exit(0);
  });
}

function showEvents(
  projectPath: string,
  options: { since?: string; type?: string; feature?: string; limit?: string; json?: boolean }
): void {
  const since = options.since ? new Date(Date.now() - parseDuration(options.since)) : undefined;
  const limit = parseInt(options.limit || "20", 10);

  const events = readEvents(projectPath, {
    since,
    type: options.type as any,
    featureId: options.feature,
    limit,
  });

  if (options.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  if (events.length === 0) {
    console.log("No events found.");
    return;
  }

  console.log(`\nPipeline Events (${events.length}):\n`);
  for (const e of events) {
    const time = new Date(e.timestamp).toLocaleTimeString();
    const feature = e.feature_id || "—";
    const phase = e.phase || "—";
    const summary = formatEventSummary(e);
    console.log(`  ${time}  ${e.type.padEnd(18)} ${feature.padEnd(8)} ${phase.padEnd(12)} ${summary}`);
  }
  console.log();
}

function formatEventSummary(event: PipelineEvent): string {
  if (event.data?.duration_ms) {
    return `${Math.round(event.data.duration_ms as number)}ms`;
  }
  if (event.data?.message) {
    return String(event.data.message).slice(0, 40);
  }
  return "";
}

function clearFeatureFailure(projectPath: string, featureId: string): void {
  const sessionId = getSessionId(projectPath);
  const cleared = clearFailure(projectPath, sessionId, featureId);

  if (cleared) {
    console.log(`✓ Cleared failure for ${featureId}`);
  } else {
    console.error(`No active failure found for ${featureId}`);
    process.exit(1);
  }
}

function retryFeature(projectPath: string, featureId: string): void {
  const sessionId = getSessionId(projectPath);

  // Clear the failure first
  clearFailure(projectPath, sessionId, featureId);

  // Reset the feature phase in the database
  if (dbExists(projectPath)) {
    try {
      initDatabase(getDbPath(projectPath));
      const feature = getFeature(featureId);
      if (feature) {
        // Reset to current phase (re-enter it)
        updateFeaturePhase(featureId, feature.phase);
        console.log(`✓ ${featureId} reset to retry phase '${feature.phase}'`);
      } else {
        console.error(`Feature ${featureId} not found`);
        process.exit(1);
      }
    } finally {
      closeDatabase();
    }
  } else {
    console.error("No SpecFlow database found.");
    process.exit(1);
  }
}
