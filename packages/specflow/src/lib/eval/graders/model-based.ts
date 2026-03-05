/**
 * Model-Based Graders
 * LLM-as-judge graders for evaluating spec quality and other subjective criteria
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve, dirname } from "path";
import { spawnSync } from "child_process";
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
 *
 * Uses Chain of Thought (CoT) guidance for more accurate LLM-as-judge scoring.
 * Research shows CoT improves evaluation accuracy by 15-20% over direct scoring.
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

  return `# Document Quality Evaluation

## Context & Motivation

You are an expert evaluator assessing document quality against a weighted rubric. Weighted rubrics enable consistent, reproducible evaluation by decomposing subjective quality into measurable criteria. Each criterion has a weight reflecting its importance—scores are aggregated into a weighted average that determines pass/fail.

## Rubric: ${rubric.name}

Pass threshold: ${rubric.passThreshold} (weighted score must meet or exceed this value)

## Evaluation Criteria

${criteriaSection}

## Document to Evaluate

\`\`\`markdown
${content}
\`\`\`

## Evaluation Instructions

### Scoring Scale

| Score | Meaning | Indicators |
|-------|---------|------------|
| 1.0 | Excellent | Fully meets criterion, no improvements needed |
| 0.8 | Good | Meets criterion with minor gaps |
| 0.6 | Adequate | Partially meets criterion, notable gaps |
| 0.4 | Weak | Significant gaps, needs improvement |
| 0.2 | Poor | Barely addresses criterion |
| 0.0 | Missing | Does not address criterion at all |

### Evaluation Process (Chain of Thought)

For each criterion:
1. **Quote** specific evidence from the document (or note its absence)
2. **Compare** against the criterion description and examples
3. **Identify** strengths and weaknesses
4. **Score** based on how well the document meets the criterion
5. **Explain** the reasoning in 1-2 sentences

### Example Reasoning

For a criterion "Clarity" at weight 0.3:
- Evidence: "The overview uses clear language, but acceptance criteria use undefined terms like 'efficient' without metrics"
- Strengths: Clear structure, good headers
- Weaknesses: Vague terms in criteria section
- Score: 0.7 (good but not excellent due to ambiguous terms)
- Reasoning: "Clear structure and language overall, but acceptance criteria need measurable definitions"

## Output Format

Respond with ONLY valid JSON in this exact format (no additional text before or after):

\`\`\`json
{
  "scores": {
${rubric.criteria.map((c) => `    "${c.name}": { "score": 0.0, "reasoning": "1-2 sentence explanation with specific evidence" }`).join(",\n")}
  },
  "overall": "2-3 sentence summary: key strengths, main improvement areas, and whether this meets quality standards"
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
    // Try to extract JSON from markdown code blocks.
    // Prefer explicit ```json blocks first (PAI Algorithm format puts non-JSON code
    // blocks earlier in the output), then fall back to any code block.
    let jsonText = responseText;
    const jsonCodeBlock = responseText.match(/```json\s*([\s\S]*?)```/);
    if (jsonCodeBlock) {
      jsonText = jsonCodeBlock[1].trim();
    } else {
      const anyCodeBlock = responseText.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (anyCodeBlock) {
        jsonText = anyCodeBlock[1].trim();
      }
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
    // Resolve bundled rubrics relative to this source file (works in both dev and installed paths)
    const bundledRubricPath = resolve(dirname(import.meta.filename), '..', '..', '..', '..', 'evals', 'rubrics', `${rubricName}.yaml`);

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

    // Try Anthropic SDK first, fall back to claude CLI (CLAUDE_CODE_OAUTH_TOKEN)
    const apiKey = loadApiKeyFromEnv();
    let responseText: string | undefined;
    let lastError: string | undefined;

    // Attempt 1: Anthropic SDK with API key
    if (apiKey) {
      try {
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });
        responseText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n");
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    // Attempt 2: claude CLI (uses CLAUDE_CODE_OAUTH_TOKEN for Max subscription auth)
    if (!responseText) {
      try {
        const result = spawnSync("claude", ["--print", "--no-session-persistence", "--model", "haiku", prompt], {
          encoding: "utf-8",
          timeout: 120_000,
          env: { ...process.env, CLAUDECODE: undefined },
        });
        if (result.status === 0 && result.stdout) {
          responseText = result.stdout.trim();
        } else {
          lastError = result.stderr?.trim() || `claude CLI exited with status ${result.status}`;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (responseText) {
      return parseGradingResponse(responseText, rubric);
    }

    return {
      passed: false,
      score: null,
      output: "",
      error: `Claude eval error: ${lastError ?? "no response from SDK or CLI"}`,
    };
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
