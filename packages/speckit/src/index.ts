#!/usr/bin/env bun
/**
 * SpecKit CLI - Spec numbering and registry management
 */
import { Command } from "commander";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  createRegistry,
  loadRegistry,
  saveRegistry,
  getNextId,
  assignSpec,
  listSpecs,
  findSpecById,
  findSpecByFeature,
  formatId,
  numberedDirName,
  extractIdFromDir,
  extractFeatureFromDir,
  updateStatus,
  scanSpecs,
} from "./registry";
import type { SpecStatus } from "./types";

const DEFAULT_REGISTRY = join(
  homedir(),
  ".claude",
  "skills",
  "SpecKit",
  "spec-registry.json"
);

const program = new Command();

program
  .name("speckit")
  .description("SpecKit - Spec-Driven Development CLI")
  .version("1.0.0");

// Registry subcommand group
const registry = program.command("registry").description("Manage spec registry");

// registry list
registry
  .command("list")
  .description("List all specs in the registry")
  .option("-r, --registry <path>", "Path to registry file", DEFAULT_REGISTRY)
  .option("-s, --skill <name>", "Filter by skill name")
  .option("--status <status>", "Filter by status")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    const result = await loadRegistry(options.registry);

    if (!result.success) {
      // If registry doesn't exist, create empty one
      const empty = createRegistry();
      if (options.json) {
        console.log(JSON.stringify([], null, 2));
      } else {
        console.log("No specs registered yet.");
      }
      return;
    }

    const specs = listSpecs(result.data!, {
      skill: options.skill,
      status: options.status as SpecStatus | undefined,
    });

    if (options.json) {
      console.log(JSON.stringify(specs, null, 2));
      return;
    }

    if (specs.length === 0) {
      console.log("No specs found.");
      return;
    }

    // Table output
    console.log("ID    Feature                    Skill           Status       Created");
    console.log("─".repeat(76));
    for (const spec of specs) {
      const id = spec.id.padEnd(5);
      const feature = spec.feature.padEnd(26).substring(0, 26);
      const skill = spec.skill.padEnd(15).substring(0, 15);
      const status = spec.status.padEnd(12);
      console.log(`${id} ${feature} ${skill} ${status} ${spec.created}`);
    }
    console.log(`\nTotal: ${specs.length} spec(s)`);
  });

// registry assign
registry
  .command("assign")
  .description("Assign a new spec ID")
  .requiredOption("-f, --feature <name>", "Feature slug")
  .requiredOption("-s, --skill <name>", "Skill name")
  .requiredOption("-p, --path <path>", "Path to spec directory")
  .option("-r, --registry <path>", "Path to registry file", DEFAULT_REGISTRY)
  .option("--status <status>", "Initial status", "draft")
  .option("--created <date>", "Creation date (YYYY-MM-DD)")
  .option("-t, --title <title>", "Optional title")
  .action(async (options) => {
    // Load or create registry
    let registryData = await loadRegistry(options.registry);
    const registry = registryData.success ? registryData.data! : createRegistry();

    const result = assignSpec(registry, {
      feature: options.feature,
      skill: options.skill,
      path: options.path,
      status: options.status as SpecStatus,
      created: options.created,
      title: options.title,
    });

    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    // Save updated registry
    const saveResult = await saveRegistry(options.registry, registry);
    if (!saveResult.success) {
      console.error(`Error: ${saveResult.error}`);
      process.exit(1);
    }

    console.log(`Assigned ID ${result.data!.id} to ${options.feature} (${options.skill})`);
  });

// registry next
registry
  .command("next")
  .description("Show next available spec ID")
  .option("-r, --registry <path>", "Path to registry file", DEFAULT_REGISTRY)
  .action(async (options) => {
    const result = await loadRegistry(options.registry);
    const registry = result.success ? result.data! : createRegistry();
    const nextNum = getNextId(registry);
    console.log(formatId(nextNum));
  });

