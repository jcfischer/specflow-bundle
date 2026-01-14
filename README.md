# SpecFlow Bundle

**Spec-Driven Development for AI Infrastructure**

---

## Why SpecFlow?

### The Promise vs The Reality

AI coding assistants promise "10x developer productivity" — just describe what you want and watch the code appear. The reality? A frustrating cycle:

![Promise vs Reality](docs/problem-promise-vs-reality.png)

**Copy → Paste → Fix → Repeat.** Hallucinated APIs. Lost context. Code that works once and breaks mysteriously. Every session starts from zero.

### The Insight

> **The AI is the same. The architecture around it isn't.**

The breakthrough isn't a better model — it's better scaffolding. When you give AI agents structure, constraints, and verification gates, they stop hallucinating and start engineering.

### Code is a Liability

[Cory Doctorow articulated](https://pluralistic.net/2026/01/06/1000x-liability/) what experienced developers know: **code is a liability, not an asset**. Every line requires maintenance. Every feature adds complexity. Probabilities are multiplicative — chain enough unreliable components and your system *will* fail.

SpecFlow embraces this truth. Instead of letting AI generate code freely, we force it through engineering discipline:

![SpecFlow Quality Gates](docs/specflow-quality-gates.png)

### The Four-Phase Workflow

```
SPECIFY → PLAN → TASKS → IMPLEMENT
```

| Phase | What Happens | Gate |
|-------|--------------|------|
| **SPECIFY** | Interview-driven requirements. What are we building? Why? | Human approves spec |
| **PLAN** | Architecture decisions, data models, failure modes | Human approves design |
| **TASKS** | Break work into reviewable units with dependencies | Human approves breakdown |
| **IMPLEMENT** | TDD execution with verification | Tests pass, contracts verified |

**Each gate requires human approval.** The AI cannot skip ahead. No code gets written until the spec, plan, and tasks are complete.

### The Result

- **No hallucinated features** — everything traces back to approved specs
- **No forgotten context** — SQLite database tracks all features and progress
- **No mysterious breakage** — dependency tracking catches cascading failures
- **Resumable anytime** — interrupt and pick up exactly where you left off

> *The AI does the work. You provide direction and corrections.*

---

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

| # | Package | Purpose |
|---|---------|---------|
| 1 | **SpecFlow** | Unified spec-driven workflow + CLI |
| 2 | **specflow-ui** | Progress dashboard |
| 3 | **pai-deps** | Dependency tracking |

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
- [ ] `packages/specflow/` exists with files
- [ ] `packages/specflow-ui/` exists with files
- [ ] `packages/pai-deps/` exists with files (submodule)

### Step 2: Install SpecFlow Skill

```bash
cp -r packages/specflow ~/.claude/skills/SpecFlow
cd ~/.claude/skills/SpecFlow && bun install
```

**Verify SpecFlow installation:**
- [ ] `~/.claude/skills/SpecFlow/SKILL.md` exists
- [ ] `~/.claude/skills/SpecFlow/src/index.ts` exists
- [ ] `~/.claude/skills/SpecFlow/src/commands/` directory with 19 files
- [ ] `~/.claude/skills/SpecFlow/src/lib/` directory with lib files + eval/
- [ ] `~/.claude/skills/SpecFlow/templates/` directory with 6 files
- [ ] `~/.claude/skills/SpecFlow/evals/` directory with rubrics
- [ ] `~/.claude/skills/SpecFlow/workflows/` directory
- [ ] `~/.claude/skills/SpecFlow/node_modules/` exists (after bun install)

### Step 3: Install specflow-ui

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

### Step 4: Install pai-deps

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

### Step 5: Verify PATH

Ensure `~/.local/bin` is in your PATH:

```bash
echo $PATH | grep -q "$HOME/.local/bin" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

---

## Full Bundle Installation Checklist

After completing all steps, verify:

- [ ] **SpecFlow** - FULLY installed in `~/.claude/skills/SpecFlow/`
  - [ ] All 19 command files in `src/commands/`
  - [ ] All lib files in `src/lib/` including `eval/` subdirectory
  - [ ] All 6 template files in `templates/`
  - [ ] `evals/` directory with rubrics
  - [ ] `workflows/` directory
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

### SpecFlow CLI (Unified Commands)

```bash
specflow init my-project     # Initialize a new project
specflow add "New feature"   # Add a feature
specflow status              # Check progress
specflow specify F-1         # Create specification
specflow plan F-1            # Create implementation plan
specflow tasks F-1           # Generate task breakdown
specflow implement F-1       # Execute with TDD enforcement
specflow complete F-1        # Mark feature complete
specflow eval run            # Run quality evaluations
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
SPECIFY -> PLAN -> TASKS -> IMPLEMENT
```

| Phase | What | Output |
|-------|------|--------|
| **SPECIFY** | Define requirements, success criteria | `spec.md` |
| **PLAN** | Design architecture, data models | `plan.md` |
| **TASKS** | Break into reviewable units | `tasks.md` |
| **IMPLEMENT** | Build with TDD (RED->GREEN->BLUE) | Working code |

Each phase is **gated** - you cannot advance until the current phase is validated.

### Quality Gates

SpecFlow includes built-in quality evaluations:

- **Spec Quality** - Validates specification completeness
- **Plan Quality** - Validates technical design
- Quality threshold: >= 80% to proceed

---

## Architecture

```
+-------------------------------------------------------------+
|                    specflow-ui                               |
|              (Progress Dashboard)                            |
|         http://localhost:3000                                |
+----------------------------+---------------------------------+
                             | reads
                             v
+-------------------------------------------------------------+
|                    SpecFlow                                  |
|         (Unified CLI + Spec-Driven Workflow)                 |
|   specflow specify -> plan -> tasks -> implement             |
+----------------------------+---------------------------------+
                             | validates against
                             v
+-------------------------------------------------------------+
|                    pai-deps                                  |
|           (Dependency Registry)                              |
|   pai-deps verify | blast-radius | health                    |
+-------------------------------------------------------------+
```

---

## Migration from Separate SpecKit

If you previously had SpecKit installed separately:

1. Remove the old SpecKit skill: `rm -rf ~/.claude/skills/SpecKit`
2. Install the updated SpecFlow (this bundle)
3. Update any references from `/speckit.*` commands to `specflow` CLI

| Old Command | New Command |
|-------------|-------------|
| `/speckit.specify` | `specflow specify F-N` |
| `/speckit.plan` | `specflow plan F-N` |
| `/speckit.tasks` | `specflow tasks F-N` |
| `/speckit.implement` | `specflow implement F-N` |

---

## Support Development

This bundle is **free and open source** under the MIT license.

If SpecFlow Bundle helps you build better AI infrastructure, consider supporting continued development:

- [Support on InVisible Store](https://projects.invisible.ch/support.html)
- [GitHub Sponsors](https://github.com/sponsors/jcfischer)

---

## Links

- [InVisible GmbH](https://invisible.ch) - Company behind SpecFlow Bundle
- [Product Page](https://projects.invisible.ch/specflow/) - Full documentation
- [Supertag CLI](https://projects.invisible.ch/supertag-cli/) - Our Tana CLI tool
- [pai-deps](https://github.com/jcfischer/pai-deps) - Dependency management

---

## License

MIT License - Use it, modify it, build on it.

---

Built with 35+ years of experience in complex IT environments.
