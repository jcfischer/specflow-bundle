/**
 * Enrich Command
 * Add missing decomposition fields to enable batch mode
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  updateFeatureDecomposition,
  getDbPath,
  dbExists,
} from "../lib/database";
import { getMissingBatchFields } from "../types";
import type {
  Feature,
  DecomposedFeature,
  ProblemType,
  UrgencyType,
  PrimaryUserType,
  IntegrationScopeType,
} from "../types";
import type { UpdateDecompositionInput } from "../lib/database";

export interface EnrichCommandOptions {
  problemType?: string;
  urgency?: string;
  primaryUser?: string;
  integrationScope?: string;
  json?: boolean;
}

// Field options with descriptions
const PROBLEM_TYPE_OPTIONS: Record<ProblemType, string> = {
  manual_workaround: "Users do this manually but it's painful/slow",
  impossible: "Users simply cannot do this today",
  scattered: "Multiple tools/processes that should be unified",
  quality_issues: "Current approach leads to errors or inconsistency",
};

const URGENCY_OPTIONS: Record<UrgencyType, string> = {
  external_deadline: "Regulation, contract, or market timing",
  growing_pain: "Problem is getting worse as usage increases",
  blocking_work: "Can't proceed with other priorities until done",
  user_demand: "Users are explicitly requesting this",
};

const PRIMARY_USER_OPTIONS: Record<PrimaryUserType, string> = {
  developers: "Technical users building or integrating",
  end_users: "Non-technical users of the application",
  admins: "System administrators or operations team",
  mixed: "Multiple user types with different needs",
};

const INTEGRATION_SCOPE_OPTIONS: Record<IntegrationScopeType, string> = {
  standalone: "Completely new, minimal dependencies",
  extends_existing: "Adds to an existing feature or module",
  multiple_integrations: "Needs to connect several systems",
  external_apis: "Requires third-party service integration",
};

/**
 * Execute the enrich command for a feature
 */
export async function enrichCommand(
  featureId: string,
  options: EnrichCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  // Check if database exists
  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const feature = getFeature(featureId);

    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    // Cast to get decomposition fields
    const decomposed = feature as unknown as Feature & DecomposedFeature;
    const missingFields = getMissingBatchFields(decomposed);

    if (missingFields.length === 0 && !hasAnyOption(options)) {
      console.log(`\n✓ Feature ${featureId} already has all required batch fields.`);
      showCurrentFields(decomposed);
      return;
    }

    console.log(`\n📝 Enriching feature: ${feature.id} - ${feature.name}\n`);
    console.log(`Description: ${feature.description}\n`);

    if (missingFields.length > 0) {
      console.log(`Missing fields: ${missingFields.join(", ")}\n`);
    }

    // Build update input from options
    const updateInput: UpdateDecompositionInput = {};

    // Process each field if provided via options
    if (options.problemType) {
      if (!isValidProblemType(options.problemType)) {
        console.error(`Invalid problemType: ${options.problemType}`);
        console.error(`Valid options: ${Object.keys(PROBLEM_TYPE_OPTIONS).join(", ")}`);
        process.exit(1);
      }
      updateInput.problemType = options.problemType as ProblemType;
    }

    if (options.urgency) {
      if (!isValidUrgency(options.urgency)) {
        console.error(`Invalid urgency: ${options.urgency}`);
        console.error(`Valid options: ${Object.keys(URGENCY_OPTIONS).join(", ")}`);
        process.exit(1);
      }
      updateInput.urgency = options.urgency as UrgencyType;
    }

    if (options.primaryUser) {
      if (!isValidPrimaryUser(options.primaryUser)) {
        console.error(`Invalid primaryUser: ${options.primaryUser}`);
        console.error(`Valid options: ${Object.keys(PRIMARY_USER_OPTIONS).join(", ")}`);
        process.exit(1);
      }
      updateInput.primaryUser = options.primaryUser as PrimaryUserType;
    }

    if (options.integrationScope) {
      if (!isValidIntegrationScope(options.integrationScope)) {
        console.error(`Invalid integrationScope: ${options.integrationScope}`);
        console.error(`Valid options: ${Object.keys(INTEGRATION_SCOPE_OPTIONS).join(", ")}`);
        process.exit(1);
      }
      updateInput.integrationScope = options.integrationScope as IntegrationScopeType;
    }

    // If no options provided, show instructions for interactive use
    if (!hasAnyOption(options)) {
      showEnrichInstructions(featureId, missingFields);
      return;
    }

    // Apply updates
    updateFeatureDecomposition(featureId, updateInput);

    // Reload and show status
    const updated = getFeature(featureId) as unknown as Feature & DecomposedFeature;
    const remainingMissing = getMissingBatchFields(updated);

    if (options.json) {
      console.log(JSON.stringify({
        featureId,
        updated: Object.keys(updateInput),
        missingFields: remainingMissing,
        batchReady: remainingMissing.length === 0,
      }, null, 2));
      return;
    }

    console.log("─".repeat(60));
    console.log("\n✓ Fields updated:\n");
    for (const [key, value] of Object.entries(updateInput)) {
      console.log(`  ${key}: ${value}`);
    }

    if (remainingMissing.length === 0) {
      console.log("\n✓ Feature is now batch-ready!");
      console.log(`  Run: specflow specify ${featureId} --batch`);
    } else {
      console.log(`\n⚠ Still missing: ${remainingMissing.join(", ")}`);
      console.log(`  Run enrich again to add remaining fields.`);
    }
  } finally {
    closeDatabase();
  }
}

