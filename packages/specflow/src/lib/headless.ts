/**
 * Headless Claude Runner
 * Shared utility for running Claude in non-interactive (headless/CI) mode.
 * Uses `claude -p --output-format json` to avoid TTY requirements and PAI hook corruption.
 *
 * In headless mode, `claude -p` processes a prompt and returns text output.
 * It cannot execute tools or write files to disk. Commands that need file
 * artifacts (spec.md, plan.md) must extract content from the output and
 * write it themselves.
 *
 * Reference: doctorow.ts evaluateCheckWithAI() for the proven pattern.
 */

import { writeFileSync } from "fs";
import { extractJsonFromResponse } from "./doctorow";

// =============================================================================
// Types
// =============================================================================

export interface HeadlessResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface HeadlessOptions {
  /** Model override (default: SPECFLOW_MODEL env or claude-opus-4-5-20251101) */
  model?: string;
  /** Timeout in milliseconds (default: 120000) */
  timeout?: number;
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Working directory for the spawned process */
  cwd?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MODEL = "claude-opus-4-5-20251101";
const DEFAULT_TIMEOUT = 120_000;

// =============================================================================
// Detection
// =============================================================================

/**
 * Returns true if running in headless mode.
 * Headless when stdin is not a TTY or SPECFLOW_HEADLESS=true.
 */
export function isHeadlessMode(): boolean {
  return !process.stdin.isTTY || process.env.SPECFLOW_HEADLESS === "true";
}

// =============================================================================
// Runner
// =============================================================================

/**
 * Run Claude in headless mode using `claude -p --output-format json`.
 * Extracts the result text from the JSON envelope.
 */
export async function runClaudeHeadless(
  prompt: string,
  options: HeadlessOptions = {}
): Promise<HeadlessResult> {
  const model = options.model || process.env.SPECFLOW_MODEL || DEFAULT_MODEL;
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const cwd = options.cwd || process.cwd();

  // ─── Prompt-output mode ──────────────────────────────────────────
  // When SPECFLOW_PROMPT_OUTPUT is set, write the prompt as JSON to the
  // specified file and exit immediately. This allows external launchers
  // (e.g., ivy-heartbeat) to run Claude with Max OAuth auth instead of
  // the headless `claude -p` path which lacks Max plan credentials.
  const promptOutputPath = process.env.SPECFLOW_PROMPT_OUTPUT;
  if (promptOutputPath) {
    const promptData = JSON.stringify({
      prompt,
      systemPrompt: options.systemPrompt ?? "",
      model,
      cwd,
    });
    writeFileSync(promptOutputPath, promptData);
    process.exit(0);
  }

  const args = ["-p", "--output-format", "json", "--model", model];

  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  args.push(prompt);

  try {
    const proc = Bun.spawn(["claude", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: { ...process.env, CLAUDECODE: undefined },
    });

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        proc.kill();
        resolve(null);
      }, timeout);
    });

    const resultPromise = (async () => {
      const rawOutput = await new Response(proc.stdout).text();
      const stderrOutput = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0 && !rawOutput) {
        return {
          success: false,
          output: "",
          error: stderrOutput || `Claude exited with code ${exitCode}`,
        };
      }

      // Extract text from JSON envelope
      let output = rawOutput;
      try {
        const parsed = JSON.parse(rawOutput);
        if (parsed.type === "result" && typeof parsed.result === "string") {
          output = parsed.result;
        }
      } catch {
        // Not JSON envelope, use raw output
      }

      // Check for phase completion markers
      const hasCompletion = output.includes("[PHASE COMPLETE") || output.includes("[FEATURE COMPLETE");
      const success = exitCode === 0 || hasCompletion;

      return { success, output };
    })();

    const result = await Promise.race([resultPromise, timeoutPromise]);

    if (!result) {
      return {
        success: false,
        output: "",
        error: `Claude timed out after ${timeout / 1000}s`,
      };
    }

    return result;
  } catch (error) {
    return {
      success: false,
      output: "",
      error: `Failed to spawn Claude: ${error}`,
    };
  }
}

// =============================================================================
// Output Extraction
// =============================================================================

/**
 * Extract a markdown artifact from Claude's headless output.
 *
 * In `claude -p` mode, Claude cannot write files — it returns text only.
 * This function extracts the spec/plan content from that text output so
 * the caller can write it to disk.
 *
 * Extraction strategy (in priority order):
 * 1. Look for a fenced markdown block (```markdown ... ```)
 * 2. Look for content starting with a markdown heading (# Specification: ...)
 * 3. Use the entire output as-is (stripping phase completion markers)
 */
export function extractMarkdownArtifact(output: string): string | null {
  if (!output || !output.trim()) {
    return null;
  }

  // Strategy 1: Extract from fenced markdown block
  const fencedMatch = output.match(/```(?:markdown|md)\s*\n([\s\S]*?)```/);
  if (fencedMatch && fencedMatch[1].trim()) {
    return fencedMatch[1].trim();
  }

  // Strategy 2: Extract from first markdown heading to phase marker (or end)
  const phaseMarkerIndex = output.search(/\n\[PHASE (?:COMPLETE|BLOCKED)/);
  const headingIndex = output.search(/^# /m);
  if (headingIndex !== -1) {
    const endIndex = phaseMarkerIndex !== -1 ? phaseMarkerIndex : output.length;
    const content = output.slice(headingIndex, endIndex).trim();
    if (content) {
      return content;
    }
  }

  // Strategy 3: Strip phase markers and use remaining content
  const stripped = output
    .replace(/\[PHASE (?:COMPLETE|BLOCKED)[^\]]*\][^\n]*/g, "")
    .replace(/Feature:.*$/gm, "")
    .replace(/Spec:.*$/gm, "")
    .replace(/Mode:.*$/gm, "")
    .replace(/Clarifications needed:.*$/gm, "")
    .trim();

  if (stripped.length > 50) {
    return stripped;
  }

  return null;
}
