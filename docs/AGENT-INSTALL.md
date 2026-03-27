# SpecFlow Bundle — Agent Installation Guide

> **FOR AI AGENTS:** This file is for you. Follow every step exactly.
> Each package must be FULLY installed with ALL files. No shortcuts.

---

## CRITICAL: Full Implementation Required

### The Problem

AI agents systematically create "simplified" versions of installations, omitting files, shortening code, and creating broken setups. This is unacceptable.

### The Rules

1. **EVERY PACKAGE = FULL INSTALLATION** — All files must be copied
2. **EVERY FILE SPECIFIED = EVERY FILE CREATED** — No omissions
3. **EVERY DEPENDENCY = INSTALLED** — Run `bun install` for each package
4. **IF YOU CAN'T DO IT FULLY, STOP AND SAY SO** — Permission to refuse

---

## Prerequisites

- [ ] Bun runtime installed (`curl -fsSL https://bun.sh/install | bash`)
- [ ] Claude Code installed (`~/.claude/` directory exists)
- [ ] Git with submodule support

---

## Step 1: Clone Repository

```bash
git clone --recursive https://github.com/jcfischer/specflow-bundle.git
cd specflow-bundle
```

**Verify:**
- [ ] `packages/specflow/` exists with files
- [ ] `packages/specflow-ui/` exists with files
- [ ] `packages/pai-deps/` exists with files (submodule)

---

## Step 2: Run the Installer

```bash
bun run install.ts

# Or update an existing installation
bun run install.ts --update
```

The installer handles all packages automatically. If it fails or you need manual control, follow the steps below.

---

## Manual Installation

### Step 2a: Install SpecFlow Skill

```bash
cp -r packages/specflow ~/.claude/skills/SpecFlow
cd ~/.claude/skills/SpecFlow && bun install
```

**Verify SpecFlow installation:**
- [ ] `~/.claude/skills/SpecFlow/SKILL.md` exists
- [ ] `~/.claude/skills/SpecFlow/src/index.ts` exists
- [ ] `~/.claude/skills/SpecFlow/src/commands/` directory with 31 files
- [ ] `~/.claude/skills/SpecFlow/src/lib/` directory with lib files + eval/
- [ ] `~/.claude/skills/SpecFlow/templates/` directory with 6 files
- [ ] `~/.claude/skills/SpecFlow/evals/` directory with rubrics
- [ ] `~/.claude/skills/SpecFlow/workflows/` directory
- [ ] `~/.claude/skills/SpecFlow/node_modules/` exists (after bun install)

### Step 2b: Install specflow-ui

```bash
mkdir -p ~/.config/specflow
cp -r packages/specflow-ui ~/.config/specflow/ui
cd ~/.config/specflow/ui && bun install
```

**Create launcher script:**
```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/specflow-ui << 'EOF'
#!/bin/bash
cd ~/.config/specflow/ui
exec bun run src/server.ts "$@"
EOF
chmod +x ~/.local/bin/specflow-ui
```

**Verify specflow-ui installation:**
- [ ] `~/.config/specflow/ui/src/server.ts` exists
- [ ] `~/.config/specflow/ui/src/pages/` directory with 9 files
- [ ] `~/.config/specflow/ui/src/lib/` directory with 8 files
- [ ] `~/.config/specflow/ui/node_modules/` exists (after bun install)
- [ ] `~/.local/bin/specflow-ui` exists and is executable

### Step 2c: Install pai-deps

```bash
cp -r packages/pai-deps ~/.config/specflow/pai-deps
cd ~/.config/specflow/pai-deps && bun install
```

**Create launcher script:**
```bash
cat > ~/.local/bin/pai-deps << 'EOF'
#!/bin/bash
cd ~/.config/specflow/pai-deps
exec bun run src/index.ts "$@"
EOF
chmod +x ~/.local/bin/pai-deps
```

**Verify pai-deps installation:**
- [ ] `~/.config/specflow/pai-deps/src/index.ts` exists
- [ ] `~/.config/specflow/pai-deps/node_modules/` exists (after bun install)
- [ ] `~/.local/bin/pai-deps` exists and is executable

### Step 2d: Verify PATH

```bash
echo $PATH | grep -q "$HOME/.local/bin" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

---

## Full Bundle Installation Checklist

After completing all steps, verify:

- [ ] **SpecFlow** — FULLY installed in `~/.claude/skills/SpecFlow/`
  - [ ] All 31 command files in `src/commands/`
  - [ ] All lib files in `src/lib/` including `eval/` subdirectory
  - [ ] All 6 template files in `templates/`
  - [ ] `evals/` directory with rubrics
  - [ ] `workflows/` directory
  - [ ] SKILL.md present
  - [ ] Dependencies installed

- [ ] **specflow-ui** — FULLY installed in `~/.config/specflow/ui/`
  - [ ] All 9 page files in `src/pages/`
  - [ ] All 8 lib files in `src/lib/`
  - [ ] Launcher at `~/.local/bin/specflow-ui`
  - [ ] Dependencies installed

- [ ] **pai-deps** — FULLY installed in `~/.config/specflow/pai-deps/`
  - [ ] Source files in `src/`
  - [ ] Launcher at `~/.local/bin/pai-deps`
  - [ ] Dependencies installed

- [ ] **PATH configured** — `~/.local/bin` in PATH