// registry show
registry
  .command("show <id>")
  .description("Show details of a specific spec")
  .option("-r, --registry <path>", "Path to registry file", DEFAULT_REGISTRY)
  .option("-j, --json", "Output as JSON")
  .action(async (id, options) => {
    const result = await loadRegistry(options.registry);

    if (!result.success) {
      console.error("Registry not found.");
      process.exit(1);
    }

    const spec = findSpecById(result.data!, id);
    if (!spec) {
      console.error(`Spec with ID ${id} not found.`);
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(spec, null, 2));
      return;
    }

    console.log(`ID:      ${spec.id}`);
    console.log(`Feature: ${spec.feature}`);
    console.log(`Skill:   ${spec.skill}`);
    console.log(`Path:    ${spec.path}`);
    console.log(`Status:  ${spec.status}`);
    console.log(`Created: ${spec.created}`);
    if (spec.title) {
      console.log(`Title:   ${spec.title}`);
    }
  });

// registry update
registry
  .command("update <id>")
  .description("Update spec status")
  .requiredOption("--status <status>", "New status (draft, in-progress, completed, archived)")
  .option("-r, --registry <path>", "Path to registry file", DEFAULT_REGISTRY)
  .action(async (id, options) => {
    const result = await loadRegistry(options.registry);

    if (!result.success) {
      console.error("Registry not found.");
      process.exit(1);
    }

    const registry = result.data!;
    const updateResult = updateStatus(registry, id, options.status as SpecStatus);

    if (!updateResult.success) {
      console.error(`Error: ${updateResult.error}`);
      process.exit(1);
    }

    // Save updated registry
    const saveResult = await saveRegistry(options.registry, registry);
    if (!saveResult.success) {
      console.error(`Error: ${saveResult.error}`);
      process.exit(1);
    }

    console.log(`Updated spec ${id} status to "${options.status}"`);
  });

// registry scan
registry
  .command("scan")
  .description("Scan for unregistered specs in skill directories")
  .option("-r, --registry <path>", "Path to registry file", DEFAULT_REGISTRY)
  .option("-d, --dir <path>", "Skills directory to scan", join(homedir(), "work", "DA", "KAI", "skills"))
  .option("--register", "Automatically register found specs")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    // Load or create registry
    const registryResult = await loadRegistry(options.registry);
    const registry = registryResult.success ? registryResult.data! : createRegistry();

    // Scan for specs
    const scanResult = await scanSpecs(options.dir, registry);

    if (!scanResult.success) {
      console.error(`Error: ${scanResult.error}`);
      process.exit(1);
    }

    const unregistered = scanResult.data!;

    if (options.json) {
      console.log(JSON.stringify(unregistered, null, 2));
      return;
    }

    if (unregistered.length === 0) {
      console.log("All specs are registered.");
      return;
    }

    console.log(`Found ${unregistered.length} unregistered spec(s):\n`);
    for (const spec of unregistered) {
      console.log(`  - ${spec.skill}/${spec.feature} (${spec.path})`);
    }

    if (options.register) {
      console.log("\nRegistering specs...");
      for (const spec of unregistered) {
        const assignResult = assignSpec(registry, {
          feature: spec.feature,
          skill: spec.skill,
          path: spec.path,
          status: spec.status || "draft",
          created: spec.created,
        });

        if (assignResult.success) {
          console.log(`  Assigned ID ${assignResult.data!.id} to ${spec.feature} (${spec.skill})`);
        } else {
          console.error(`  Failed: ${assignResult.error}`);
        }
      }

      // Save updated registry
      const saveResult = await saveRegistry(options.registry, registry);
      if (!saveResult.success) {
        console.error(`Error saving registry: ${saveResult.error}`);
        process.exit(1);
      }
    } else {
      console.log("\nRun with --register to add these specs to the registry.");
    }
  });

program.parse();
