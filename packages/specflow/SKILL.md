---
name: SpecFlow
context: fork
skills:
  - SpecKit
description: Multi-agent orchestration for spec-driven development. USE WHEN building complete applications feature-by-feature, OR user says "decompose app", "run features", "specflow", OR wants automated multi-feature implementation with fresh context per feature.
---

# SpecFlow - Multi-Agent Spec-Driven Development

Extends SpecKit with feature decomposition, queue management, and fresh-context agent execution. Enables building complete applications feature-by-feature with automatic progress tracking and resumability.

Inspired by [Autocoder](https://github.com/leonvanzyl/autocoder)'s two-agent pattern, adapted for PAI's CLI-first architecture.

## CRITICAL: Phase Gates (READ THIS FIRST)

**NEVER write implementation code before completing phases IN ORDER.**

**ALWAYS use `specflow` CLI commands - NEVER create spec files manually.**

When asked to "implement F-XXX" or "work on F-XXX":

1. **FIRST** - Run `specflow specify F-XXX`
   - This creates spec.md AND registers the spec_path in features.db
   - Do NOT manually create the spec directory or files

2. **SECOND** - Run `specflow plan F-XXX`
   - This creates plan.md with proper validation
   - Do NOT manually create plan.md

3. **THIRD** - Run `specflow tasks F-XXX`
   - This creates tasks.md with proper validation
   - Do NOT manually create tasks.md

4. **ONLY THEN** - Begin writing code

5. **FINALLY** - Run `specflow complete F-XXX`
   - This validates all files exist and marks the feature complete

```bash
# CORRECT workflow - USE THE CLI + pai-deps
specflow specify F-019    # Creates spec.md + registers in DB

# If modifying existing tool, get context first:
pai-deps speckit context <tool> --json  # For system context section
pai-deps speckit failures <tool> --json  # For failure modes
pai-deps blast-radius <tool> --json      # Check impact before changes

specflow plan F-019       # Creates plan.md (THINK before coding)
specflow tasks F-019      # Creates tasks.md (BREAKDOWN before coding)

# NOW implement, then register with pai-deps:
pai-deps init <path>              # Generate pai-manifest.yaml
pai-deps register <path>          # Register in dependency graph
pai-deps verify <tool>            # Verify contracts
pai-deps chain-reliability <tool> # Check > 80% reliability

specflow complete F-019   # Validates and marks complete

# WRONG - never do this
mkdir .specify/specs/f-019-feature
echo "# spec" > spec.md   # WRONG: doesn't register in features.db
# Results in "No spec path configured" errors
```

**Why use the CLI:** The specflow commands register the spec_path in features.db. Manually creating files bypasses this registration, causing `specflow complete` to fail with "No spec path configured".

**Why phases matter:** The planning phase catches architectural mistakes BEFORE you write code. Skipping it leads to rework. Creating plan/tasks AFTER implementation defeats the purpose - you're documenting what you did, not planning what to do.

**The plan.md is not documentation - it's a thinking tool.**

---

## Core Concept

```
APP SPEC (SpecKit Interview)
    ↓
DECOMPOSITION (App → Features + Chain Reliability Analysis)
    ↓
FEATURE QUEUE (SQLite + files)
    ↓
FOR EACH FEATURE:
    SPECIFY → PLAN → TASKS → IMPLEMENT → VERIFY (Doctorow Gate)
    ↓
COMPLETION (Tests pass, Doctorow Gate passed, debt recorded)
```

**Each feature goes through SpecKit's phases with the Doctorow Gate before marking complete.**

### The Doctorow Principle

> "Code is a liability, not an asset. Probabilities are multiplicative."

SpecFlow tracks not just features but their **reliability chain**:
- Features form dependency chains
- Each feature has an estimated reliability
- Chain reliability = product of individual reliabilities
- Deep chains (5+ features) are flagged as high-risk

## Quick Start

**Projects should be created in `~/work/`** (not ~/Projects or other locations).

### Option A: With Interview (Recommended)

```bash
# 0. Create project in ~/work
mkdir -p ~/work/my-app && cd ~/work/my-app

# 1. Run init with description → outputs Interview prompt
specflow init "A todo app with recurring tasks and calendar sync"

# 2. Use Task tool with the prompt (runs Interview, creates app-context.md + features.json)

# 3. Initialize database with generated features
specflow init --from-features features.json

# 4. View queue
specflow status

# 5. Run SpecKit phases (specify uses app-context, skips re-interview)
specflow specify F-1    # Creates spec.md (no interview - uses app context)
specflow plan F-1       # Creates plan.md
specflow tasks F-1      # Creates tasks.md

# 6. Validate and implement (enforced workflow)
specflow validate F-1   # Check all files exist
specflow implement --feature F-1  # Get prompt (validates first)
# Use Task tool with prompt
specflow complete F-1   # Mark done (validates files exist)
```

### Option B: Direct Features (Testing/Quick Start)

```bash
# Create features.json manually
cat > features.json << 'EOF'
[
  {"id": "F-1", "name": "Core data model", "description": "SQLite schema", "dependencies": [], "priority": 1},
  {"id": "F-2", "name": "CLI commands", "description": "Add/list commands", "dependencies": ["F-1"], "priority": 2}
]
EOF

# Initialize directly
specflow init --from-features features.json
```

## CLI Commands

| Command | Purpose |
|---------|---------|
| `specflow init` | Initialize project with features |
| `specflow add <name> <desc>` | **Add a new feature to the queue** |
| `specflow remove <id>` | **Remove a feature from the queue** |
| `specflow edit <id>` | **Edit feature priority/name/description** |
| `specflow status` | Show feature queue, phases, and progress |
| `specflow specify <id>` | Run SPECIFY phase (interview + spec.md) |
| `specflow plan <id>` | Run PLAN phase (plan.md) |
| `specflow tasks <id>` | Run TASKS phase (tasks.md) |
| `specflow validate [id]` | **Validate that all phases are complete** |
| `specflow implement` | **Generate prompt (validates phases first)** |
| `specflow run` | Show implementation guidance and next steps |
| `specflow next` | Output prompt for Task tool (no validation) |
| `specflow complete <id>` | **Mark complete (validates files exist)** |
| `specflow skip <id>` | Skip blocked feature (move to end) |
| `specflow reset <id>` | Reset feature to pending |
| `specflow phase <id> [phase]` | **Get/set phase via CLI (never edit DB directly)** |

### Enforcement Commands (NEW)

These commands enforce the SpecFlow workflow to prevent skipping phases:

- **`specflow validate`** - Check that spec.md, plan.md, tasks.md exist
- **`specflow implement`** - Like `next` but refuses if files are missing
- **`specflow complete`** - Refuses to mark complete if files are missing (use `--force` to bypass)
- **`specflow phase`** - Update phase via CLI when manually writing spec files

### phase

Use `phase` to update the feature phase when manually creating spec files:

```bash
# Show current phase
specflow phase F-1

# Set phase after manually creating spec.md
specflow phase F-1 specify --spec-path .specify/specs/f-1-feature-name

# Set phase to tasks (ready for implementation)
specflow phase F-1 tasks
```

**IMPORTANT:** Never update the database directly with SQL. Always use CLI commands.

### complete

The `complete` command now reminds you to commit your changes:

```bash
specflow complete F-1

# Output:
# ✓ Marked F-1 as complete
# Progress: 5/10 features (50%)
#
# 📝 Don't forget to commit your changes:
#    git add -A && git commit -m "feat(F-1): Feature name"
```

### init

```bash
# With description: outputs Interview prompt for Task tool
specflow init "A music player with playlist management"
# → Creates prompt that runs Interview, creates app-context.md + features.json
# → Then run: specflow init --from-features features.json

# From features file (for testing or manual feature lists)
specflow init --from-features features.json

# From existing spec (uses Claude to decompose)
specflow init --from-spec .specify/specs/app/spec.md

# Force overwrite existing database
specflow init --from-features features.json --force
```

**Interview Mode:** When given a description, init outputs a prompt for Task tool that:
1. Runs the Interview skill (8 phases of requirements gathering)
2. Creates `.specify/app-context.md` with gathered requirements
3. Decomposes into `features.json`

This app context is then used by `specflow specify` to skip re-interviewing.

### add

Add a new feature to the queue after initialization:

```bash
# Add with default priority (999)
specflow add "Feature name" "Feature description"

# Add with specific priority
specflow add "Critical feature" "Must be done first" --priority 1
```

Auto-generates the next F-XXX ID based on existing features (e.g., F-027).
**Use this instead of direct database manipulation.**

### remove

Remove a feature from the queue entirely:

```bash
# Remove a pending feature
specflow remove F-026

# Force removal (for completed features or those with spec files)
specflow remove F-026 --force
```

**Note:** This does NOT delete spec files from `.specify/specs/`. Delete those manually if needed.

### edit

Edit feature properties:

```bash
# Change priority
specflow edit F-026 --priority 9

# Change name
specflow edit F-026 --name "New feature name"

# Change description
specflow edit F-026 --description "Updated description"

# Multiple changes at once
specflow edit F-026 --priority 5 --name "Better name"
```

### status

```bash
# Human-readable output
specflow status

# JSON output for scripting
specflow status --json
```

Output includes **Chain Reliability Analysis**:
```
Chain Reliability Analysis:
─────────────────────────────
F-1 (95%) → F-2 (95%) → F-3 (95%) = 85.7% compound
F-1 (95%) → F-4 (90%) → F-8 (95%) → F-9 (90%) = 73.1% compound ⚠️

Risk Levels:
  >80%: Low risk
  60-80%: Moderate risk ⚠️
  <60%: High risk 🔴 (consider adding error boundaries)
```

### run

Shows implementation guidance and next steps:

```bash
specflow run
```

Output shows:
- Features needing SpecKit phases (specify/plan/tasks)
- Features ready to implement
- Commands to run next

### next

Outputs the prompt for use with Task tool (spawns fresh-context subagent):

```bash
# Get prompt for next ready feature
specflow next

# Get prompt for specific feature
specflow next --feature F-1

# JSON output (for scripting)
specflow next --json
```

**Usage in Claude Code:**
1. Run `specflow next` to get the implementation prompt
2. Use Task tool with the prompt (subagent gets fresh context)
3. After completion, run `specflow complete <id>`

### complete

Mark a feature as complete after implementation:

```bash
specflow complete F-1
```

### skip / reset

```bash
# Skip a blocked feature
specflow skip F-3

# Reset a feature to pending
specflow reset F-1

# Reset all features
specflow reset --all
```

## Architecture

```
SpecFlow/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── types.ts              # Type definitions (incl. SpecPhase)
│   ├── lib/
│   │   ├── database.ts       # SQLite operations + phase tracking
│   │   └── decomposer.ts     # App → features
│   └── commands/
│       ├── init.ts           # Initialize project
│       ├── status.ts         # Show queue + phases
│       ├── specify.ts        # SPECIFY phase
│       ├── plan.ts           # PLAN phase
│       ├── tasks.ts          # TASKS phase
│       ├── run.ts            # Show guidance
│       ├── next.ts           # Output Task tool prompt
│       ├── validate.ts       # Validate phase completion (NEW)
│       ├── implement.ts      # Validated implementation prompt (NEW)
│       ├── complete.ts       # Mark feature done (with validation)
│       ├── skip.ts           # Skip feature
│       └── reset.ts          # Reset feature
├── prompts/
│   ├── decompose.md          # Decomposition prompt
│   └── implement.md          # Implementation prompt
└── tests/                    # 75+ tests
```

## Project Structure

A SpecFlow project contains:

```
my-app/
├── .specflow/
│   └── features.db       # SQLite database (feature queue)
├── features.json         # Generated feature list (input to init)
└── .specify/
    ├── app-context.md    # App-level requirements (from init interview)
    └── specs/
        ├── f-1-feature-name/
        │   ├── spec.md   # Feature specification
        │   ├── plan.md   # Technical plan
        │   ├── tasks.md  # Implementation tasks
        │   └── docs.md   # Documentation updates record
        └── f-2-another/
            └── ...
```

**app-context.md** is created during init interview and contains:
- Problem statement and user context
- Constraints and requirements
- Success criteria
- Scope boundaries

This context is loaded by `specflow specify` to avoid re-interviewing.

### PAI Context for Subagents

When `specflow next` generates implementation prompts, it automatically includes:
- Stack preferences (TypeScript, Bun, not npm/yarn)
- Development conventions (simple, no over-engineering)
- Verification steps (`bun test`, `bun run typecheck`)
- Available skills reference

This ensures Task tool subagents follow PAI conventions even with fresh context.

## Key Design Principles

1. **CLI-First**: All operations via command line (no MCP)
2. **Fresh Context**: Each feature implemented via Task tool subagent (isolated context)
3. **PAI-Aware Subagents**: Implementation prompts include PAI stack preferences and conventions
4. **Interview Once**: App-level interview during init; features use that context
5. **Persistence**: SQLite for queue, git for code
6. **TDD Enforced**: Agent must follow test-first development
7. **Resumable**: Interrupt anytime, continue where you left off
8. **Project Location**: Always create projects in `~/work/`
9. **No Subprocess Spawning**: Uses Claude's Task tool instead of spawning claude CLI
10. **Doctorow Gate**: Every feature must pass failure verification before completion
11. **Chain Reliability**: Track compound reliability of feature dependency chains
12. **Debt Tracking**: Every completed feature adds entry to debt-ledger.md
13. **Phase Enforcement**: `validate`, `implement`, and `complete` commands verify files exist before proceeding - prevents LLM from skipping workflow phases
14. **Plan Before Code**: NEVER write implementation code before plan.md and tasks.md exist - creating them afterward defeats spec-driven development

## Feature States

### Status (overall)
| Status | Meaning |
|--------|---------|
| `pending` | Not yet started |
| `in_progress` | Currently being implemented |
| `complete` | Tests pass, implementation done |
| `skipped` | Moved to end of queue (blocked) |

### Phase (SpecKit workflow)
| Phase | Meaning |
|-------|---------|
| `none` | Not yet specified |
| `specify` | Spec created (spec.md) |
| `plan` | Plan created (plan.md) |
| `tasks` | Tasks created (tasks.md) - ready for implementation |
| `implement` | Implementation in progress |

**The runner only implements features that have completed the `tasks` phase.**

## Completion Markers

The runner detects these markers in agent output:

```
[FEATURE COMPLETE]
Feature: F-1 - Core model
Tests: 5 passing
Files: src/model.ts, tests/model.test.ts
Doctorow Gate: PASSED
  - Failure test: ✓ Graceful degradation on DB unavailable
  - Rollback test: ✓ Can disable without breaking F-2
  - Debt recorded: ✓ Score 4 added to debt-ledger.md
```

```
[FEATURE BLOCKED]
Feature: F-2 - API integration
Reason: External API credentials not configured
```

```
[DOCTOROW GATE FAILED]
Feature: F-3 - Notification service
Reason: No graceful degradation when email service unavailable
Fix: Add circuit breaker and fallback to queue
```

## Integration with SpecKit

SpecFlow enforces SpecKit's 4-phase workflow for each feature:

```bash
# Phase 1: SPECIFY - Interview + requirements
specflow specify F-1
# Creates: .specify/specs/f-1-feature-name/spec.md

# Phase 2: PLAN - Technical design
specflow plan F-1
# Creates: .specify/specs/f-1-feature-name/plan.md

# Phase 3: TASKS - Implementation breakdown
specflow tasks F-1
# Creates: .specify/specs/f-1-feature-name/tasks.md

# Phase 4: IMPLEMENT - Via Task tool subagent (ENFORCED)
specflow validate F-1      # Verify all files exist
specflow implement --feature F-1  # Get prompt (refuses if files missing)
# Use Task tool with prompt (fresh context)
specflow complete F-1      # Mark done (validates files first)
```

Each phase creates files in:
```
.specify/specs/<id>-<feature>/
├── spec.md     # Requirements (Phase 1)
├── plan.md     # Technical design (Phase 2)
├── tasks.md    # Implementation steps (Phase 3)
└── docs.md     # Documentation updates (required for completion)
```

**docs.md format:**
```markdown
# Documentation Updates for F-XXX

## Files Updated
- README.md: Added new command to commands table
- src/commands/CLAUDE.md: Added command pattern notes
- CHANGELOG.md: Added entry for this feature

## New Documentation Created
- src/lib/CLAUDE.md: New file documenting library modules
```

**Running `specflow run` shows which features are ready and what commands to run next.**

## Running Tests

```bash
cd ~/.claude/skills/SpecFlow
bun test              # Run all tests
bun test --watch      # Watch mode
bun run typecheck     # TypeScript check
```
