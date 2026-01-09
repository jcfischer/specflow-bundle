#!/usr/bin/env bun
/**
 * SpecFlow CLI
 * Multi-agent orchestration for spec-driven development
 */

import { Command } from "commander";
import { version } from "../package.json";
import { statusCommand } from "./commands/status";
import { skipCommand } from "./commands/skip";
import { resetCommand } from "./commands/reset";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";
import { nextCommand } from "./commands/next";
import { completeCommand } from "./commands/complete";
import { validateCommand } from "./commands/validate";
import { implementCommand } from "./commands/implement";
import { specifyCommand } from "./commands/specify";
import { planCommand } from "./commands/plan";
import { tasksCommand } from "./commands/tasks";
import { uiCommand } from "./commands/ui";
import { phaseCommand } from "./commands/phase";
import { addCommand } from "./commands/add";
import { removeCommand } from "./commands/remove";
import { editCommand } from "./commands/edit";

// =============================================================================
// Main Program
// =============================================================================

const program = new Command()
  .name("specflow")
  .description("Multi-agent orchestration for spec-driven development")
  .version(version);

// =============================================================================
// Commands
// =============================================================================

program
  .command("init")
  .description("Initialize a new application with feature decomposition")
  .argument("[description]", "High-level description of the application")
  .option("--min-features <n>", "Minimum features to generate", "5")
  .option("--max-features <n>", "Maximum features to generate", "20")
  .option("--from-features <file>", "Load features from JSON file")
  .option("--from-spec <file>", "Decompose features from spec file")
  .option("--force", "Overwrite existing database")
  .action(initCommand);

program
  .command("add")
  .description("Add a new feature to the queue")
  .argument("<name>", "Feature name")
  .argument("<description>", "Feature description")
  .option("--priority <n>", "Priority (default: 999)")
  .action(addCommand);

program
  .command("remove")
  .description("Remove a feature from the queue")
  .argument("<feature-id>", "Feature ID to remove (e.g., F-001)")
  .option("--force", "Force removal of completed features or those with spec files")
  .action((featureId, options) => removeCommand(featureId, { force: options.force }));

program
  .command("edit")
  .description("Edit feature properties (priority, name, description)")
  .argument("<feature-id>", "Feature ID to edit (e.g., F-001)")
  .option("--priority <n>", "Set new priority")
  .option("--name <name>", "Set new name")
  .option("--description <desc>", "Set new description")
  .action((featureId, options) => editCommand(featureId, options));

program
  .command("status")
  .description("Show feature queue and progress")
  .option("--json", "Output as JSON")
  .action(statusCommand);

program
  .command("run")
  .description("Show implementation guidance and next steps")
  .action(runCommand);

program
  .command("next")
  .description("Output context for the next ready feature (for Task tool)")
  .option("--json", "Output as JSON")
  .option("--feature <id>", "Get context for specific feature")
  .action((options) => nextCommand({ json: options.json, featureId: options.feature }));

program
  .command("complete")
  .description("Mark a feature as complete (validates spec.md, plan.md, tasks.md)")
  .argument("<feature-id>", "Feature ID to mark complete (e.g., F-1)")
  .option("--force", "Bypass validation (not recommended)")
  .action((featureId, options) => completeCommand(featureId, { force: options.force }));

program
  .command("validate")
  .description("Validate that feature has completed all SpecFlow phases")
  .argument("[feature-id]", "Feature ID to validate (e.g., F-1)")
  .option("--all", "Validate all features")
  .option("--json", "Output as JSON")
  .action((featureId, options) => validateCommand(featureId, options));

program
  .command("implement")
  .description("Generate implementation prompt (validates phases first)")
  .option("--feature <id>", "Implement specific feature (default: next pending)")
  .option("--json", "Output as JSON")
  .action((options) => implementCommand({ featureId: options.feature, json: options.json }));

program
  .command("skip")
  .description("Skip a feature and move it to the end of the queue")
  .argument("<feature-id>", "Feature ID to skip (e.g., F-1)")
  .action(skipCommand);

program
  .command("specify")
  .description("Create detailed specification for a feature (SPECIFY phase)")
  .argument("<feature-id>", "Feature ID to specify (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .action(specifyCommand);

program
  .command("plan")
  .description("Create technical plan for a feature (PLAN phase)")
  .argument("<feature-id>", "Feature ID to plan (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .action(planCommand);

program
  .command("tasks")
  .description("Create implementation tasks for a feature (TASKS phase)")
  .argument("<feature-id>", "Feature ID to break down (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .action(tasksCommand);

program
  .command("reset")
  .description("Reset a feature to pending status")
  .argument("[feature-id]", "Feature ID to reset (e.g., F-1)")
  .option("--all", "Reset all features to pending")
  .action(resetCommand);

// Register phase command (uses Commander directly for flexibility)
phaseCommand(program);

program
  .command("ui")
  .description("Start the SpecFlow web dashboard")
  .option("--port <port>", "Port to run server on", "3000")
  .action(uiCommand);

// =============================================================================
// Parse and Execute
// =============================================================================

program.parse();
