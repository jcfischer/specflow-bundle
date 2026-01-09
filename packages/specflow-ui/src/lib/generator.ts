/**
 * F-11: Project Generator
 * Generates app-context.md, features.json, and initializes the project.
 */

import * as fs from "fs";
import * as path from "path";
import { INTERVIEW_PHASES, getPhase } from "./interview-questions";

export interface GenerationResult {
  success: boolean;
  projectPath?: string;
  error?: string;
}

/**
 * Get the base work directory for projects
 */
function getWorkDir(): string {
  return path.join(process.env.HOME || "", "work");
}

/**
 * Generate app-context.md content from interview answers
 */
function generateAppContextContent(
  name: string,
  description: string,
  answers: Record<string, string>
): string {
  const sections: string[] = [`# App Context: ${name}\n`, `${description}\n`];

  // Phase 1: Problem Space -> Problem Statement
  const phase1 = getPhase(1);
  if (phase1) {
    sections.push("## Problem Statement\n");
    for (const q of phase1.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 2: Users & Stakeholders
  const phase2 = getPhase(2);
  if (phase2) {
    sections.push("## Users & Stakeholders\n");
    for (const q of phase2.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 3: Existing Context -> Current State
  const phase3 = getPhase(3);
  if (phase3) {
    sections.push("## Current State\n");
    for (const q of phase3.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 4: Constraints & Tradeoffs -> Constraints & Requirements
  const phase4 = getPhase(4);
  if (phase4) {
    sections.push("## Constraints & Requirements\n");
    for (const q of phase4.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 5: User Experience
  const phase5 = getPhase(5);
  if (phase5) {
    sections.push("## User Experience\n");
    for (const q of phase5.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 6: Edge Cases & Failure Modes -> Edge Cases & Error Handling
  const phase6 = getPhase(6);
  if (phase6) {
    sections.push("## Edge Cases & Error Handling\n");
    for (const q of phase6.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 7: Success Criteria
  const phase7 = getPhase(7);
  if (phase7) {
    sections.push("## Success Criteria\n");
    for (const q of phase7.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  // Phase 8: Future & Scope -> Scope
  const phase8 = getPhase(8);
  if (phase8) {
    sections.push("## Scope\n");
    for (const q of phase8.questions) {
      const answer = answers[q.id];
      if (answer && answer.trim()) {
        sections.push(`**${q.text}**\n${answer.trim()}\n`);
      }
    }
  }

  return sections.join("\n");
}

/**
 * Generate basic features.json content
 */
function generateFeaturesContent(name: string, description: string): object[] {
  return [
    {
      id: "F-1",
      name: "Core Foundation",
      description: "Basic project setup and structure",
      dependencies: [],
      priority: 1,
    },
    {
      id: "F-2",
      name: "Main Feature",
      description: `Primary functionality for ${name}`,
      dependencies: ["F-1"],
      priority: 2,
    },
    {
      id: "F-3",
      name: "User Interface",
      description: "UI components and user interaction",
      dependencies: ["F-1"],
      priority: 3,
    },
  ];
}

/**
 * Run specflow init command
 */
async function runSpecflowInit(
  projectPath: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const featuresPath = path.join(projectPath, ".specify", "features.json");

  try {
    const proc = Bun.spawn(
      ["specflow", "init", "--from-features", featuresPath],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: stdout,
        error: stderr || `Exit code: ${exitCode}`,
      };
    }

    return { success: true, output: stdout };
  } catch (err) {
    return {
      success: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate a new project from interview answers
 */
export async function generateProject(
  name: string,
  description: string,
  answers: Record<string, string>
): Promise<GenerationResult> {
  const workDir = getWorkDir();
  const projectPath = path.join(workDir, name);
  const specifyPath = path.join(projectPath, ".specify");

  try {
    // Step 1: Create project directory
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    if (fs.existsSync(projectPath)) {
      return {
        success: false,
        error: `Project directory already exists: ${projectPath}`,
      };
    }

    fs.mkdirSync(projectPath, { recursive: true });

    // Step 2: Create .specify subdirectory
    fs.mkdirSync(specifyPath, { recursive: true });

    // Step 3: Generate app-context.md
    const appContextContent = generateAppContextContent(
      name,
      description,
      answers
    );
    const appContextPath = path.join(specifyPath, "app-context.md");
    fs.writeFileSync(appContextPath, appContextContent, "utf-8");

    // Step 4: Generate features.json
    const featuresContent = generateFeaturesContent(name, description);
    const featuresPath = path.join(specifyPath, "features.json");
    fs.writeFileSync(
      featuresPath,
      JSON.stringify(featuresContent, null, 2),
      "utf-8"
    );

    // Step 5: Run specflow init
    const initResult = await runSpecflowInit(projectPath);
    if (!initResult.success) {
      // Even if specflow init fails, the project files were created
      // Return success but note the init failure
      return {
        success: true,
        projectPath,
        error: `Project created but specflow init failed: ${initResult.error}`,
      };
    }

    // Step 6: Return success
    return {
      success: true,
      projectPath,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
