/**
 * Decomposer Module
 * Breaks app specifications into independent features
 */

import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import type { DecomposedFeature } from "../types";

// =============================================================================
// Prompt Loading
// =============================================================================

const PROMPTS_DIR = join(import.meta.dir, "../../prompts");

/**
 * Load the decomposition prompt template
 */
export function loadDecomposePrompt(): string {
  const promptPath = join(PROMPTS_DIR, "decompose.md");
  return readFileSync(promptPath, "utf-8");
}

/**
 * Build the full prompt with app spec injected
 */
export function buildDecomposePrompt(appSpec: string): string {
  const template = loadDecomposePrompt();
  return template.replace("{{APP_SPEC}}", appSpec);
}

// =============================================================================
// Output Parsing
// =============================================================================

/**
 * Parse the decomposition output from Claude
 * Extracts JSON array of features from markdown/text response
 */
export function parseDecompositionOutput(output: string): DecomposedFeature[] {
  // Try to extract JSON from code fence
  const codeFenceMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr: string;

  if (codeFenceMatch) {
    jsonStr = codeFenceMatch[1].trim();
  } else {
    // Try to find raw JSON array
    const arrayMatch = output.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    } else {
      throw new Error("Could not find JSON array in decomposition output");
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected array of features");
  }

  // Validate and cast each feature
  return parsed.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Feature at index ${index} is not an object`);
    }

    const obj = item as Record<string, unknown>;

    return {
      id: String(obj.id ?? `F-${index + 1}`),
      name: String(obj.name ?? ""),
      description: String(obj.description ?? ""),
      dependencies: Array.isArray(obj.dependencies)
        ? obj.dependencies.map(String)
        : [],
      priority: typeof obj.priority === "number" ? obj.priority : index + 1,
    };
  });
}

// =============================================================================
// Validation
// =============================================================================

// Minimum feature count - projects simpler than this don't need SpecFlow
export const MIN_FEATURES_HARD_FLOOR = 3;
export const DEFAULT_MIN_FEATURES = 5;
export const DEFAULT_MAX_FEATURES = 15;

/**
 * Validate decomposed features for completeness and consistency
 * Returns array of error messages (empty if valid)
 */
export function validateDecomposedFeatures(
  features: DecomposedFeature[],
  options: { minFeatures?: number; maxFeatures?: number } = {}
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  const minFeatures = options.minFeatures ?? DEFAULT_MIN_FEATURES;
  const maxFeatures = options.maxFeatures ?? DEFAULT_MAX_FEATURES;

  // Enforce minimum feature count
  if (features.length < MIN_FEATURES_HARD_FLOOR) {
    errors.push(
      `Too few features: ${features.length} (minimum ${MIN_FEATURES_HARD_FLOOR}). ` +
        `If your project is simpler than ${MIN_FEATURES_HARD_FLOOR} features, you don't need SpecFlow.`
    );
  } else if (features.length < minFeatures) {
    errors.push(
      `Feature count ${features.length} is below recommended minimum of ${minFeatures}. ` +
        `Consider breaking features into smaller, independently testable units.`
    );
  }

  // Warn if too many features
  if (features.length > maxFeatures) {
    errors.push(
      `Too many features: ${features.length} (maximum ${maxFeatures}). ` +
        `Consider grouping related features or splitting into multiple projects.`
    );
  }

  for (const feature of features) {
    // Check required fields
    if (!feature.id || feature.id.trim() === "") {
      errors.push(`Feature missing id`);
    }
    if (!feature.name || feature.name.trim() === "") {
      errors.push(`Feature ${feature.id}: missing name`);
    }
    if (!feature.description || feature.description.trim() === "") {
      errors.push(`Feature ${feature.id}: missing description`);
    }

    // Check for duplicate IDs
    if (ids.has(feature.id)) {
      errors.push(`Duplicate feature ID: ${feature.id}`);
    }
    ids.add(feature.id);
  }

  // Validate dependencies reference existing features
  for (const feature of features) {
    for (const dep of feature.dependencies) {
      if (!ids.has(dep)) {
        errors.push(`Feature ${feature.id}: dependency ${dep} not found`);
      }
    }
  }

  return errors;
}

// =============================================================================
// Priority Assignment
// =============================================================================

/**
 * Assign priorities based on dependency graph
 * Features with no dependencies get priority 1
 * Dependent features get max(dependency priorities) + 1
 */
export function assignPriorities(features: DecomposedFeature[]): DecomposedFeature[] {
  const priorityMap = new Map<string, number>();
  const featureMap = new Map<string, DecomposedFeature>();

  // Index features by ID
  for (const feature of features) {
    featureMap.set(feature.id, feature);
  }

  // Recursive function to calculate priority
  function calculatePriority(id: string, visited: Set<string>): number {
    if (priorityMap.has(id)) {
      return priorityMap.get(id)!;
    }

    if (visited.has(id)) {
      // Circular dependency, return current depth
      return visited.size;
    }

    const feature = featureMap.get(id);
    if (!feature) {
      return 1;
    }

    visited.add(id);

    if (feature.dependencies.length === 0) {
      priorityMap.set(id, 1);
      return 1;
    }

    // Priority is max of dependency priorities + 1
    let maxDepPriority = 0;
    for (const depId of feature.dependencies) {
      const depPriority = calculatePriority(depId, visited);
      maxDepPriority = Math.max(maxDepPriority, depPriority);
    }

    const priority = maxDepPriority + 1;
    priorityMap.set(id, priority);
    return priority;
  }

  // Calculate priorities for all features
  for (const feature of features) {
    calculatePriority(feature.id, new Set());
  }

  // Return features with assigned priorities
  return features.map((feature) => ({
    ...feature,
    priority: priorityMap.get(feature.id) ?? 1,
  }));
}

// =============================================================================
// Decomposition Execution
// =============================================================================

export interface DecomposeOptions {
  minFeatures?: number;
  maxFeatures?: number;
}

/**
 * Decompose an app specification into features using Claude
 */
export async function decomposeSpec(
  appSpecPath: string,
  options: DecomposeOptions = {}
): Promise<DecomposedFeature[]> {
  const { minFeatures = 5, maxFeatures = 20 } = options;

  // Read the app spec
  const appSpec = readFileSync(appSpecPath, "utf-8");

  // Build the prompt
  let prompt = buildDecomposePrompt(appSpec);
  prompt += `\n\nGenerate between ${minFeatures} and ${maxFeatures} features.`;

  // Call Claude via subprocess
  const result = spawnSync("claude", ["--print", "--dangerously-skip-permissions", prompt], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  if (result.status !== 0) {
    throw new Error(`Claude command failed: ${result.stderr}`);
  }

  // Parse the output
  const features = parseDecompositionOutput(result.stdout);

  // Validate
  const errors = validateDecomposedFeatures(features);
  if (errors.length > 0) {
    throw new Error(`Decomposition validation failed:\n${errors.join("\n")}`);
  }

  // Assign priorities based on dependencies
  return assignPriorities(features);
}
