#!/usr/bin/env bun
/**
 * SpecFlow Bundle Installer
 *
 * Installs SpecFlow, specflow-ui, and pai-deps into a PAI installation.
 * Note: SpecKit has been unified into SpecFlow as of January 2026.
 *
 * Usage:
 *   bun run install.ts           # Fresh install
 *   bun run install.ts --update  # Update existing installation
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import * as readline from "readline";

// =============================================================================
// CONFIGURATION
// =============================================================================

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const SKILLS_DIR = join(CLAUDE_DIR, "skills");
const SPECFLOW_CONFIG_DIR = join(HOME, ".config", "specflow");
const BUNDLE_DIR = import.meta.dir;
const PACKAGES_DIR = join(BUNDLE_DIR, "packages");

const UPDATE_MODE = process.argv.includes("--update");

// =============================================================================
// UTILITIES
// =============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${hint}: `);
  if (answer === "") return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

function printHeader(text: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${text}`);
  console.log("=".repeat(60) + "\n");
}

function printStep(step: number, total: number, text: string) {
  console.log(`\n[${step}/${total}] ${text}`);
  console.log("-".repeat(40));
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`  Created: ${dir}`);
  } else {
    console.log(`  Exists: ${dir}`);
  }
}

function copyDir(src: string, dest: string, name: string) {
  if (existsSync(dest) && !UPDATE_MODE) {
    console.log(`  Skipping ${name} (already exists, use --update to overwrite)`);
    return false;
  }
  cpSync(src, dest, { recursive: true });
  console.log(`  Installed: ${name} → ${dest}`);
  return true;
}

// =============================================================================
// DETECTION
// =============================================================================

interface DetectedConfig {
  hasPAI: boolean;
  hasClaudeDir: boolean;
  hasSkillsDir: boolean;
  existingSpecKit: boolean;
  existingSpecFlow: boolean;
  existingPaiDeps: boolean;
}

function detectExisting(): DetectedConfig {
  return {
    hasPAI: existsSync(join(CLAUDE_DIR, "skills", "CORE")),
    hasClaudeDir: existsSync(CLAUDE_DIR),
    hasSkillsDir: existsSync(SKILLS_DIR),
    existingSpecKit: existsSync(join(SKILLS_DIR, "SpecKit")),
    existingSpecFlow: existsSync(join(SKILLS_DIR, "SpecFlow")),
    existingPaiDeps: existsSync(join(HOME, ".local", "bin", "pai-deps")),
  };
}

// =============================================================================
// INSTALLATION STEPS
// =============================================================================

async function installSkills() {
  printStep(1, 4, "Installing Claude Code Skills");

  ensureDir(SKILLS_DIR);

  // Install SpecFlow (unified with SpecKit as of January 2026)
  const specFlowSrc = join(PACKAGES_DIR, "specflow");
  const specFlowDest = join(SKILLS_DIR, "SpecFlow");
  copyDir(specFlowSrc, specFlowDest, "SpecFlow");

  // Install dependencies
  console.log("\n  Installing SpecFlow dependencies...");
  const specFlowInstall = Bun.spawn(["bun", "install"], {
    cwd: specFlowDest,
    stdout: "inherit",
    stderr: "inherit",
  });
  await specFlowInstall.exited;

  // Check for legacy SpecKit and offer to remove it
  const legacySpecKit = join(SKILLS_DIR, "SpecKit");
  if (existsSync(legacySpecKit)) {
    console.log("\n  Note: Legacy SpecKit installation found.");
    console.log("  SpecKit has been unified into SpecFlow.");
    console.log("  You can safely remove ~/.claude/skills/SpecKit");
  }
}

async function installSpecFlowUI() {
  printStep(2, 4, "Installing specflow-ui Dashboard");

  const uiSrc = join(PACKAGES_DIR, "specflow-ui");
  const uiDest = join(SPECFLOW_CONFIG_DIR, "ui");

  ensureDir(SPECFLOW_CONFIG_DIR);
  copyDir(uiSrc, uiDest, "specflow-ui");

  console.log("\n  Installing specflow-ui dependencies...");
  const uiInstall = Bun.spawn(["bun", "install"], {
    cwd: uiDest,
    stdout: "inherit",
    stderr: "inherit",
  });
  await uiInstall.exited;

  // Create launcher script
  const launcherPath = join(HOME, ".local", "bin", "specflow-ui");
  ensureDir(join(HOME, ".local", "bin"));

  const launcherScript = `#!/bin/bash
# SpecFlow UI Launcher
cd "${uiDest}"
exec bun run src/server.ts "$@"
`;
  writeFileSync(launcherPath, launcherScript, { mode: 0o755 });
  console.log(`  Created launcher: ${launcherPath}`);
}

async function installPaiDeps() {
  printStep(3, 4, "Installing pai-deps");

  const paiDepsSrc = join(PACKAGES_DIR, "pai-deps");
  const paiDepsDest = join(SPECFLOW_CONFIG_DIR, "pai-deps");

  copyDir(paiDepsSrc, paiDepsDest, "pai-deps");

  console.log("\n  Installing pai-deps dependencies...");
  const depsInstall = Bun.spawn(["bun", "install"], {
    cwd: paiDepsDest,
    stdout: "inherit",
    stderr: "inherit",
  });
  await depsInstall.exited;

  // Create launcher script
  const launcherPath = join(HOME, ".local", "bin", "pai-deps");
  ensureDir(join(HOME, ".local", "bin"));

  const launcherScript = `#!/bin/bash
# pai-deps Launcher
cd "${paiDepsDest}"
exec bun run src/index.ts "$@"
`;
  writeFileSync(launcherPath, launcherScript, { mode: 0o755 });
  console.log(`  Created launcher: ${launcherPath}`);
}

async function verifyInstallation() {
  printStep(4, 4, "Verifying Installation");

  const checks = [
    { name: "SpecFlow skill", path: join(SKILLS_DIR, "SpecFlow", "SKILL.md") },
    { name: "SpecFlow commands", path: join(SKILLS_DIR, "SpecFlow", "src", "commands") },
    { name: "SpecFlow templates", path: join(SKILLS_DIR, "SpecFlow", "templates") },
    { name: "SpecFlow evals", path: join(SKILLS_DIR, "SpecFlow", "evals") },
    { name: "specflow-ui", path: join(SPECFLOW_CONFIG_DIR, "ui", "src", "server.ts") },
    { name: "pai-deps", path: join(SPECFLOW_CONFIG_DIR, "pai-deps", "src", "index.ts") },
    { name: "specflow-ui launcher", path: join(HOME, ".local", "bin", "specflow-ui") },
    { name: "pai-deps launcher", path: join(HOME, ".local", "bin", "pai-deps") },
  ];

  let allPassed = true;
  for (const check of checks) {
    const exists = existsSync(check.path);
    const status = exists ? "✓" : "✗";
    console.log(`  ${status} ${check.name}`);
    if (!exists) allPassed = false;
  }

  return allPassed;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  printHeader("SpecFlow Bundle Installer");

  console.log("This installer will set up:");
  console.log("  • SpecFlow     - Unified spec-driven development (includes SpecKit)");
  console.log("  • specflow-ui  - Progress dashboard");
  console.log("  • pai-deps     - Dependency tracking");

  const detected = detectExisting();

  console.log("\nDetected environment:");
  console.log(`  PAI Installation: ${detected.hasPAI ? "Yes" : "No"}`);
  console.log(`  Claude Code: ${detected.hasClaudeDir ? "Yes" : "No"}`);
  console.log(`  Existing SpecFlow: ${detected.existingSpecFlow ? "Yes" : "No"}`);
  if (detected.existingSpecKit) {
    console.log(`  Legacy SpecKit: Yes (will be superseded)`);
  }

  if (!detected.hasClaudeDir) {
    console.log("\n⚠️  Claude Code directory not found at ~/.claude");
    console.log("   Please install Claude Code first: https://claude.ai/claude-code");
    rl.close();
    process.exit(1);
  }

  if (detected.existingSpecFlow) {
    if (!UPDATE_MODE) {
      console.log("\n⚠️  Existing SpecFlow installation detected.");
      console.log("   Run with --update to overwrite existing files.");
      const proceed = await askYesNo("Continue anyway?", false);
      if (!proceed) {
        rl.close();
        process.exit(0);
      }
    }
  }

  const proceed = await askYesNo("\nProceed with installation?", true);
  if (!proceed) {
    console.log("Installation cancelled.");
    rl.close();
    process.exit(0);
  }

  // Run installation steps
  await installSkills();
  await installSpecFlowUI();
  await installPaiDeps();
  const verified = await verifyInstallation();

  // Summary
  printHeader("Installation Complete");

  if (verified) {
    console.log("✓ All components installed successfully!\n");
  } else {
    console.log("⚠️  Some components may not have installed correctly.\n");
  }

  console.log("Next steps:");
  console.log("");
  console.log("1. Ensure ~/.local/bin is in your PATH:");
  console.log('   export PATH="$HOME/.local/bin:$PATH"');
  console.log("");
  console.log("2. Use SpecFlow CLI (unified commands):");
  console.log("   specflow init <project>  - Initialize a project");
  console.log("   specflow add <feature>   - Add a feature");
  console.log("   specflow specify F-N     - Create specification");
  console.log("   specflow plan F-N        - Create implementation plan");
  console.log("   specflow tasks F-N       - Generate task breakdown");
  console.log("   specflow implement F-N   - Execute with TDD");
  console.log("   specflow complete F-N    - Mark feature complete");
  console.log("   specflow eval run        - Run quality evaluations");
  console.log("   specflow status          - Check feature progress");
  console.log("   specflow ui              - Launch dashboard");
  console.log("");
  console.log("3. Use pai-deps for dependency tracking:");
  console.log("   pai-deps health          - Show ecosystem health");
  console.log("   pai-deps verify          - Verify contracts");
  console.log("");
  console.log("Documentation: https://github.com/jcfischer/specflow-bundle");
  console.log("Support: https://invisible.ch/support.html");

  rl.close();
}

main().catch((err) => {
  console.error("Installation failed:", err);
  rl.close();
  process.exit(1);
});
