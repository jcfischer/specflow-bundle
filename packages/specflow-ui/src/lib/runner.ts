/**
 * F-12, F-13, F-14 & F-15: Runner Helper
 * Executes specflow commands, parses results, spawns Claude Code,
 * runs full automation loops, and supports streaming output.
 */

import {
  startSession,
  endSession,
  setSessionProcess,
  broadcastChunk,
  hasActiveSession,
  type ActiveSession,
} from "./session-manager";

export interface NextFeatureResult {
  success: boolean;
  status?: "ready" | "needs_phases" | "all_complete";
  feature?: {
    id: string;
    name: string;
    description: string;
    phase: string;
    status: string;
  };
  neededPhases?: string[];
  projectPath?: string;
  prompt?: string;
  error?: string;
}

export interface RunPhasesResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Get the next feature context by running specflow next --json
 */
export async function getNextFeature(
  projectPath: string
): Promise<NextFeatureResult> {
  try {
    const proc = Bun.spawn(["specflow", "next", "--json"], {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // Check if it's "no features ready" vs actual error
      if (
        stderr.includes("No features ready") ||
        stdout.includes("No features ready")
      ) {
        return {
          success: false,
          error: "No features ready for implementation",
        };
      }
      return {
        success: false,
        error: stderr || `specflow next failed with exit code ${exitCode}`,
      };
    }

    // Parse JSON output
    try {
      const result = JSON.parse(stdout);

      // Handle different response statuses
      if (result.status === "needs_phases") {
        return {
          success: true,
          status: "needs_phases",
          feature: {
            id: result.featureId,
            name: result.featureName,
            description: result.featureDescription || "",
            phase: result.currentPhase || "none",
            status: "pending",
          },
          neededPhases: result.neededPhases,
          projectPath: result.projectPath,
        };
      }

      if (result.status === "all_complete") {
        return {
          success: true,
          status: "all_complete",
          error: result.message,
        };
      }

      // Default: feature is ready for implementation
      return {
        success: true,
        status: "ready",
        feature: {
          id: result.featureId,
          name: result.featureName,
          description: result.description || "",
          phase: result.phase || "tasks",
          status: result.status || "pending",
        },
        projectPath: result.projectPath,
        prompt: result.prompt,
      };
    } catch {
      // If JSON parsing fails, return raw output as prompt
      return {
        success: true,
        status: "ready",
        prompt: stdout,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run SpecKit phases for a feature using Claude Code CLI
 */
export async function runSpecKitPhases(
  projectPath: string,
  featureId: string,
  phases: string[]
): Promise<RunPhasesResult> {
  const phaseCommands = phases
    .map((p) => `specflow ${p} ${featureId}`)
    .join(", then ");

  const prompt = `You are in the ${projectPath} directory. Run the following SpecKit phase commands in order for feature ${featureId}:

${phases.map((p) => `- specflow ${p} ${featureId}`).join("\n")}

For each phase:
1. Run the specflow command
2. If it requires input/interview, complete it based on the project context
3. Verify the output files are created in .specify/specs/

After completing all phases, run \`specflow status\` to confirm the feature is ready for implementation.`;

  try {
    // Spawn claude CLI with the prompt
    const proc = Bun.spawn(
      ["claude", "-p", prompt, "--dangerously-skip-permissions"],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: stdout,
        error: stderr || `Claude CLI exited with code ${exitCode}`,
      };
    }

    return {
      success: true,
      output: stdout,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run implementation for a feature using Claude Code CLI
 */
export async function runImplementation(
  projectPath: string,
  featureId: string,
  prompt: string
): Promise<RunPhasesResult> {
  const fullPrompt = `${prompt}

IMPORTANT: After implementing the feature, run \`specflow complete ${featureId}\` to mark it as done.`;

  try {
    const proc = Bun.spawn(
      ["claude", "-p", fullPrompt, "--dangerously-skip-permissions"],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: stdout,
        error: stderr || `Claude CLI exited with code ${exitCode}`,
      };
    }

    return {
      success: true,
      output: stdout,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Progress callback for automation loop
 */
export type AutomationProgressCallback = (event: AutomationEvent) => void;

export interface AutomationEvent {
  type: "start" | "phases" | "implement" | "complete" | "error" | "done";
  featureId?: string;
  featureName?: string;
  message: string;
  output?: string;
}

/**
 * Run full automation loop: phases → implement → next feature
 * Continues until all features are complete or an error occurs.
 */
export async function runAutomationLoop(
  projectPath: string,
  onProgress?: AutomationProgressCallback
): Promise<{ success: boolean; completedFeatures: string[]; error?: string }> {
  const completedFeatures: string[] = [];

  const emit = (event: AutomationEvent) => {
    if (onProgress) onProgress(event);
  };

  emit({ type: "start", message: "Starting automation loop..." });

  while (true) {
    // Get next feature status
    const nextResult = await getNextFeature(projectPath);

    if (!nextResult.success) {
      emit({ type: "error", message: nextResult.error || "Failed to get next feature" });
      return { success: false, completedFeatures, error: nextResult.error };
    }

    // All complete?
    if (nextResult.status === "all_complete") {
      emit({ type: "done", message: "All features complete!" });
      return { success: true, completedFeatures };
    }

    const feature = nextResult.feature!;

    // Needs phases?
    if (nextResult.status === "needs_phases" && nextResult.neededPhases) {
      emit({
        type: "phases",
        featureId: feature.id,
        featureName: feature.name,
        message: `Running SpecKit phases for ${feature.id}: ${nextResult.neededPhases.join(", ")}`,
      });

      const phasesResult = await runSpecKitPhases(
        projectPath,
        feature.id,
        nextResult.neededPhases
      );

      if (!phasesResult.success) {
        emit({
          type: "error",
          featureId: feature.id,
          message: `Phases failed for ${feature.id}: ${phasesResult.error}`,
          output: phasesResult.output,
        });
        return { success: false, completedFeatures, error: phasesResult.error };
      }

      emit({
        type: "phases",
        featureId: feature.id,
        featureName: feature.name,
        message: `Phases complete for ${feature.id}`,
        output: phasesResult.output,
      });

      // Continue loop to get implementation prompt
      continue;
    }

    // Ready for implementation
    if (nextResult.status === "ready" && nextResult.prompt) {
      emit({
        type: "implement",
        featureId: feature.id,
        featureName: feature.name,
        message: `Implementing ${feature.id}: ${feature.name}`,
      });

      const implResult = await runImplementation(
        projectPath,
        feature.id,
        nextResult.prompt
      );

      if (!implResult.success) {
        emit({
          type: "error",
          featureId: feature.id,
          message: `Implementation failed for ${feature.id}: ${implResult.error}`,
          output: implResult.output,
        });
        return { success: false, completedFeatures, error: implResult.error };
      }

      completedFeatures.push(feature.id);
      emit({
        type: "complete",
        featureId: feature.id,
        featureName: feature.name,
        message: `Completed ${feature.id}: ${feature.name}`,
        output: implResult.output,
      });

      // Continue to next feature
      continue;
    }

    // Unexpected state
    emit({ type: "error", message: "Unexpected state in automation loop" });
    return { success: false, completedFeatures, error: "Unexpected state" };
  }
}

/**
 * Run SpecKit phases with streaming output
 */
export async function runSpecKitPhasesStreaming(
  projectPath: string,
  featureId: string,
  phases: string[]
): Promise<RunPhasesResult> {
  // Check for active session
  if (hasActiveSession(projectPath)) {
    return { success: false, error: "Session already active for this project" };
  }

  const session = startSession(projectPath, featureId, "phases");

  const prompt = `You are in the ${projectPath} directory. Run the following SpecKit phase commands in order for feature ${featureId}:

${phases.map((p) => `- specflow ${p} ${featureId}`).join("\n")}

For each phase:
1. Run the specflow command
2. If it requires input/interview, complete it based on the project context
3. Verify the output files are created in .specify/specs/

After completing all phases, run \`specflow status\` to confirm the feature is ready for implementation.`;

  try {
    const proc = Bun.spawn(
      ["claude", "-p", prompt, "--dangerously-skip-permissions"],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
      }
    );

    setSessionProcess(projectPath, proc);

    // Stream stdout
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullOutput += chunk;
        broadcastChunk(projectPath, chunk);
      }
    } finally {
      reader.releaseLock();
    }

    // Also capture stderr
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const result: RunPhasesResult = {
      success: exitCode === 0,
      output: fullOutput,
      error: exitCode !== 0 ? stderr || `Claude CLI exited with code ${exitCode}` : undefined,
    };

    endSession(projectPath, { success: result.success, error: result.error });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    endSession(projectPath, { success: false, error });
    return { success: false, error };
  }
}

/**
 * Run implementation with streaming output
 */
export async function runImplementationStreaming(
  projectPath: string,
  featureId: string,
  prompt: string
): Promise<RunPhasesResult> {
  // Check for active session
  if (hasActiveSession(projectPath)) {
    return { success: false, error: "Session already active for this project" };
  }

  const session = startSession(projectPath, featureId, "implement");

  const fullPrompt = `${prompt}

IMPORTANT: After implementing the feature, run \`specflow complete ${featureId}\` to mark it as done.`;

  try {
    const proc = Bun.spawn(
      ["claude", "-p", fullPrompt, "--dangerously-skip-permissions"],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
      }
    );

    setSessionProcess(projectPath, proc);

    // Stream stdout
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullOutput += chunk;
        broadcastChunk(projectPath, chunk);
      }
    } finally {
      reader.releaseLock();
    }

    // Also capture stderr
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const result: RunPhasesResult = {
      success: exitCode === 0,
      output: fullOutput,
      error: exitCode !== 0 ? stderr || `Claude CLI exited with code ${exitCode}` : undefined,
    };

    endSession(projectPath, { success: result.success, error: result.error });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    endSession(projectPath, { success: false, error });
    return { success: false, error };
  }
}

/**
 * Run full automation loop with streaming output
 */
export async function runAutomationLoopStreaming(
  projectPath: string
): Promise<{ success: boolean; completedFeatures: string[]; error?: string }> {
  // Check for active session
  if (hasActiveSession(projectPath)) {
    return { success: false, completedFeatures: [], error: "Session already active for this project" };
  }

  const session = startSession(projectPath, "automation", "automation");
  const completedFeatures: string[] = [];

  broadcastChunk(projectPath, "Starting automation loop...\n\n");

  while (true) {
    // Get next feature status
    const nextResult = await getNextFeature(projectPath);

    if (!nextResult.success) {
      const error = nextResult.error || "Failed to get next feature";
      broadcastChunk(projectPath, `\nError: ${error}\n`);
      endSession(projectPath, { success: false, error });
      return { success: false, completedFeatures, error };
    }

    // All complete?
    if (nextResult.status === "all_complete") {
      broadcastChunk(projectPath, "\n\nAll features complete!\n");
      endSession(projectPath, { success: true });
      return { success: true, completedFeatures };
    }

    const feature = nextResult.feature!;

    // Needs phases?
    if (nextResult.status === "needs_phases" && nextResult.neededPhases) {
      broadcastChunk(
        projectPath,
        `\n=== Running SpecKit phases for ${feature.id}: ${nextResult.neededPhases.join(", ")} ===\n\n`
      );

      // Run phases inline (not as separate session)
      const phasesResult = await runPhasesInline(projectPath, feature.id, nextResult.neededPhases);

      if (!phasesResult.success) {
        const error = phasesResult.error || "Phases failed";
        broadcastChunk(projectPath, `\nError running phases: ${error}\n`);
        endSession(projectPath, { success: false, error });
        return { success: false, completedFeatures, error };
      }

      broadcastChunk(projectPath, `\nPhases complete for ${feature.id}\n`);
      continue;
    }

    // Ready for implementation
    if (nextResult.status === "ready" && nextResult.prompt) {
      broadcastChunk(
        projectPath,
        `\n=== Implementing ${feature.id}: ${feature.name} ===\n\n`
      );

      // Run implementation inline (not as separate session)
      const implResult = await runImplementationInline(
        projectPath,
        feature.id,
        nextResult.prompt
      );

      if (!implResult.success) {
        const error = implResult.error || "Implementation failed";
        broadcastChunk(projectPath, `\nError: ${error}\n`);
        endSession(projectPath, { success: false, error });
        return { success: false, completedFeatures, error };
      }

      completedFeatures.push(feature.id);
      broadcastChunk(projectPath, `\nCompleted ${feature.id}: ${feature.name}\n`);
      continue;
    }

    // Unexpected state
    const error = "Unexpected state in automation loop";
    broadcastChunk(projectPath, `\nError: ${error}\n`);
    endSession(projectPath, { success: false, error });
    return { success: false, completedFeatures, error };
  }
}

/**
 * Run phases inline (for automation loop, streams to existing session)
 */
async function runPhasesInline(
  projectPath: string,
  featureId: string,
  phases: string[]
): Promise<RunPhasesResult> {
  const prompt = `You are in the ${projectPath} directory. Run the following SpecKit phase commands in order for feature ${featureId}:

${phases.map((p) => `- specflow ${p} ${featureId}`).join("\n")}

For each phase:
1. Run the specflow command
2. If it requires input/interview, complete it based on the project context
3. Verify the output files are created in .specify/specs/

After completing all phases, run \`specflow status\` to confirm the feature is ready for implementation.`;

  try {
    const proc = Bun.spawn(
      ["claude", "-p", prompt, "--dangerously-skip-permissions"],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
      }
    );

    // Stream stdout to existing session
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullOutput += chunk;
        broadcastChunk(projectPath, chunk);
      }
    } finally {
      reader.releaseLock();
    }

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: fullOutput,
      error: exitCode !== 0 ? stderr || `Claude CLI exited with code ${exitCode}` : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run implementation inline (for automation loop, streams to existing session)
 */
async function runImplementationInline(
  projectPath: string,
  featureId: string,
  prompt: string
): Promise<RunPhasesResult> {
  const fullPrompt = `${prompt}

IMPORTANT: After implementing the feature, run \`specflow complete ${featureId}\` to mark it as done.`;

  try {
    const proc = Bun.spawn(
      ["claude", "-p", fullPrompt, "--dangerously-skip-permissions"],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
      }
    );

    // Stream stdout to existing session
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullOutput += chunk;
        broadcastChunk(projectPath, chunk);
      }
    } finally {
      reader.releaseLock();
    }

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: fullOutput,
      error: exitCode !== 0 ? stderr || `Claude CLI exited with code ${exitCode}` : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
