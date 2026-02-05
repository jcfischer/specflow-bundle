/**
 * Init Command
 * Initialize a project with feature decomposition
 */

import { join } from "path";
import { existsSync, readFileSync, unlinkSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  getStats,
  clearAllFeatures,
  getDbPath,
  dbExists,
  ensureSpecflowDir,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../lib/database";
import {
  parseDecompositionOutput,
  validateDecomposedFeatures,
  assignPriorities,
  decomposeSpec,
  decomposeDescription,
  MIN_FEATURES_HARD_FLOOR,
  DEFAULT_MIN_FEATURES,
  DEFAULT_MAX_FEATURES,
} from "../lib/decomposer";
import type { DecomposedFeature } from "../types";
import { getMinimalPAIContext } from "../lib/pai-context";

export interface InitOptions {
  minFeatures?: string;
  maxFeatures?: string;
  fromFeatures?: string;
  fromSpec?: string;
  batch?: boolean;
  force?: boolean;
}

/**
 * Execute the init command
 */
export async function initCommand(
  description: string | undefined,
  options: InitOptions
): Promise<void> {
  const projectPath = process.cwd();
  const dbPath = join(projectPath, SPECFLOW_DIR, DB_FILENAME);

  // Check if database already exists (in either location)
  if (dbExists(projectPath) && !options.force) {
    console.error(`Error: SpecFlow already initialized (database exists).`);
    console.error("Use --force to overwrite, or run from a different directory.");
    process.exit(1);
  }

  let features: DecomposedFeature[];

  try {
    if (options.fromFeatures) {
      // Load features from JSON file
      features = loadFeaturesFromFile(options.fromFeatures);
    } else if (options.fromSpec) {
      // Decompose from existing spec
      features = await decomposeSpec(options.fromSpec, {
        minFeatures: options.minFeatures ? parseInt(options.minFeatures) : undefined,
        maxFeatures: options.maxFeatures ? parseInt(options.maxFeatures) : undefined,
      });
    } else if (description && options.batch) {
      // Batch mode: non-interactive decomposition via Claude
      features = await decomposeDescription(description, {
        minFeatures: options.minFeatures ? parseInt(options.minFeatures) : undefined,
        maxFeatures: options.maxFeatures ? parseInt(options.maxFeatures) : undefined,
      });
    } else if (description) {
      // Interactive mode: output prompt for Task tool to run Interview
      outputInterviewPrompt(description, projectPath, options);
      return;
    } else {
      console.error("Error: Please provide a description or use --from-features/--from-spec.");
      if (options.batch) {
        console.error("Batch mode requires a description argument or --from-features/--from-spec.");
      }
      process.exit(1);
    }

    // Validate features (including feature count)
    const minFeatures = options.minFeatures ? parseInt(options.minFeatures) : DEFAULT_MIN_FEATURES;
    const maxFeatures = options.maxFeatures ? parseInt(options.maxFeatures) : DEFAULT_MAX_FEATURES;

    // Hard floor check - reject before validation
    if (minFeatures < MIN_FEATURES_HARD_FLOOR) {
      console.error(
        `Error: --min-features cannot be less than ${MIN_FEATURES_HARD_FLOOR}.`
      );
      console.error(
        `If your project is simpler than ${MIN_FEATURES_HARD_FLOOR} features, you don't need SpecFlow.`
      );
      process.exit(1);
    }

    const errors = validateDecomposedFeatures(features, { minFeatures, maxFeatures });
    if (errors.length > 0) {
      console.error("Error: Invalid features:");
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    // Assign priorities based on dependencies
    features = assignPriorities(features);

    // Remove existing database if force flag (check both locations)
    const legacyPath = join(projectPath, DB_FILENAME);
    if (existsSync(dbPath) && options.force) {
      unlinkSync(dbPath);
    }
    if (existsSync(legacyPath) && options.force) {
      unlinkSync(legacyPath);
    }

    // Ensure .specflow directory exists and initialize database
    ensureSpecflowDir(projectPath);
    initDatabase(dbPath);

    for (const feature of features) {
      addFeature({
        id: feature.id,
        name: feature.name,
        description: feature.description,
        priority: feature.priority,
        problemType: feature.problemType,
        urgency: feature.urgency,
        primaryUser: feature.primaryUser,
        integrationScope: feature.integrationScope,
        usageContext: feature.usageContext,
        dataRequirements: feature.dataRequirements,
        performanceRequirements: feature.performanceRequirements,
        priorityTradeoff: feature.priorityTradeoff,
        uncertainties: feature.uncertainties,
        clarificationNeeded: feature.clarificationNeeded,
      });
    }

    const stats = getStats();

    console.log(`\n✓ Initialized SpecFlow project with ${stats.total} features\n`);
    console.log("Features:");
    for (const feature of features) {
      console.log(`  ${feature.id}: ${feature.name} (priority ${feature.priority})`);
    }
    console.log("");
    console.log("Next steps:");
    console.log("  specflow status    - View feature queue");
    console.log("  specflow run       - Start implementation");
    console.log("");
  } catch (error) {
    console.error(`Error: Failed to initialize: ${error}`);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

/**
 * Output the interview prompt for Task tool
 */
function outputInterviewPrompt(
  description: string,
  projectPath: string,
  options: InitOptions
): void {
  const minFeatures = options.minFeatures || String(DEFAULT_MIN_FEATURES);
  const maxFeatures = options.maxFeatures || String(DEFAULT_MAX_FEATURES);

  console.log("─".repeat(70));
  console.log("SPECFLOW INIT: Interview Phase");
  console.log("─".repeat(70));
  console.log("\nCopy this prompt for Task tool:\n");
  console.log("```");
  console.log(`You are initializing a SpecFlow project. Your task is to:

1. **Conduct an Interview** to understand the app requirements
2. **Create app-context.md** with the gathered requirements
3. **Decompose into features** and create features.json

## App Description

${description}

## Project Path

${projectPath}

## Step 1: Interview (Use AskUserQuestion tool)

Conduct a structured interview following the Interview skill's 8 phases:

1. **Problem Space**: What's the real problem? Why now? What if we don't solve it?
2. **Users & Stakeholders**: Primary users? Technical level? Constraints?
3. **Existing Context**: What already exists? Integration points? Data?
4. **Constraints & Tradeoffs**: Speed vs quality vs cost? Performance? Security?
5. **User Experience**: Discovery? Mental model? Error handling?
6. **Edge Cases & Failure Modes**: Worst case? Under load? External failures?
7. **Success Criteria**: Definition of done? Metrics? Minimum viable?
8. **Future & Scope**: What might change? What's explicitly out of scope?

Ask 2-3 questions per phase using AskUserQuestion tool.

## Step 2: Create App Context

After the interview, create: ${projectPath}/.specify/app-context.md

Format:
\`\`\`markdown
# App Context: <name>

## Problem Statement
[From Phase 1]

## Users & Stakeholders
[From Phase 2]

## Current State
[From Phase 3]

## Constraints & Requirements
[From Phase 4]

## User Experience
[From Phase 5]

## Edge Cases & Error Handling
[From Phase 6]

## Success Criteria
[From Phase 7]

## Scope
### In Scope
### Explicitly Out of Scope
[From Phase 8]
\`\`\`

## Step 3: Decompose into Features

Based on the app context, decompose into ${minFeatures}-${maxFeatures} features.

Create: ${projectPath}/features.json

Format:
\`\`\`json
[
  {"id": "F-1", "name": "Feature name", "description": "What it does", "dependencies": [], "priority": 1},
  {"id": "F-2", "name": "Another feature", "description": "What it does", "dependencies": ["F-1"], "priority": 2}
]
\`\`\`

Guidelines:
- Order features by implementation dependency
- Earlier features should NOT depend on later ones
- Each feature should be independently testable
- Feature descriptions should be 1-2 sentences

## Feature Granularity Rules (CRITICAL)

Each feature should be:
- **Completable in 1-4 hours** of focused work
- **Independently testable** with its own test file
- **User-visible capability**, not an internal module

❌ BAD (too big - this is ONE feature):
  "F-1: Domain Security Scanner"

✅ GOOD (properly decomposed):
  "F-1: Domain input validation"
  "F-2: SSL/TLS certificate scanner"
  "F-3: HTTP security headers scanner"
  "F-4: DNS configuration scanner"
  "F-5: Port scanner"
  "F-6: Grading engine"
  "F-7: REST API endpoint"
  "F-8: Web dashboard UI"

If you find yourself with fewer than ${minFeatures} features, you're not decomposing enough.
Each scanner, API endpoint, UI component, etc. should be its own feature.

## Completion

When done, output:
\`\`\`
[INTERVIEW COMPLETE]
App Context: ${projectPath}/.specify/app-context.md
Features: ${projectPath}/features.json
\`\`\`

Then tell the user to run:
  specflow init --from-features features.json

${getMinimalPAIContext()}`);
  console.log("```");
  console.log("\nAfter Task completes, run:");
  console.log("  specflow init --from-features features.json");
  console.log("");
}

/**
 * Load features from a JSON file
 */
function loadFeaturesFromFile(filePath: string): DecomposedFeature[] {
  if (!existsSync(filePath)) {
    throw new Error(`Features file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");

  try {
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error("Features file must contain a JSON array");
    }

    return parsed.map((item, index) => {
      const feature: DecomposedFeature = {
        id: String(item.id ?? `F-${index + 1}`),
        name: String(item.name ?? ""),
        description: String(item.description ?? ""),
        dependencies: Array.isArray(item.dependencies)
          ? item.dependencies.map(String)
          : [],
        priority: typeof item.priority === "number" ? item.priority : index + 1,
      };

      // Parse rich decomposition fields if present
      if (item.problemType) feature.problemType = item.problemType;
      if (item.urgency) feature.urgency = item.urgency;
      if (item.primaryUser) feature.primaryUser = item.primaryUser;
      if (item.integrationScope) feature.integrationScope = item.integrationScope;
      if (item.usageContext) feature.usageContext = item.usageContext;
      if (item.dataRequirements) feature.dataRequirements = item.dataRequirements;
      if (item.performanceRequirements) feature.performanceRequirements = item.performanceRequirements;
      if (item.priorityTradeoff) feature.priorityTradeoff = item.priorityTradeoff;
      if (Array.isArray(item.uncertainties)) feature.uncertainties = item.uncertainties.map(String);
      if (item.clarificationNeeded) feature.clarificationNeeded = String(item.clarificationNeeded);

      return feature;
    });
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Failed to parse features file: ${e.message}`);
    }
    throw e;
  }
}
