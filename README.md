# SpecFlow Bundle

**Spec-Driven Development for AI Infrastructure**

> **FOR AI AGENTS:** You are installing the SpecFlow Bundle into a PAI installation.
> Run the install wizard OR follow the manual installation steps below.
> Each package must be FULLY installed with ALL files. No shortcuts.

---

## Quick Start

```bash
# Clone with submodules
git clone --recursive https://github.com/jcfischer/specflow-bundle.git
cd specflow-bundle

# Run the installer
bun run install.ts

# Or update an existing installation
bun run install.ts --update
```

---

## What's Included

| # | Package | Purpose | Dependencies |
|---|---------|---------|--------------|
| 1 | **SpecKit** | Spec-driven workflow skill | None |
| 2 | **SpecFlow** | CLI orchestration | SpecKit |
| 3 | **specflow-ui** | Progress dashboard | SpecFlow |
| 4 | **pai-deps** | Dependency tracking | None |

---

## CRITICAL: Full Implementation Required

> **FOR AI AGENTS:** This section is mandatory. Do not skip or simplify.

### The Problem

AI agents systematically create "simplified" versions of installations, omitting files, shortening code, and creating broken setups. This is unacceptable.

### The Rules

1. **EVERY PACKAGE = FULL INSTALLATION** - All files must be copied
2. **EVERY FILE SPECIFIED = EVERY FILE CREATED** - No omissions
3. **EVERY DEPENDENCY = INSTALLED** - Run `bun install` for each package
4. **IF YOU CAN'T DO IT FULLY, STOP AND SAY SO** - Permission to refuse

---

## Manual Installation (For AI Agents)

If not using the install wizard, follow these steps exactly:

### Prerequisites

- [ ] Bun runtime installed (`curl -fsSL https://bun.sh/install | bash`)
- [ ] Claude Code installed (`~/.claude/` directory exists)
- [ ] Git with submodule support

### Step 1: Clone Repository

```bash
git clone --recursive https://github.com/jcfischer/specflow-bundle.git
cd specflow-bundle
```

**Verify:**
- [ ] `packages/speckit/` exists with files
- [ ] `packages/specflow/` exists with files
- [ ] `packages/specflow-ui/` exists with files
- [ ] `packages/pai-deps/` exists with files (submodule)

### Step 2: Install SpecKit Skill

```bash
cp -r packages/speckit ~/.claude/skills/SpecKit
cd ~/.claude/skills/SpecKit && bun install
```

**Verify SpecKit installation:**
- [ ] `~/.claude/skills/SpecKit/SKILL.md` exists
- [ ] `~/.claude/skills/SpecKit/src/index.ts` exists
- [ ] `~/.claude/skills/SpecKit/src/registry.ts` exists
- [ ] `~/.claude/skills/SpecKit/src/types.ts` exists
- [ ] `~/.claude/skills/SpecKit/templates/` directory with 5 files
- [ ] `~/.claude/skills/SpecKit/node_modules/` exists (after bun install)

### Step 3: Install SpecFlow Skill

```bash
cp -r packages/specflow ~/.claude/skills/SpecFlow
cd ~/.claude/skills/SpecFlow && bun install
```

**Verify SpecFlow installation:**
- [ ] `~/.claude/skills/SpecFlow/SKILL.md` exists
- [ ] `~/.claude/skills/SpecFlow/src/index.ts` exists
- [ ] `~/.claude/skills/SpecFlow/src/commands/` directory with 15+ files
- [ ] `~/.claude/skills/SpecFlow/src/lib/` directory with 6 files
- [ ] `~/.claude/skills/SpecFlow/prompts/` directory with 2 files
- [ ] `~/.claude/skills/SpecFlow/node_modules/` exists (after bun install)

### Step 4: Install specflow-ui

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

### Step 5: Install pai-deps

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

### Step 6: Verify PATH

Ensure `~/.local/bin` is in your PATH:

