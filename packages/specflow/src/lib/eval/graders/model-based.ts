/**
 * Model-Based Graders
 * LLM-as-judge graders for evaluating spec quality and other subjective criteria
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { parse as parseYaml } from "yaml";
import type { Grader } from "./index";
import type { GradeContext, GradeResult, Rubric, RubricCriterion, TestCase } from "../types";

// =============================================================================
// Environment Loading
// =============================================================================

/**
 * Load API key from environment or known .env files
 */
function loadApiKeyFromEnv(): string | undefined {
  // First check environment
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Check known .env file locations
  const envPaths = [
    `${homedir()}/.claude/.env`,
    `${homedir()}/work/ragent/.env`,
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match) {
        return match[1].trim();
      }
    }
  }

  return undefined;
}

// =============================================================================
// YAML Parsing
// =============================================================================

/**
 * Parse rubric YAML content into a Rubric object
 * @throws Error if YAML is invalid or doesn't match schema
 */
export function parseRubricYaml(yamlContent: string): Rubric {
  const parsed = parseYaml(yamlContent);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid rubric YAML: expected object");
  }

  if (typeof parsed.name !== "string") {
    throw new Error("Invalid rubric YAML: name must be a string");
  }

  if (typeof parsed.passThreshold !== "number") {
    throw new Error("Invalid rubric YAML: passThreshold must be a number");
  }

  if (!Array.isArray(parsed.criteria)) {
    throw new Error("Invalid rubric YAML: criteria must be an array");
  }

  const criteria: RubricCriterion[] = parsed.criteria.map((c: unknown, index: number) => {
    if (!c || typeof c !== "object") {
      throw new Error(`Invalid rubric YAML: criterion ${index} must be an object`);
    }

    const criterion = c as Record<string, unknown>;

    if (typeof criterion.name !== "string") {
      throw new Error(`Invalid rubric YAML: criterion ${index} name must be a string`);
    }

    if (typeof criterion.weight !== "number") {
      throw new Error(`Invalid rubric YAML: criterion ${index} weight must be a number`);
    }

    if (typeof criterion.description !== "string") {
      throw new Error(`Invalid rubric YAML: criterion ${index} description must be a string`);
    }

    const result: RubricCriterion = {
      name: criterion.name,
      weight: criterion.weight,
      description: criterion.description,
    };

    // Optional examples
    if (criterion.examples && typeof criterion.examples === "object") {
      const examples = criterion.examples as Record<string, unknown>;
      if (typeof examples.good === "string" && typeof examples.bad === "string") {
        result.examples = {
          good: examples.good,
          bad: examples.bad,
        };
      }
    }

    return result;
  });

  return {
    name: parsed.name,
    passThreshold: parsed.passThreshold,
    criteria,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validation result for a rubric
 */
export interface RubricValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a rubric for correctness
 */
export function validateRubric(rubric: Rubric): RubricValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check name
  if (!rubric.name || rubric.name.trim() === "") {
    errors.push("Rubric name is required");
  }

  // Check passThreshold range
  if (rubric.passThreshold < 0 || rubric.passThreshold > 1) {
    errors.push(`Pass threshold must be between 0 and 1 (got ${rubric.passThreshold})`);
  }

  // Check criteria exist
  if (!rubric.criteria || rubric.criteria.length === 0) {
    errors.push("At least one criteria is required");
  }

  // Check weights sum to 1.0 (with tolerance for floating point)
  if (rubric.criteria && rubric.criteria.length > 0) {
    const weightSum = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      errors.push(`Criteria weights must sum to 1.0 (got ${weightSum.toFixed(3)})`);
    }

    // Check individual criteria
    for (const criterion of rubric.criteria) {
      if (!criterion.name || criterion.name.trim() === "") {
        errors.push("All criteria must have a name");
      }

      if (criterion.weight < 0 || criterion.weight > 1) {
        errors.push(`Criterion "${criterion.name}" weight must be between 0 and 1`);
      }

      if (!criterion.description || criterion.description.trim() === "") {
        warnings.push(`Criterion "${criterion.name}" has no description`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Loading
// =============================================================================

/**
 * Load and validate a rubric from a file path
 * @throws Error if file doesn't exist or rubric is invalid
 */
export async function loadRubric(filePath: string): Promise<Rubric> {
  if (!existsSync(filePath)) {
    throw new Error(`Rubric file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  const rubric = parseRubricYaml(content);
  const validation = validateRubric(rubric);

  if (!validation.valid) {
    throw new Error(`Invalid rubric "${rubric.name}": ${validation.errors.join(", ")}`);
  }

  return rubric;
}

// =============================================================================
// Rubric Cache
// =============================================================================

const rubricCache = new Map<string, Rubric>();

/**
 * Get a rubric by name (cached)
 * @param name - Rubric name (e.g., "spec-quality")
 * @param rubricsDir - Directory containing rubric files
 */
export async function getRubric(name: string, rubricsDir: string): Promise<Rubric> {
  // Check cache first
  const cacheKey = `${rubricsDir}:${name}`;
  if (rubricCache.has(cacheKey)) {
    return rubricCache.get(cacheKey)!;
  }

  // Try to load from file
  const filePath = `${rubricsDir}/${name}.yaml`;
  const rubric = await loadRubric(filePath);

  // Cache for future use
  rubricCache.set(cacheKey, rubric);

  return rubric;
}

/**
 * Clear the rubric cache
 */
export function clearRubricCache(): void {
  rubricCache.clear();
}

// =============================================================================
// Grading Prompt
// =============================================================================

/**
 * Expected response format from the model
 */
interface GradingResponseScore {
  score: number;
  reasoning: string;
}

interface GradingResponse {
  scores: Record<string, GradingResponseScore>;
  overall: string;
}

/**
 * Build a structured grading prompt from a rubric and content
 */
export function buildGradingPrompt(rubric: Rubric, content: string): string {
  const criteriaSection = rubric.criteria
    .map((criterion) => {
      let text = `### ${criterion.name} (weight: ${criterion.weight})\n${criterion.description}`;
      if (criterion.examples) {
        text += `\n\n**Good example:**\n${criterion.examples.good}`;
        text += `\n\n**Bad example:**\n${criterion.examples.bad}`;
      }
      return text;
    })
    .join("\n\n");

  return `You are evaluating a specification document against the "${rubric.name}" quality rubric.

## Evaluation Criteria

${criteriaSection}

## Document to Evaluate

\`\`\`markdown
${content}
\`\`\`

## Instructions

Score each criterion from 0.0 to 1.0, where:
- 0.0 = Does not meet the criterion at all
- 0.5 = Partially meets the criterion
- 1.0 = Fully meets the criterion

Respond with ONLY valid JSON in this exact format (no additional text):

\`\`\`json
{
  "scores": {
${rubric.criteria.map((c) => `    "${c.name}": { "score": 0.0, "reasoning": "Brief explanation" }`).join(",\n")}
  },
  "overall": "Brief overall assessment"
}
\`\`\``;
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse the model's grading response and calculate weighted score
 */
export function parseGradingResponse(responseText: string, rubric: Rubric): GradeResult {
  try {
    // Try to extract JSON from markdown code blocks
    let jsonText = responseText;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    // Parse JSON
    const response: GradingResponse = JSON.parse(jsonText);

    // Calculate weighted score
    let weightedScore = 0;
    const reasoning: string[] = [];

    for (const criterion of rubric.criteria) {
      const scoreData = response.scores[criterion.name];
      const score = scoreData?.score ?? 0;
      weightedScore += score * criterion.weight;
      reasoning.push(
        `**${criterion.name}** (${score.toFixed(2)}): ${scoreData?.reasoning ?? "No score provided"}`
      );
    }

    // Round to avoid floating point issues
    weightedScore = Math.round(weightedScore * 100) / 100;

    return {
      passed: weightedScore >= rubric.passThreshold,
      score: weightedScore,
      output: reasoning.join("\n\n") + `\n\n**Overall:** ${response.overall ?? "No overall assessment"}`,
    };
  } catch (error) {
    return {
      passed: false,
      score: 0,
      output: responseText,
      error: `Failed to parse grading response: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =============================================================================
// Model Grader
// =============================================================================

/**
 * Create a model-based grader that uses Claude Haiku
 *
 * Config options:
 * - rubric: Name of rubric to use (e.g., "spec-quality")
 * - rubricsDir: Directory containing rubric files (default: evals/rubrics)
 * - file: Path to the file to grade (relative to project root)
 */
export const modelGrader: Grader = {
  name: "model",
  type: "model",

  async grade(testCase: TestCase, context: GradeContext): Promise<GradeResult> {
    // Get config
    const rubricName = testCase.graderConfig.rubric as string | undefined;
    const filePath = testCase.graderConfig.file as string | undefined;
    const rubricsDir =
      (testCase.graderConfig.rubricsDir as string) || `${context.projectPath}/evals/rubrics`;

    // Validate config
    if (!rubricName) {
      return {
        passed: false,
        score: null,
        output: "",
        error: "Model grader requires 'rubric' in graderConfig",
      };
    }

    if (!filePath) {
      return {
        passed: false,
        score: null,
        output: "",
        error: "Model grader requires 'file' in graderConfig",
      };
    }

    // Load rubric - try project-local first, then SpecFlow bundled
    let rubric: Rubric;
    const projectRubricPath = `${rubricsDir}/${rubricName}.yaml`;
    const bundledRubricPath = `${homedir()}/.claude/skills/SpecFlow/evals/rubrics/${rubricName}.yaml`;

    try {
      if (existsSync(projectRubricPath)) {
        rubric = await loadRubric(projectRubricPath);
      } else if (existsSync(bundledRubricPath)) {
        rubric = await loadRubric(bundledRubricPath);
      } else {
        return {
          passed: false,
          score: null,
          output: "",
          error: `Rubric not found: ${rubricName}.yaml (checked ${projectRubricPath} and ${bundledRubricPath})`,
        };
      }
    } catch (error) {
      return {
        passed: false,
        score: null,
        output: "",
        error: `Failed to load rubric: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Read file to grade
    const fullPath = `${context.projectPath}/${filePath}`;
    if (!existsSync(fullPath)) {
      return {
        passed: false,
        score: null,
        output: "",
        error: `File not found: ${fullPath}`,
      };
    }
    const content = readFileSync(fullPath, "utf-8");

    // Build grading prompt
    const prompt = buildGradingPrompt(rubric, content);

    // Get API key
    const apiKey = loadApiKeyFromEnv();
    if (!apiKey) {
      return {
        passed: false,
        score: null,
        output: "",
        error: "ANTHROPIC_API_KEY not found in environment or ~/.claude/.env",
      };
    }

    // Call Claude Haiku
    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      // Parse and return result
      return parseGradingResponse(responseText, rubric);
    } catch (error) {
      return {
        passed: false,
        score: null,
        output: "",
        error: `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// =============================================================================
// Register Model Graders
// =============================================================================

import { registerGrader } from "./index";

/**
 * Register all model-based graders with the global registry
 */
export function registerModelGraders(): void {
  registerGrader({
    name: "model",
    create: () => modelGrader,
  });
}
