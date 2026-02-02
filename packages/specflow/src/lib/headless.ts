/**
 * Headless Claude Runner
 * Shared utility for running Claude in non-interactive (headless/CI) mode.
 * Uses `claude -p --output-format json` to avoid TTY requirements and PAI hook corruption.
 *
 * Reference: doctorow.ts evaluateCheckWithAI() for the proven pattern.
 */

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
      env: { ...process.env },
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