```bash
echo $PATH | grep -q "$HOME/.local/bin" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

---

## Full Bundle Installation Checklist

After completing all steps, verify:

- [ ] **SpecKit** - FULLY installed in `~/.claude/skills/SpecKit/`
  - [ ] All 3 source files in `src/`
  - [ ] All 5 template files in `templates/`
  - [ ] SKILL.md present
  - [ ] Dependencies installed

- [ ] **SpecFlow** - FULLY installed in `~/.claude/skills/SpecFlow/`
  - [ ] All 15+ command files in `src/commands/`
  - [ ] All 6 lib files in `src/lib/`
  - [ ] All 2 prompt files in `prompts/`
  - [ ] SKILL.md present
  - [ ] Dependencies installed

- [ ] **specflow-ui** - FULLY installed in `~/.config/specflow/ui/`
  - [ ] All 9 page files in `src/pages/`
  - [ ] All 8 lib files in `src/lib/`
  - [ ] Launcher at `~/.local/bin/specflow-ui`
  - [ ] Dependencies installed

- [ ] **pai-deps** - FULLY installed in `~/.config/specflow/pai-deps/`
  - [ ] Source files in `src/`
  - [ ] Launcher at `~/.local/bin/pai-deps`
  - [ ] Dependencies installed

- [ ] **PATH configured** - `~/.local/bin` in PATH

---

## Usage After Installation

### In Claude Code

```
/speckit.specify   # Start a new feature specification
/speckit.plan      # Create implementation plan
/speckit.tasks     # Generate task breakdown
/speckit.implement # Execute with TDD enforcement
```

### SpecFlow CLI

```bash
specflow init my-project     # Initialize a new project
specflow add "New feature"   # Add a feature
specflow status              # Check progress
specflow run F-1             # Run a feature through phases
specflow ui                  # Launch dashboard
```

### pai-deps CLI

```bash
pai-deps health              # Show ecosystem health
pai-deps verify              # Verify all contracts
pai-deps blast-radius <tool> # Impact analysis
pai-deps deps <tool>         # Show dependencies
```

### specflow-ui Dashboard

```bash
specflow-ui --port 3000      # Launch on port 3000
# Open http://localhost:3000
```

---

## The Four-Phase Workflow

```
SPECIFY → PLAN → TASKS → IMPLEMENT
```

| Phase | What | Output |
|-------|------|--------|
| **SPECIFY** | Define requirements, success criteria | `spec.md` |
| **PLAN** | Design architecture, data models | `plan.md` |
| **TASKS** | Break into reviewable units | `tasks.md` |
| **IMPLEMENT** | Build with TDD (RED→GREEN→BLUE) | Working code |

Each phase is **gated** - you cannot advance until the current phase is validated.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    specflow-ui                          │
│              (Progress Dashboard)                       │
│         http://localhost:3000                           │
└─────────────────────┬───────────────────────────────────┘
                      │ reads
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    SpecFlow                             │
│              (CLI Orchestration)                        │
│    specflow init | status | run | complete              │
└─────────────────────┬───────────────────────────────────┘
                      │ manages
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    SpecKit                              │
│           (Spec-Driven Workflow)                        │
│   /speckit.specify → plan → tasks → implement           │
└─────────────────────┬───────────────────────────────────┘
                      │ validates against
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    pai-deps                             │
│           (Dependency Registry)                         │
│   pai-deps verify | blast-radius | health               │
└─────────────────────────────────────────────────────────┘
```

---

## Support Development

This bundle is **free and open source** under the MIT license.

If SpecFlow Bundle helps you build better AI infrastructure, consider supporting continued development:

- [Support on InVisible Store](https://invisible.ch/support.html)
- [GitHub Sponsors](https://github.com/sponsors/jcfischer)

---

## Links

- [InVisible GmbH](https://invisible.ch) - Company behind SpecFlow Bundle
- [Product Page](https://invisible.ch/specflow/) - Full documentation
- [Supertag CLI](https://invisible.ch/supertag/) - Our Tana CLI tool
- [pai-deps](https://github.com/jcfischer/pai-deps) - Dependency management

---

## License

MIT License - Use it, modify it, build on it.

---

Built with 35+ years of experience in complex IT environments.