function hasAnyOption(options: EnrichCommandOptions): boolean {
  return !!(options.problemType || options.urgency || options.primaryUser || options.integrationScope);
}

function showCurrentFields(feature: Feature & DecomposedFeature): void {
  console.log("\nCurrent values:");
  console.log(`  problemType: ${feature.problemType || "(not set)"}`);
  console.log(`  urgency: ${feature.urgency || "(not set)"}`);
  console.log(`  primaryUser: ${feature.primaryUser || "(not set)"}`);
  console.log(`  integrationScope: ${feature.integrationScope || "(not set)"}`);
}

function showEnrichInstructions(featureId: string, missingFields: string[]): void {
  console.log("─".repeat(60));
  console.log("\n📋 Add missing fields using command-line options:\n");

  if (missingFields.includes("problemType")) {
    console.log("--problem-type <value>:");
    for (const [key, desc] of Object.entries(PROBLEM_TYPE_OPTIONS)) {
      console.log(`    ${key.padEnd(20)} - ${desc}`);
    }
    console.log("");
  }

  if (missingFields.includes("urgency")) {
    console.log("--urgency <value>:");
    for (const [key, desc] of Object.entries(URGENCY_OPTIONS)) {
      console.log(`    ${key.padEnd(20)} - ${desc}`);
    }
    console.log("");
  }

  if (missingFields.includes("primaryUser")) {
    console.log("--primary-user <value>:");
    for (const [key, desc] of Object.entries(PRIMARY_USER_OPTIONS)) {
      console.log(`    ${key.padEnd(20)} - ${desc}`);
    }
    console.log("");
  }

  if (missingFields.includes("integrationScope")) {
    console.log("--integration-scope <value>:");
    for (const [key, desc] of Object.entries(INTEGRATION_SCOPE_OPTIONS)) {
      console.log(`    ${key.padEnd(20)} - ${desc}`);
    }
    console.log("");
  }

  console.log("─".repeat(60));
  console.log("\nExample:");
  console.log(`  specflow enrich ${featureId} \\`);
  console.log(`    --problem-type manual_workaround \\`);
  console.log(`    --urgency blocking_work \\`);
  console.log(`    --primary-user developers \\`);
  console.log(`    --integration-scope extends_existing`);
}

// Validators
function isValidProblemType(value: string): value is ProblemType {
  return value in PROBLEM_TYPE_OPTIONS;
}

function isValidUrgency(value: string): value is UrgencyType {
  return value in URGENCY_OPTIONS;
}

function isValidPrimaryUser(value: string): value is PrimaryUserType {
  return value in PRIMARY_USER_OPTIONS;
}

function isValidIntegrationScope(value: string): value is IntegrationScopeType {
  return value in INTEGRATION_SCOPE_OPTIONS;
}
