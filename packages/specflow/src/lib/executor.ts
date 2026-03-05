/**
 * Executor Module
 * Executes Claude subprocess for feature implementation
 */

import { spawn, spawnSync } from "child_process";
import type { RunResult, FeatureContext } from "../types";
import { isHeadlessMode, runClaudeHeadless } from "./headless";

// =============================================================================
// Completion Detection
// =============================================================================

export interface CompletionResult {
  complete: boolean;
  blocked: boolean;
  featureId: string | null;
  blockReason: string | null;
  testsCount: number | null;
  files: string[];
}

/**
 * Parse output for completion markers
 */
export function parseCompletionMarkers(output: string): CompletionResult {
  const result: CompletionResult = {
    complete: false,
    blocked: false,
    featureId: null,
    blockReason: null,
    testsCount: null,
    files: [],
  };

  // Check for completion marker
  if (detectCompletion(output)) {
    result.complete = true;

    // Extract feature ID
    const featureMatch = output.match(/Feature:\s*(F-\d+)/i);
    if (featureMatch) {
      result.featureId = featureMatch[1];
    }

    // Extract tests count
    const testsMatch = output.match(/Tests:\s*(\d+)/i);
    if (testsMatch) {
      result.testsCount = parseInt(testsMatch[1]);
    }

    // Extract files
    const filesMatch = output.match(/Files:\s*(.+)/i);
    if (filesMatch) {
      result.files = filesMatch[1].split(",").map((f) => f.trim());
    }
  }

  // Check for blocked marker
  if (detectBlocked(output)) {
    result.blocked = true;
    result.complete = false;

    // Extract feature ID
    const featureMatch = output.match(/Feature:\s*(F-\d+)/i);
    if (featureMatch) {
      result.featureId = featureMatch[1];
    }

    // Extract reason
    const reasonMatch = output.match(/Reason:\s*(.+)/i);
    if (reasonMatch) {
      result.blockReason = reasonMatch[1].trim();
    }
  }

  return result;
}

/**
 * Check if output contains completion marker
 */
export function detectCompletion(output: string): boolean {
  return /\[FEATURE COMPLETE\]/i.test(output);
}

/**
 * Check if output contains blocked marker
 */
export function detectBlocked(output: string): boolean {
  return /\[FEATURE BLOCKED\]/i.test(output);
}

// =============================================================================
// Execution
// =============================================================================

export interface ExecuteOptions {
  timeout?: number; // in milliseconds
  dryRun?: boolean;
}

/**
 * Execute Claude to implement a feature
 */
export async function executeFeature(
  context: FeatureContext,
  prompt: string,
  options: ExecuteOptions = {}
): Promise<RunResult> {
  const { timeout = 10 * 60 * 1000, dryRun = false } = options; // 10 minute default

  if (dryRun) {
    return {
      success: false,
      featureId: context.feature.id,
      output: "[DRY RUN] Would execute Claude with the provided prompt",
      error: null,
      blocked: false,
      blockReason: null,
    };
  }

  // Headless mode
  if (isHeadlessMode()) {
    try {
      const result = await runClaudeHeadless(prompt, {
        cwd: context.app.projectPath,
        timeout,
      });

      if (!result.success) {
        return {
          success: false,
          featureId: context.feature.id,
          output: result.output,
          error: result.error || "Headless execution failed",
          blocked: false,
          blockReason: null,
        };
      }

      const completion = parseCompletionMarkers(result.output);

      return {
        success: completion.complete,
        featureId: context.feature.id,
        output: result.output,
        error: completion.complete ? null : (completion.blocked ? null : "No completion marker"),
        blocked: completion.blocked,
        blockReason: completion.blockReason,
      };
    } catch (error) {
      return {
        success: false,
        featureId: context.feature.id,
        output: "",
        error: `Headless execution failed: ${error}`,
        blocked: false,
        blockReason: null,
      };
    }
  }

  try {
    // Execute Claude CLI
    const result = spawnSync("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout,
      cwd: context.app.projectPath,
      env: { ...process.env, SPECFLOW_CODING_AGENT: '1' },
    });

    const output = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    // Check for execution errors
    if (result.status !== 0 && !output) {
      return {
        success: false,
        featureId: context.feature.id,
        output: stderr,
        error: `Claude exited with status ${result.status}`,
        blocked: false,
        blockReason: null,
      };
    }

    // Parse completion markers
    const completion = parseCompletionMarkers(output);

    if (completion.blocked) {
      return {
        success: false,
        featureId: context.feature.id,
        output,
        error: null,
        blocked: true,
        blockReason: completion.blockReason,
      };
    }

    if (completion.complete) {
      return {
        success: true,
        featureId: context.feature.id,
        output,
        error: null,
        blocked: false,
        blockReason: null,
      };
    }

    // No completion marker found - treat as incomplete
    return {
      success: false,
      featureId: context.feature.id,
      output,
      error: "No completion marker found in output",
      blocked: false,
      blockReason: null,
    };
  } catch (error) {
    return {
      success: false,
      featureId: context.feature.id,
      output: "",
      error: `Execution failed: ${error}`,
      blocked: false,
      blockReason: null,
    };
  }
}

/**
 * Execute with streaming output
 */
export async function executeFeatureStreaming(
  context: FeatureContext,
  prompt: string,
  onOutput: (chunk: string) => void,
  options: ExecuteOptions = {}
): Promise<RunResult> {
  const { timeout = 10 * 60 * 1000, dryRun = false } = options;

  if (dryRun) {
    onOutput("[DRY RUN] Would execute Claude with the provided prompt\n");
    return Promise.resolve({
      success: false,
      featureId: context.feature.id,
      output: "[DRY RUN]",
      error: null,
      blocked: false,
      blockReason: null,
    });
  }

  // Headless mode: delegate to executeFeature (no streaming needed in CI)
  if (isHeadlessMode()) {
    const result = await executeFeature(context, prompt, options);
    if (result.output) {
      onOutput(result.output);
    }
    return result;
  }

  return new Promise((resolve) => {
    const proc = spawn("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      cwd: context.app.projectPath,
      env: { ...process.env, SPECFLOW_CODING_AGENT: '1' },
    });

    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      onOutput(chunk);
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      onOutput(chunk);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          success: false,
          featureId: context.feature.id,
          output,
          error: "Execution timed out",
          blocked: false,
          blockReason: null,
        });
        return;
      }

      const completion = parseCompletionMarkers(output);

      if (completion.blocked) {
        resolve({
          success: false,
          featureId: context.feature.id,
          output,
          error: null,
          blocked: true,
          blockReason: completion.blockReason,
        });
        return;
      }

      if (completion.complete) {
        resolve({
          success: true,
          featureId: context.feature.id,
          output,
          error: null,
          blocked: false,
          blockReason: null,
        });
        return;
      }

      resolve({
        success: false,
        featureId: context.feature.id,
        output,
        error: code !== 0 ? `Claude exited with status ${code}` : "No completion marker",
        blocked: false,
        blockReason: null,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        featureId: context.feature.id,
        output,
        error: `Process error: ${err.message}`,
        blocked: false,
        blockReason: null,
      });
    });
  });
}
